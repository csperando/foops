import { $, setBadge, renderCard } from "./ui/dom.js";
import { renderMicHero } from "./ui/micHero.js";
import { renderMicRaw } from "./ui/micRaw.js";
import { checkPermissionState } from "./detectors/permissions.js";
import { detectVmSignal } from "./detectors/vmSignal.js";
import {
    isMicSupported, startMic, getAudioTrack, listDevices, recordSamples, trackSettings, trackCapabilities, trackLabel
} from "./detectors/mic/stream.js";
import { getPristine } from "./integrity/pristine.js";
import { detectMicInventory, physicalInputs } from "./detectors/mic/inventory.js";
import { detectMicApiIntegrity } from "./detectors/mic/apiIntegrity.js";
import { detectMicLabels } from "./detectors/mic/labelHints.js";
import { detectTrackShape } from "./detectors/mic/trackShape.js";
import { analyzeNoiseFloor } from "./detectors/mic/noiseFloor.js";
import { analyzeBandwidth } from "./detectors/mic/bandwidth.js";
import { analyzeResolution } from "./detectors/mic/resolution.js";
import { analyzeAnalogTraits } from "./detectors/mic/analogTraits.js";
import { analyzeRepeats } from "./detectors/mic/repeats.js";

// Create the pristine realm before anything else on the page runs, so it's
// captured as early as possible.
getPristine();

const RECORD_SECONDS = 6;

// Latest result per card, read by the hero to combine them into one verdict.
const results = { recorded: false };
let devices = null;
let recording = null;
let busy = false;

function trackFacts() {
    const track = getAudioTrack();
    if (!track) return { track: null, settings: null, capabilities: null };
    return { track, settings: trackSettings(track), capabilities: trackCapabilities(track) };
}

function refreshSummary() {
    renderMicHero(results);
    renderMicRaw({ devices, ...trackFacts(), recording });
}

function fillDeviceSelect() {
    const select = $("sel-mic");
    const chosen = select.value;
    const inputs = physicalInputs(devices);
    select.replaceChildren(new Option("Default microphone", ""));
    inputs.forEach((d, i) => select.add(new Option(d.label || `Microphone ${i + 1}`, d.deviceId)));
    if (inputs.some((d) => d.deviceId === chosen)) select.value = chosen;
}

// Cards 2-5 all reason about the same enumerateDevices() snapshot.
async function refreshDevices() {
    devices = await listDevices();
    fillDeviceSelect();
    results.inventory = renderCard("badge-inventory", "out-inventory", detectMicInventory(devices));
    results.integrity = renderCard("badge-api", "out-api", await detectMicApiIntegrity());
    const { track, settings, capabilities } = trackFacts();
    if (track) {
        results.labels = renderCard("badge-labels", "out-labels", detectMicLabels(devices, trackLabel(track)));
        results.shape = renderCard("badge-shape", "out-shape", detectTrackShape({
            settings,
            capabilities,
            devices,
            supportedConstraints: navigator.mediaDevices.getSupportedConstraints()
        }));
    }
    refreshSummary();
}

const SIGNAL_CARDS = [
    ["noise", "badge-noise", "out-noise"],
    ["bandwidth", "badge-bandwidth", "out-bandwidth"],
    ["resolution", "badge-resolution", "out-resolution"],
    ["analog", "badge-analog", "out-analog"],
    ["repeats", "badge-repeats", "out-repeats"]
];

// Cards 6-10 analyze the same recording.
async function analyzeRecording() {
    const track = getAudioTrack();
    for (const [, badge, out] of SIGNAL_CARDS) {
        setBadge($(badge), "unknown", "recording");
        $(out).textContent = `Recording ${RECORD_SECONDS} seconds…`;
    }
    recording = await recordSamples(track, RECORD_SECONDS, (done) => {
        $("out-mic").textContent = `Recording from ${trackLabel(track) || "(unlabeled track)"}… ${Math.round(done * 100)}%`;
    });
    $("out-mic").textContent = `Recorded ${(recording.samples.length / recording.sampleRate).toFixed(1)} s from ${trackLabel(track) || "(unlabeled track)"} at ${recording.sampleRate} Hz.`;

    const settings = trackSettings(track);
    const input = {
        ...recording,
        deviceLabel: trackLabel(track),
        processing: settings
    };
    const analyses = {
        noise: analyzeNoiseFloor,
        bandwidth: analyzeBandwidth,
        resolution: analyzeResolution,
        analog: analyzeAnalogTraits,
        repeats: analyzeRepeats
    };
    for (const [key, badge, out] of SIGNAL_CARDS) {
        results[key] = renderCard(badge, out, analyses[key](input));
    }
    results.recorded = true;
    refreshSummary();
}

function watchTrack(track) {
    const badge = $("badge-mic");
    track.addEventListener("ended", () => {
        setBadge(badge, "warn", "ended");
        $("out-mic").textContent = "The microphone track ended (unplugged, or stopped by the source).";
    });
    track.addEventListener("mute", () => setBadge(badge, "warn", "muted"));
    track.addEventListener("unmute", () => setBadge(badge, "yes", "live"));
}

async function run() {
    if (busy) return;
    busy = true;
    const btn = $("btn-mic");
    const badge = $("badge-mic");
    btn.disabled = true;
    $("sel-mic").disabled = true;

    try {
        if (!isMicSupported()) {
            setBadge(badge, "unknown", "unsupported");
            $("out-mic").textContent = "getUserMedia isn't available here (it needs a secure context: https or localhost).";
            return;
        }
        const previous = getAudioTrack();
        const track = await startMic($("sel-mic").value || null);
        if (track !== previous) watchTrack(track);
        setBadge(badge, "yes", "live");
        await refreshDevices();
        await analyzeRecording();
        btn.textContent = "Record again";
    } catch (err) {
        setBadge(badge, "warn", "denied/error");
        $("out-mic").textContent = "Microphone denied or unavailable: " + err.message;
    } finally {
        busy = false;
        btn.disabled = false;
        $("sel-mic").disabled = false;
    }
}

async function renderPermissionCard() {
    const { status, result } = await checkPermissionState("microphone");
    renderCard("badge-perm", "out-perm", result);
    if (status) {
        status.onchange = () => {
            renderPermissionCard();
            refreshDevices();
        };
    }
}

$("btn-mic").addEventListener("click", run);
// Picking another input re-runs everything on it.
$("sel-mic").addEventListener("change", () => {
    if (results.recorded) run();
});

renderPermissionCard();
renderCard("badge-vm", "out-vm", detectVmSignal());
refreshDevices();

// React live to inputs being plugged in, unplugged, or a virtual device
// being installed while the page is open.
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", refreshDevices);
}
