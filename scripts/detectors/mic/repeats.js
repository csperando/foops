// ---------- 10. Exact repeats: looped or generated audio ----------
// Two stretches of a microphone recording are never bit-for-bit identical:
// fresh analog noise lands on every sample. Digital audio repeats exactly
// when a clip loops (e.g. a recorded "room noise" bed filling the silence)
// or a generator outputs a perfectly periodic waveform.
//
// Finds the longest exact repeat with a rolling hash over every 64-sample
// window, matched against the hashes of non-overlapping blocks, so any
// repeat of 128+ samples is found in one pass.
//
// Pure: takes the recorded samples, so it runs under node --test.

const WINDOW = 64;
// A window with fewer distinct values than this (near-silence, a clipped
// stretch) can repeat by chance and is skipped.
const MIN_DISTINCT = 8;
const FLAG_MS = 20;
const BASE = 0x01000193;

function informative(bits, start) {
    const seen = new Set();
    for (let i = start; i < start + WINDOW; i++) {
        seen.add(bits[i]);
        if (seen.size >= MIN_DISTINCT) return true;
    }
    return false;
}

// Length of the identical run through positions a and b (a < b), and
// where it ends after b.
function matchLength(bits, a, b) {
    let back = 0;
    while (a - back > 0 && bits[a - back - 1] === bits[b - back - 1]) back++;
    let forward = 0;
    while (b + forward < bits.length && bits[a + forward] === bits[b + forward]) forward++;
    return { length: back + forward, end: b + forward };
}

export function analyzeRepeats({ samples, sampleRate }) {
    if (!samples || samples.length < WINDOW * 4) {
        return {
            state: "unknown",
            label: "no audio",
            text: "Not enough audio was recorded to look for repeats.",
            data: { flag: null }
        };
    }

    // Compare raw float bits, with -0 folded into 0.
    const bits = new Int32Array(Float32Array.from(samples, (x) => x + 0).buffer);
    const n = bits.length;

    let power = 1; // BASE^(WINDOW-1)
    for (let i = 1; i < WINDOW; i++) power = Math.imul(power, BASE);
    const hashAt = (start) => {
        let h = 0;
        for (let i = start; i < start + WINDOW; i++) h = (Math.imul(h, BASE) + bits[i]) | 0;
        return h;
    };

    const blocks = new Map();
    for (let start = 0; start + WINDOW <= n; start += WINDOW) {
        if (!informative(bits, start)) continue;
        const h = hashAt(start);
        if (!blocks.has(h)) blocks.set(h, []);
        blocks.get(h).push(start);
    }

    // Only the few nearest earlier blocks are tried, and the scan jumps past
    // each match it finds, so a perfectly periodic signal (every block a
    // hit) stays linear.
    let best = { length: 0, lag: null };
    let h = hashAt(0);
    for (let i = 0; i + WINDOW <= n; i++) {
        if (i > 0) h = (Math.imul(h - Math.imul(bits[i - 1], power), BASE) + bits[i + WINDOW - 1]) | 0;
        const candidates = blocks.get(h);
        if (!candidates) continue;
        let skipTo = i;
        for (let c = candidates.length - 1, tried = 0; c >= 0 && tried < 4; c--) {
            const start = candidates[c];
            if (start >= i) continue; // only look back, so each repeat counts once
            tried++;
            const { length, end } = matchLength(bits, start, i);
            if (length < WINDOW) continue;
            if (length > best.length) best = { length, lag: i - start };
            skipTo = Math.max(skipTo, end);
        }
        if (skipTo > i + WINDOW) {
            if (skipTo + WINDOW > n) break;
            i = skipTo;
            h = hashAt(i);
        }
    }

    const ms = (count) => Math.round((1000 * count) / sampleRate * 10) / 10;
    const repeatMs = ms(best.length);
    const flagged = repeatMs >= FLAG_MS;

    return {
        state: flagged ? "no" : "yes",
        label: flagged ? "exact repeat" : "no repeats",
        text: JSON.stringify(
            {
                longestExactRepeatMs: repeatMs,
                repeatsAfterMs: best.lag === null ? null : ms(best.lag),
                verdict: flagged
                    ? `${repeatMs} ms of audio reappears bit for bit ${ms(best.lag)} ms later. A microphone can't do that; a looped clip or a generated waveform does.`
                    : "No stretch of the recording repeats exactly. Only covers this recording — a loop longer than it would pass."
            },
            null, 2
        ),
        data: { flag: flagged ? "strong" : null, repeatMs, lagMs: best.lag === null ? null : ms(best.lag) }
    };
}
