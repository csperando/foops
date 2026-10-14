// Synthetic recordings for the mic page's signal checks. Deterministic, so
// a failing test fails the same way every run.
import { fft } from "../../scripts/detectors/mic/fft.js";

export const RATE = 48000;
export const LENGTH = 1 << 18; // ~5.5 s at 48 kHz

export function rng(seed = 1) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Gaussian noise at an RMS level in dBFS.
export function noise(n = LENGTH, db = -70, seed = 1) {
    const random = rng(seed);
    const rms = 10 ** (db / 20);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i += 2) {
        const r = Math.sqrt(-2 * Math.log(random() + 1e-12)), a = 2 * Math.PI * random();
        out[i] = rms * r * Math.cos(a);
        if (i + 1 < n) out[i + 1] = rms * r * Math.sin(a);
    }
    return out;
}

// Noise with nothing at all above `cutoffHz`, like audio made at a lower
// rate and resampled up. `n` must be a power of two.
export function bandLimited(cutoffHz, { n = LENGTH, db = -30, seed = 2 } = {}) {
    const random = rng(seed);
    const re = new Float64Array(n), im = new Float64Array(n);
    const top = Math.floor((cutoffHz / RATE) * n);
    for (let k = 1; k < top; k++) {
        const a = 2 * Math.PI * random();
        re[k] = Math.cos(a);
        im[k] = Math.sin(a);
        re[n - k] = re[k];
        im[n - k] = -im[k];
    }
    fft(re, im, true);
    let sum = 0;
    for (const x of re) sum += x * x;
    const scale = 10 ** (db / 20) / Math.sqrt(sum / n);
    return Float32Array.from(re, (x) => x * scale);
}

export function add(a, b) {
    return a.map((x, i) => x + b[i]);
}

export function sine(hz, db, n = LENGTH) {
    const amp = 10 ** (db / 20) * Math.SQRT2;
    return Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / RATE));
}

export function quantize(samples, bits, gain = 1) {
    const step = 2 / 2 ** bits;
    return samples.map((x) => Math.round(x / step) * step * gain);
}

// Speech-like bursts: `signal` during the on-periods, exact zeros between.
export function gated(signal, onMs = 400, offMs = 200) {
    const on = (onMs * RATE) / 1000, period = ((onMs + offMs) * RATE) / 1000;
    return signal.map((x, i) => (i % period < on ? x : 0));
}
