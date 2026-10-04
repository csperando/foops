// ---------- Scoring ----------
// A scorer turns a session's signals into the headline answer. It's a pure
// function, so the same scorer runs in the browser and on a server, and
// integrators can pass their own to createSession({ scorer }).
//
// The default is deliberately simple until there's a real formula: the
// verdict comes from screen.isExtended alone, and the other signals don't
// change it yet. score is 1 for "multiple", 0 for "single", null when
// unknown.

/**
 * @typedef {Object} Score
 * @property {"single" | "multiple" | "unknown"} verdict
 * @property {number | null} score   0..1, how strongly the signals point to multiple displays.
 *
 * @callback Scorer
 * @param {Object<string, import("../signal.js").Signal>} signals  Keyed by check id; absent checks are missing.
 * @returns {Score}
 */

/** @type {Scorer} */
export function defaultScorer(signals) {
    const isExtended = signals.isExtended;
    if (!isExtended || !isExtended.supported) return { verdict: "unknown", score: null };
    return isExtended.outcome === "multiple" ? { verdict: "multiple", score: 1 } : { verdict: "single", score: 0 };
}
