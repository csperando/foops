// ---------- 9. Analog traces: mains hum + DC offset ----------
// Positive evidence only. An analog signal path picks up the power grid's
// hum (50 or 60 Hz and its harmonics) and often carries a small DC offset
// from the ADC. Synthetic audio has neither. Their absence proves nothing:
// a laptop on battery has no hum, and many ADCs filter DC out.
//
// Pure: takes the recorded samples, so it runs under node --test.
import { powerSpectrum, toDb } from "./fft.js";

const FFT_SIZE = 16384; // ~3 Hz bins at 48 kHz
const HARMONICS = 4;
const PEAK_DB = 10;
const DC_MIN = 1e-4; // -80 dBFS

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

// How far each harmonic of `mains` stands above the spectrum around it.
function humPeaks(db, binHz, mains) {
    const peaks = [];
    for (let h = 1; h <= HARMONICS; h++) {
        const k = Math.round((h * mains) / binHz);
        const peak = Math.max(db[k - 1], db[k], db[k + 1]);
        const around = [];
        for (let d = 3; d * binHz <= 20; d++) around.push(db[k - d], db[k + d]);
        peaks.push(Math.round(peak - median(around)));
    }
    return peaks;
}

export function analyzeAnalogTraits({ samples, sampleRate }) {
    const spectrum = samples ? powerSpectrum(samples, sampleRate, FFT_SIZE) : null;
    if (!spectrum || spectrum.power.every((p) => p === 0)) {
        return {
            state: "unknown",
            label: "no signal",
            text: "No usable audio to analyze — the recording was too short or entirely silent.",
            data: { flag: null, analog: false }
        };
    }

    const db = Array.from(spectrum.power, toDb);
    const hum = {};
    let humHz = null;
    for (const mains of [50, 60]) {
        const peaks = humPeaks(db, spectrum.binHz, mains);
        hum[`${mains}Hz`] = peaks;
        const found = peaks.filter((p) => p >= PEAK_DB).length;
        if (found >= 2 || peaks[0] >= PEAK_DB + 5) humHz = humHz || mains;
    }

    let sum = 0;
    for (const x of samples) sum += x;
    const dc = sum / samples.length;
    const hasDc = Math.abs(dc) >= DC_MIN;

    const found = [humHz && `${humHz} Hz mains hum`, hasDc && "DC offset"].filter(Boolean);
    return {
        state: found.length ? "yes" : "unknown",
        label: found.length ? (humHz ? `${humHz} Hz hum` : "dc offset") : "none found",
        text: JSON.stringify(
            {
                humPeaksDb: hum,
                dcOffset: Number(dc.toExponential(2)),
                dcOffsetDbfs: dc === 0 ? null : Math.round(20 * Math.log10(Math.abs(dc))),
                verdict: found.length
                    ? `Found ${found.join(" and ")} — traces of an analog signal path. A virtual device replaying a real recording could carry them too.`
                    : "No hum or DC offset. That's normal on battery power and with ADCs that filter DC, so it isn't a flag."
            },
            null, 2
        ),
        data: { flag: null, analog: found.length > 0, humHz, dc }
    };
}
