// ---------- 8. Sample resolution (experimental) ----------
// Web Audio hands us 32-bit floats, but the values still carry the step size
// of whatever produced them: a 16-bit source only ever yields multiples of
// 1/32768 (scaled by any volume applied after it). Many real microphones
// are 16-bit too, so a 16-bit grid alone means nothing. A grid coarser than
// any ADC (12 bits or less) does: that audio was crushed somewhere — a
// telephony codec, a low-bit recording — before it reached the browser.
//
// Pure: takes the recorded samples, so it runs under node --test.

const COARSE_BITS = 12;
const ON_GRID = 0.99;
// Below this many distinct levels there's too little signal to find a step.
const MIN_LEVELS = 8;

export function analyzeResolution({ samples }) {
    const levels = new Set();
    if (samples) for (const x of samples) if (x !== 0) levels.add(x);
    if (levels.size < MIN_LEVELS) {
        return {
            state: "unknown",
            label: "too quiet",
            text: "Too few distinct sample values to measure a step size — the recording was silent or nearly so.",
            data: { flag: null, bits: null }
        };
    }

    // The smallest gap between neighboring values is the candidate step;
    // it only counts if (nearly) every sample is a whole multiple of it.
    const sorted = [...levels].sort((a, b) => a - b);
    let step = Infinity;
    for (let i = 1; i < sorted.length; i++) step = Math.min(step, sorted[i] - sorted[i - 1]);
    // That gap is itself rounded to float32, which is too coarse when the
    // grid was scaled by a volume. Refine it by least squares over the
    // whole-number multiples it implies.
    for (let pass = 0; pass < 2; pass++) {
        let xk = 0, kk = 0;
        for (const x of levels) {
            const k = Math.round(x / step);
            xk += x * k;
            kk += k * k;
        }
        if (kk > 0) step = xk / kk;
    }
    let onGrid = 0, nonZero = 0;
    for (const x of samples) {
        if (x === 0) continue;
        nonZero++;
        const q = x / step;
        if (Math.abs(q - Math.round(q)) < 1e-3) onGrid++;
    }
    const gridded = onGrid / nonZero >= ON_GRID;
    const bits = gridded ? Math.log2(2 / step) : null;
    const wholeBits = bits !== null && Math.abs(bits - Math.round(bits)) < 0.01;

    let state, label, flag, note;
    if (!gridded || bits > 24) {
        state = "yes";
        label = "fine";
        flag = null;
        note = "No step size coarser than 24 bits: the audio went through float processing (OS mixer, resampler) or a 24-bit ADC. Says little either way.";
    } else if (bits <= COARSE_BITS) {
        state = "warn";
        label = `${Math.round(bits)}-bit`;
        flag = "weak";
        note = "The sample values sit on a grid coarser than any microphone ADC. The audio was reduced to low resolution before it reached the browser.";
    } else {
        state = "yes";
        label = `${Math.round(bits)}-bit`;
        flag = null;
        note = (wholeBits
            ? `Values sit exactly on a ${Math.round(bits)}-bit grid.`
            : `Values sit on a grid of about ${bits.toFixed(1)} bits — a whole-bit source scaled by a volume setting.`) +
            " Normal for many microphones, and also for most virtual audio cables, so it's not a flag.";
    }

    return {
        state,
        label,
        text: JSON.stringify(
            {
                distinctLevels: levels.size,
                smallestStep: step,
                samplesOnGrid: `${(100 * onGrid / nonZero).toFixed(1)}%`,
                effectiveBits: bits === null ? null : Math.round(bits * 10) / 10,
                verdict: note
            },
            null, 2
        ),
        data: { flag, bits }
    };
}
