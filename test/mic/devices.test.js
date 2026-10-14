import { test } from "node:test";
import assert from "node:assert/strict";
import { detectMicInventory } from "../../scripts/detectors/mic/inventory.js";
import { detectMicLabels } from "../../scripts/detectors/mic/labelHints.js";
import { detectTrackShape } from "../../scripts/detectors/mic/trackShape.js";

const device = (kind, deviceId, label, groupId = deviceId + "-g") => ({ kind, deviceId, label, groupId });

const realMic = device("audioinput", "a1", "Microphone (Realtek(R) Audio)", "realtek");
const speakers = device("audiooutput", "o1", "Speakers (Realtek(R) Audio)", "realtek");
const cable = device("audioinput", "a2", "CABLE Output (VB-Audio Virtual Cable)");
const defaultEntry = device("audioinput", "default", "Default - Microphone (Realtek(R) Audio)", "realtek");

const CAPS = { echoCancellation: [true, false], noiseSuppression: [true, false], autoGainControl: [true, false], sampleRate: { min: 48000, max: 48000 } };
const SUPPORTED = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

// ---------- 2. inventory ----------
test("inventory: Chrome's default entry isn't counted as a second mic", () => {
    const result = detectMicInventory([defaultEntry, realMic, speakers]);
    assert.deepEqual([result.label, result.data.micCount], ["1 microphone", 1]);
});

test("inventory: several inputs is a warning, not a flag", () => {
    assert.equal(detectMicInventory([realMic, cable]).state, "warn");
});

test("inventory: no device list is unsupported", () => {
    assert.equal(detectMicInventory(null).data.supported, false);
});

// ---------- 4. labels ----------
test("labels: a virtual cable in use is a strong flag", () => {
    const result = detectMicLabels([realMic, cable], cable.label);
    assert.deepEqual([result.label, result.data.flag], ["virtual mic in use", "strong"]);
});

test("labels: Stereo Mix records the speakers, not the room", () => {
    const result = detectMicLabels([], "Stereo Mix (Realtek(R) Audio)");
    assert.deepEqual([result.label, result.data.flag], ["loopback input", "strong"]);
});

test("labels: a noise-removal mic is context, not a flag", () => {
    const result = detectMicLabels([], "Microphone (NVIDIA Broadcast)");
    assert.deepEqual([result.label, result.data.flag], ["processed mic", null]);
});

test("labels: a cable installed but not in use is only noted", () => {
    const result = detectMicLabels([defaultEntry, realMic, cable], defaultEntry.label);
    assert.deepEqual([result.label, result.data.flag], ["virtual audio installed", null]);
});

test("labels: a USB ID is reported for a plain mic", () => {
    assert.equal(detectMicLabels([], "Microphone (C920) (046d:082d)").label, "usb id present");
});

test("labels: nothing to read before permission", () => {
    assert.equal(detectMicLabels([device("audioinput", "a1", "")], "").state, "unknown");
});

// ---------- 5. track shape ----------
test("track shape: a listed capture track sharing a groupId with speakers", () => {
    const result = detectTrackShape({
        settings: { deviceId: "a1", groupId: "realtek", sampleRate: 48000, echoCancellation: false },
        capabilities: CAPS,
        devices: [realMic, speakers],
        supportedConstraints: SUPPORTED
    });
    assert.deepEqual([result.label, result.data.flag], ["capture + paired", null]);
});

test("track shape: a track built from Web Audio has no deviceId", () => {
    const result = detectTrackShape({ settings: {}, capabilities: {}, devices: [realMic], supportedConstraints: SUPPORTED });
    assert.deepEqual([result.label, result.data.flag], ["no device id", "weak"]);
});

test("track shape: Chrome's Web Audio destination track is a strong flag", () => {
    // As Chrome reports a MediaStreamAudioDestinationNode's track.
    const result = detectTrackShape({
        settings: { deviceId: "WebAudio-a700cfdf", sampleRate: 48000, sampleSize: 16, channelCount: 2 },
        capabilities: { echoCancellation: [false], noiseSuppression: [false], autoGainControl: [false] },
        devices: [realMic],
        supportedConstraints: SUPPORTED
    });
    assert.deepEqual([result.label, result.data.flag], ["web audio track", "strong"]);
});

test("track shape: processing that can only be off isn't offered", () => {
    const result = detectTrackShape({
        settings: { deviceId: "a1" },
        capabilities: { echoCancellation: [false], noiseSuppression: [false], autoGainControl: [false] },
        devices: [realMic],
        supportedConstraints: SUPPORTED
    });
    assert.equal(result.label, "no processing caps");
});

test("track shape: a deviceId missing from the device list", () => {
    const result = detectTrackShape({ settings: { deviceId: "zz" }, capabilities: CAPS, devices: [realMic], supportedConstraints: SUPPORTED });
    assert.equal(result.label, "unlisted device");
});

test("track shape: no processing capabilities where the browser offers them", () => {
    const result = detectTrackShape({ settings: { deviceId: "a1" }, capabilities: {}, devices: [realMic], supportedConstraints: SUPPORTED });
    assert.deepEqual([result.label, result.data.flag], ["no processing caps", "weak"]);
});

test("track shape: browser processing left on is reported", () => {
    const result = detectTrackShape({
        settings: { deviceId: "a1", noiseSuppression: true },
        capabilities: CAPS,
        devices: [realMic],
        supportedConstraints: SUPPORTED
    });
    assert.deepEqual(result.data.processingLeftOn, ["noiseSuppression"]);
});
