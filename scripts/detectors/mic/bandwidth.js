// ---------- 7. Bandwidth: a resampler's brick wall? ----------
// A microphone's ADC records up to just under half its sample rate, and its
// own noise fills that whole band. Speech synthesis, voice changers and
// compressed recordings are usually produced at 16-24 kHz (or cut at 16 kHz
// by an MP3 encoder) and resampled up to the 48 kHz the browser captures at.
// That leaves a sheer cliff in the spectrum, far below the top of the band,
// with nothing above it.
//
// Pure: takes the recorded samples, so it runs under node --test.
import { powerSpectrum, toDb } from "./fft.js";

const FFT_SIZE = 2048;
// Cliffs above this fraction of the sample rate are the ADC's own
// anti-aliasing filter (or a 44.1 kHz device resampled to 48 kHz).
const MAX_SUSPECT_FRACTION = 0.4;
const MIN_FREQ = 2000;
const BAND_HZ = 500;
const GUARD_HZ = 250; // a resampler's transition band
const CLIFF_DB = 30;
// "Nothing above it" means quieter than any microphone's self-noise: speech
// that rolls off steeply into a real mic's noise floor isn't a brick wall.
const SILENT_DBFS = -110;

// Bluetooth headsets in call mode (HFP) really are narrowband: 8 or 16 kHz.
const NARROWBAND_HINTS = ["hands-free", "handsfree", "hfp", "airpods", "bluetooth", "headset"];

const COMMON_RATES = [8000, 11025, 16000, 22050, 24000, 32000, 44100];

// A hard cut into digital silence splatters energy across the whole band,
// which would hide the cliff, so segments touching one are left out. A real
// microphone never produces a run of zeros, so for it nothing is skipped.
const ZERO_RUN = 32;

function touchesSilence(samples) {
    return (start, size) => {
        let run = 0;
        for (let i = start; i < start + size; i++) {
            run = samples[i] === 0 ? run + 1 : 0;
            if (run >= ZERO_RUN) return true;
        }
        return false;
    };
}

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

function nearestRate(cutoffHz) {
    const rate = COMMON_RATES.find((r) => Math.abs(cutoffHz * 2 - r) / r < 0.08);
    return rate || null;
}

export function analyzeBandwidth({ samples, sampleRate, deviceLabel = "" }) {
    const spectrum = samples ? powerSpectrum(samples, sampleRate, FFT_SIZE, touchesSilence(samples)) : null;
    if (!spectrum || spectrum.power.every((p) => p === 0)) {
        return {
            state: "unknown",
            label: "no signal",
            text: "No usable audio to analyze — the recording was too short, or had no stretch of sound long enough between silences.",
            data: { flag: null }
        };
    }

    const db = Array.from(spectrum.power, toDb);
    const bin = (hz) => Math.round(hz / spectrum.binHz);
    const band = bin(BAND_HZ), guard = bin(GUARD_HZ);
    const top = bin(sampleRate * 0.475);

    // The biggest drop between the band just below a frequency and the band
    // just above it (past the transition band).
    let best = { drop: -Infinity, k: null, below: null };
    for (let k = bin(MIN_FREQ); k <= bin(sampleRate * MAX_SUSPECT_FRACTION); k++) {
        if (k + guard + band > top) break;
        const below = median(db.slice(k - band, k));
        const above = median(db.slice(k + guard, k + guard + band));
        if (below - above > best.drop) best = { drop: below - above, k, below };
    }

    // A brick wall stays down all the way up; a dip that comes back (a
    // notch, a resonance) doesn't count.
    // Where the level actually falls through the midpoint of the drop: the
    // band medians above place best.k up to half a band late.
    const midpoint = best.below - best.drop / 2;
    let edge = best.k - band;
    while (edge < best.k + guard && db[edge] > midpoint) edge++;
    const cutoffHz = edge * spectrum.binHz;
    const aboveMax = Math.max(...db.slice(best.k + guard, top));
    const silentBinDb = SILENT_DBFS + toDb(spectrum.windowPower);
    const aboveLevel = median(db.slice(best.k + guard, top));
    const isCliff = best.drop >= CLIFF_DB && aboveMax <= best.below - CLIFF_DB / 2 && aboveLevel <= silentBinDb;
    const rate = isCliff ? nearestRate(cutoffHz) : null;
    const lower = (deviceLabel || "").toLowerCase();
    const narrowbandDevice = NARROWBAND_HINTS.find((hint) => lower.includes(hint)) || null;

    let state, label, flag, note;
    if (!isCliff) {
        state = "yes";
        label = "full band";
        flag = null;
        note = "Sound and noise reach close to the top of the band, as a microphone's ADC records.";
    } else if (narrowbandDevice) {
        state = "warn";
        label = "narrowband device";
        flag = null;
        note = `The spectrum stops dead at ${Math.round(cutoffHz)} Hz, but this looks like a Bluetooth headset ("${narrowbandDevice}"), and those really are narrowband in call mode.`;
    } else {
        state = "no";
        label = `cut at ${(cutoffHz / 1000).toFixed(1)} kHz`;
        flag = "strong";
        note = `The spectrum stops dead at ${Math.round(cutoffHz)} Hz with nothing above it` +
            (rate ? ` — audio produced at ${rate} Hz and resampled to ${sampleRate} Hz.` : ".") +
            " A microphone's own noise would fill that band. Typical of speech synthesis, a voice changer or a compressed recording.";
    }

    return {
        state,
        label,
        text: JSON.stringify(
            {
                sampleRate,
                biggestDropDb: Math.round(best.drop),
                levelAboveDbfs: Math.round(aboveLevel - toDb(spectrum.windowPower)),
                atHz: Math.round(cutoffHz),
                brickWall: isCliff,
                impliedSourceRate: rate,
                narrowbandDeviceHint: narrowbandDevice,
                verdict: note
            },
            null, 2
        ),
        data: { flag, isCliff, cutoffHz: isCliff ? cutoffHz : null, impliedSourceRate: rate }
    };
}
