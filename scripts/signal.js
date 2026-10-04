// ---------- Signal ----------
// The one result type every check returns, monitor and (later) webcam alike.
// It carries meaning only — no badge classes or display strings; the dev
// pages turn signals into cards in scripts/ui/present.js.
//
// kind says what the signal is about:
//   evidence  — what it says about the question itself (how many displays)
//   integrity — whether the readings can be trusted
//   context   — the environment, which changes how much the rest is worth
//
// strength is how much weight the outcome deserves; null for outcomes that
// carry no signal (inconclusive, clean, unsupported).

/**
 * @typedef {"evidence" | "integrity" | "context"} SignalKind
 * @typedef {"strong" | "weak" | null} SignalStrength
 *
 * @typedef {Object} Signal
 * @property {string} id               Stable check name, e.g. "isExtended".
 * @property {SignalKind} kind
 * @property {boolean} supported       False when the browser can't run the check here.
 * @property {string | null} outcome   One of OUTCOMES[kind] (context: check-specific); null when unsupported.
 * @property {SignalStrength} strength
 * @property {Object} data             The facts the outcome was derived from; JSON-serializable.
 */

export const OUTCOMES = Object.freeze({
    evidence: Object.freeze(["multiple", "single", "inconclusive"]),
    integrity: Object.freeze(["clean", "modified", "suspicious", "tampered"])
});

const STRENGTHS = ["strong", "weak", null];

/** @returns {Signal} */
export function createSignal(id, kind, { supported = true, outcome = null, strength = null, data = {} } = {}) {
    if (!["evidence", "integrity", "context"].includes(kind)) {
        throw new TypeError(`Signal ${id}: unknown kind "${kind}"`);
    }
    if (!supported) return { id, kind, supported: false, outcome: null, strength: null, data };
    if (OUTCOMES[kind] && !OUTCOMES[kind].includes(outcome)) {
        throw new TypeError(`Signal ${id}: "${outcome}" is not a ${kind} outcome`);
    }
    if (!STRENGTHS.includes(strength)) {
        throw new TypeError(`Signal ${id}: unknown strength "${strength}"`);
    }
    return { id, kind, supported: true, outcome, strength, data };
}
