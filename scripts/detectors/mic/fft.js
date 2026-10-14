// ---------- FFT + averaged power spectrum ----------
// Pure helpers for the mic page's spectral cards; no browser APIs, so they
// run under node --test.

// In-place iterative radix-2 FFT. `re` and `im` are Float64Arrays whose
// length is a power of two. `inverse` computes the unscaled inverse.
export function fft(re, im, inverse = false) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            [re[i], re[j]] = [re[j], re[i]];
            [im[i], im[j]] = [im[j], im[i]];
        }
    }
    for (let size = 2; size <= n; size <<= 1) {
        const angle = ((inverse ? 2 : -2) * Math.PI) / size;
        const wr = Math.cos(angle), wi = Math.sin(angle);
        for (let start = 0; start < n; start += size) {
            let cr = 1, ci = 0;
            for (let k = 0; k < size / 2; k++) {
                const a = start + k, b = a + size / 2;
                const tr = re[b] * cr - im[b] * ci;
                const ti = re[b] * ci + im[b] * cr;
                re[b] = re[a] - tr;
                im[b] = im[a] - ti;
                re[a] += tr;
                im[a] += ti;
                [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
            }
        }
    }
}

// Welch's method: Hann-windowed segments with 50% overlap, power averaged.
// Returns power per bin 0..size/2 (linear, not dB), the bin width in Hz and
// the window's power gain (white noise of variance v reads v * windowPower
// in every bin), or null when no segment was usable. `skip(start, size)`
// can leave segments out.
export function powerSpectrum(samples, sampleRate, size = 4096, skip = null) {
    if (samples.length < size) return null;
    const window = new Float64Array(size);
    let windowPower = 0;
    for (let i = 0; i < size; i++) {
        window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
        windowPower += window[i] * window[i];
    }

    const power = new Float64Array(size / 2 + 1);
    const re = new Float64Array(size), im = new Float64Array(size);
    let segments = 0;
    for (let start = 0; start + size <= samples.length; start += size / 2) {
        if (skip && skip(start, size)) continue;
        for (let i = 0; i < size; i++) {
            re[i] = samples[start + i] * window[i];
            im[i] = 0;
        }
        fft(re, im);
        for (let k = 0; k <= size / 2; k++) power[k] += re[k] * re[k] + im[k] * im[k];
        segments++;
    }
    if (segments === 0) return null;
    for (let k = 0; k < power.length; k++) power[k] /= segments;
    return { power, binHz: sampleRate / size, windowPower, segments };
}

export const toDb = (p) => 10 * Math.log10(p + 1e-30);
