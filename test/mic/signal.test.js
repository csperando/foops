import { test } from "node:test";
import assert from "node:assert/strict";
import { fft } from "../../scripts/detectors/mic/fft.js";
import { analyzeNoiseFloor } from "../../scripts/detectors/mic/noiseFloor.js";
import { analyzeBandwidth } from "../../scripts/detectors/mic/bandwidth.js";
import { analyzeResolution } from "../../scripts/detectors/mic/resolution.js";
import { analyzeAnalogTraits } from "../../scripts/detectors/mic/analogTraits.js";
import { analyzeRepeats } from "../../scripts/detectors/mic/repeats.js";
import { RATE, LENGTH, noise, bandLimited, add, sine, quantize, gated } from "../helpers/audio.js";

const OFF = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
// A microphone in a quiet room: self-noise, plus speech-band sound on top.
const mic = add(noise(LENGTH, -70, 1), gated(bandLimited(4000, { db: -30 })));
const tts = gated(bandLimited(8000, { db: -25 }));

test("fft: inverse undoes forward", () => {
    const re = Float64Array.from({ length: 16 }, (_, i) => Math.sin(i) + i / 7), im = new Float64Array(16);
    const original = [...re];
    fft(re, im);
    fft(re, im, true);
    re.forEach((x, i) => assert.ok(Math.abs(x / 16 - original[i]) < 1e-12));
});

// ---------- 6. noise floor ----------
test("noise floor: a microphone's self-noise never drops to zero", () => {
    const result = analyzeNoiseFloor({ samples: mic, sampleRate: RATE, processing: OFF });
    assert.equal(result.state, "yes");
    assert.equal(result.data.flag, null);
    assert.equal(result.data.silentWindows, 0);
});

test("noise floor: digital silence between words is a strong flag", () => {
    const result = analyzeNoiseFloor({ samples: tts, sampleRate: RATE, processing: OFF });
    assert.equal(result.label, "digital silence");
    assert.equal(result.data.flag, "strong");
});

test("noise floor: silence is only weak when the browser's processing stayed on", () => {
    const result = analyzeNoiseFloor({ samples: tts, sampleRate: RATE, processing: { ...OFF, noiseSuppression: true } });
    assert.equal(result.data.flag, "weak");
});

test("noise floor: all zeros reads as muted, not proof", () => {
    const result = analyzeNoiseFloor({ samples: new Float32Array(RATE), sampleRate: RATE, processing: OFF });
    assert.deepEqual([result.label, result.data.flag], ["all zeros", "weak"]);
});

test("noise floor: quieter than any ADC is a weak flag", () => {
    const result = analyzeNoiseFloor({ samples: noise(RATE, -120), sampleRate: RATE, processing: OFF });
    assert.deepEqual([result.label, result.data.flag], ["too clean", "weak"]);
});

test("noise floor: too little audio is unknown", () => {
    assert.equal(analyzeNoiseFloor({ samples: new Float32Array(100), sampleRate: RATE }).state, "unknown");
});

// ---------- 7. bandwidth ----------
test("bandwidth: a microphone's noise fills the whole band", () => {
    const result = analyzeBandwidth({ samples: mic, sampleRate: RATE });
    assert.deepEqual([result.label, result.data.flag], ["full band", null]);
});

test("bandwidth: 16 kHz audio resampled to 48 kHz is a strong flag", () => {
    const result = analyzeBandwidth({ samples: tts, sampleRate: RATE });
    assert.equal(result.data.flag, "strong");
    assert.equal(result.data.impliedSourceRate, 16000);
    assert.ok(Math.abs(result.data.cutoffHz - 8000) < 100, `cutoff ${result.data.cutoffHz}`);
});

test("bandwidth: a 22.05 kHz source is caught too", () => {
    const result = analyzeBandwidth({ samples: bandLimited(11025), sampleRate: RATE });
    assert.equal(result.data.impliedSourceRate, 22050);
});

test("bandwidth: the ADC's own cutoff near the top of the band isn't flagged", () => {
    assert.equal(analyzeBandwidth({ samples: bandLimited(21000), sampleRate: RATE }).data.flag, null);
});

test("bandwidth: a Bluetooth headset in call mode is narrowband for real", () => {
    const result = analyzeBandwidth({ samples: tts, sampleRate: RATE, deviceLabel: "Headset (WH-1000XM4 Hands-Free AG Audio)" });
    assert.deepEqual([result.label, result.data.flag], ["narrowband device", null]);
});

test("bandwidth: silence is unknown", () => {
    assert.equal(analyzeBandwidth({ samples: new Float32Array(RATE), sampleRate: RATE }).state, "unknown");
});

// ---------- 8. resolution ----------
test("resolution: a 16-bit grid is normal", () => {
    const result = analyzeResolution({ samples: quantize(noise(RATE, -40), 16) });
    assert.deepEqual([result.label, result.data.flag], ["16-bit", null]);
});

test("resolution: a volume-scaled 16-bit grid is still recognized", () => {
    const result = analyzeResolution({ samples: quantize(noise(RATE, -40), 16, 0.7) });
    assert.ok(Math.abs(result.data.bits - (16 + Math.log2(1 / 0.7))) < 0.05, `bits ${result.data.bits}`);
    assert.equal(result.data.flag, null);
});

test("resolution: an 8-bit grid is coarser than any ADC", () => {
    const result = analyzeResolution({ samples: quantize(noise(RATE, -20), 8) });
    assert.deepEqual([result.label, result.data.flag], ["8-bit", "weak"]);
});

test("resolution: float audio has no grid", () => {
    assert.equal(analyzeResolution({ samples: noise(RATE, -40) }).label, "fine");
});

test("resolution: near-silence is unknown", () => {
    assert.equal(analyzeResolution({ samples: new Float32Array(RATE) }).state, "unknown");
});

// ---------- 9. analog traces ----------
test("analog: 60 Hz hum and its harmonics are found", () => {
    let samples = noise(LENGTH, -70);
    for (const [hz, db] of [[60, -55], [120, -60], [180, -62]]) samples = add(samples, sine(hz, db));
    const result = analyzeAnalogTraits({ samples, sampleRate: RATE });
    assert.equal(result.data.humHz, 60);
    assert.equal(result.state, "yes");
});

test("analog: a DC offset is found", () => {
    const result = analyzeAnalogTraits({ samples: noise(LENGTH, -70).map((x) => x + 0.002), sampleRate: RATE });
    assert.deepEqual([result.label, result.data.analog], ["dc offset", true]);
});

test("analog: clean noise has no traces, and that's not a flag", () => {
    const result = analyzeAnalogTraits({ samples: noise(LENGTH, -70), sampleRate: RATE });
    assert.deepEqual([result.state, result.data.flag, result.data.analog], ["unknown", null, false]);
});

// ---------- 10. exact repeats ----------
test("repeats: a microphone recording never repeats", () => {
    const result = analyzeRepeats({ samples: mic, sampleRate: RATE });
    assert.deepEqual([result.label, result.data.flag], ["no repeats", null]);
});

test("repeats: a looped room-noise clip is a strong flag", () => {
    const clip = noise(RATE, -60, 5);
    const looped = Float32Array.from({ length: 3 * RATE }, (_, i) => clip[i % RATE]);
    const result = analyzeRepeats({ samples: looped, sampleRate: RATE });
    assert.equal(result.data.flag, "strong");
    assert.equal(result.data.lagMs, 1000);
    assert.equal(result.data.repeatMs, 2000);
});

test("repeats: a generated tone repeats every cycle, and stays fast", () => {
    const cycle = Float32Array.from({ length: 48 }, (_, i) => 0.1 * Math.sin((2 * Math.PI * i) / 48));
    const tone = Float32Array.from({ length: LENGTH }, (_, i) => cycle[i % 48]);
    const started = Date.now();
    const result = analyzeRepeats({ samples: tone, sampleRate: RATE });
    assert.equal(result.data.flag, "strong");
    assert.ok(Date.now() - started < 2000);
});

test("repeats: sparse 16-bit near-silence doesn't match by chance", () => {
    const result = analyzeRepeats({ samples: quantize(noise(LENGTH, -96), 16), sampleRate: RATE });
    assert.equal(result.data.flag, null);
});
