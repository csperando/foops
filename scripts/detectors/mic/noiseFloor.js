// ---------- 6. Noise floor: is there ever true digital silence? ----------
// A physical microphone and its ADC always add some noise, so even a silent
// room never produces a run of samples that are exactly zero. Audio injected
// through a virtual device (text-to-speech, a recording, a voice changer)
// usually *does*: the gaps between words are digital silence.
//
// Pure: takes the recorded samples, so it runs under node --test.

const WINDOW_MS = 20;

// Real ADC self-noise sits well above this; 16-bit quantization alone is
// about -101 dBFS RMS.
const TOO_CLEAN_DB = -105;

function percentile(sorted, p) {
    return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null;
}

const round1 = (x) => (x === null ? null : Math.round(x * 10) / 10);

// `processing` is the track's echoCancellation/noiseSuppression/
// autoGainControl settings. The page asks for all three off; if the browser
// kept any on, its noise gate could produce silence of its own.
export function analyzeNoiseFloor({ samples, sampleRate, processing = {} }) {
    const size = Math.round((sampleRate * WINDOW_MS) / 1000);
    if (!samples || samples.length < size * 10) {
        return {
            state: "unknown",
            label: "no audio",
            text: "Not enough audio was recorded to judge the noise floor.",
            data: { flag: null }
        };
    }

    let zeroSamples = 0;
    let silentWindows = 0;
    let longestSilentRun = 0, run = 0;
    const levels = [];
    for (let start = 0; start + size <= samples.length; start += size) {
        let sum = 0, zeros = 0;
        for (let i = start; i < start + size; i++) {
            const x = samples[i];
            if (x === 0) zeros++;
            sum += x * x;
        }
        zeroSamples += zeros;
        if (zeros === size) {
            silentWindows++;
            longestSilentRun = Math.max(longestSilentRun, ++run);
        } else {
            run = 0;
            levels.push(10 * Math.log10(sum / size));
        }
    }
    const windows = silentWindows + levels.length;
    levels.sort((a, b) => a - b);
    const floorDb = percentile(levels, 0.1);
    const peakDb = percentile(levels, 0.95);
    const processingOn = ["echoCancellation", "noiseSuppression", "autoGainControl"].filter((key) => processing[key] === true);

    let state, label, flag, note;
    if (silentWindows === windows) {
        state = "warn";
        label = "all zeros";
        flag = "weak";
        note = "Every sample is exactly zero: a muted microphone (mute key or OS setting) or a virtual device with nothing playing into it.";
    } else if (silentWindows >= 2 && processingOn.length === 0) {
        state = "no";
        label = "digital silence";
        flag = "strong";
        note = "Parts of the recording are exact digital silence between non-silent audio. A microphone's own noise never drops to zero; injected audio does.";
    } else if (silentWindows >= 2) {
        state = "warn";
        label = "digital silence";
        flag = "weak";
        note = `Parts of the recording are exact digital silence, but the browser kept ${processingOn.join(", ")} on, and its noise gate may have caused it.`;
    } else if (floorDb < TOO_CLEAN_DB) {
        state = "warn";
        label = "too clean";
        flag = "weak";
        note = "The quietest moments are quieter than any microphone's self-noise. Possible with a high-end interface at minimum gain, otherwise a sign of synthetic audio.";
    } else {
        state = "yes";
        label = "live noise floor";
        flag = null;
        note = "There's noise in every quiet moment, as a real microphone produces. A virtual device fed with recorded room noise would pass too.";
    }

    return {
        state,
        label,
        text: JSON.stringify(
            {
                seconds: round1(samples.length / sampleRate),
                exactZeroSamples: `${(100 * zeroSamples / samples.length).toFixed(2)}%`,
                silentWindows: `${silentWindows} of ${windows} (${WINDOW_MS} ms each)`,
                longestSilenceMs: longestSilentRun * WINDOW_MS,
                quietFloorDbfs: round1(floorDb),
                loudDbfs: round1(peakDb),
                browserProcessingLeftOn: processingOn,
                verdict: note
            },
            null, 2
        ),
        data: { flag, silentWindows, windows, floorDb, peakDb }
    };
}
