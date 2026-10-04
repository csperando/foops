// ---------- foops: public entry (browser) ----------
// The only module consumers import. Probes and the integrity machinery stay
// internal; everything here is public API.
//
// Never trust a verdict computed in the browser: the person being checked
// controls it. Send the report to your server and score it there with
// foops/server (lib/server.js).
import { createSession, CHECK_IDS, DEFAULT_CADENCE } from "../monitor/session.js";
import { defaultScorer } from "../monitor/score.js";
import { VERSION } from "../version.js";

/**
 * @typedef {import("../signal.js").Signal} Signal
 * @typedef {import("../monitor/score.js").Scorer} Scorer
 *
 * @typedef {Object} TimelineEntry
 * @property {number} t                Epoch ms.
 * @property {string} id               A check id, or "verdict".
 * @property {string | null} outcome
 * @property {boolean} [supported]     Check entries only.
 * @property {"strong" | "weak" | null} [strength]  Check entries only.
 * @property {number | null} [score]   Verdict entries only.
 *
 * @typedef {Object} Report            Plain, JSON-serializable data.
 * @property {string} version          Library version that produced it.
 * @property {"single" | "multiple" | "unknown"} verdict  From the scorer.
 * @property {number | null} score     From the scorer.
 * @property {number | null} startedAt
 * @property {number | null} updatedAt
 * @property {Object<string, Signal>} signals  Keyed by check id.
 * @property {TimelineEntry[]} timeline
 *
 * @typedef {Object} SessionOptions
 * @property {string[]} [checks]       Check ids to run (default: all).
 * @property {Scorer} [scorer]         Default: defaultScorer.
 * @property {Object} [cadence]        { windowPositionMs, refreshRateMs, refreshTimeoutMs }.
 */

// getScreenDetails() and the checks built from it need a user gesture.
const GESTURE_CHECKS = ["screenDetails", "screenLabels", "screenLabelIntegrity"];

/** One-shot: start a session, wait for the first readings, stop. */
async function run(options = {}) {
    const session = createSession(options);
    await session.start();
    return session.stop();
}

// Each check on its own, as a one-shot session that returns just its signal.
// Observer checks (windowPosition, refreshRate) only see a single sample
// this way; use a session to watch them over time.
const checks = Object.freeze(Object.fromEntries(CHECK_IDS.map((id) => [id, async (options = {}) => {
    const session = createSession({ ...options, checks: [id] });
    await session.start();
    if (GESTURE_CHECKS.includes(id)) await session.screenDetails();
    return session.stop().signals[id];
}])));

export const version = VERSION;

export const monitor = Object.freeze({
    /** @type {(options?: SessionOptions) => ReturnType<typeof createSession>} */
    createSession,
    /** @type {(options?: SessionOptions) => Promise<Report>} */
    run,
    /** Standalone checks: checks.<id>(options?) => Promise<Signal>. */
    checks,
    defaultScorer,
    CHECK_IDS,
    DEFAULT_CADENCE
});
