// ---------- foops/server: public entry (Node or any JS runtime) ----------
// Re-scores a report submitted from the browser. The client's verdict and
// outcomes are never trusted: each signal is recomputed from its own data
// with the same pure checks the browser ran, then scored here.
//
// What this catches: a report whose verdict or outcomes were edited
// without editing the data behind them, and reports from another library
// version. What it can't catch: a client that fabricates consistent data.
// Nothing computed in the browser is proof; treat a clean report as the
// absence of red flags, not as evidence of honesty.
//
// Imports only pure modules (checks, scorer, version) — no browser APIs.
import { checkIsExtended } from "../monitor/checks/isExtended.js";
import { checkAvailOffset } from "../monitor/checks/availOffset.js";
import { checkWindowPosition } from "../monitor/checks/windowPosition.js";
import { checkIsExtendedIntegrity } from "../monitor/checks/isExtendedIntegrity.js";
import { checkIsExtendedConsistency } from "../monitor/checks/isExtendedConsistency.js";
import { checkRefreshRate } from "../monitor/checks/refreshRate.js";
import { checkVirtualization } from "../monitor/checks/virtualization.js";
import { checkPermission } from "../monitor/checks/permission.js";
import { checkEmbedding } from "../monitor/checks/embedding.js";
import { checkScreenDetails, checkScreenLabels, checkScreenLabelIntegrity } from "../monitor/checks/screenDetails.js";
import { defaultScorer } from "../monitor/score.js";
import { VERSION } from "../version.js";

// How to rebuild each check's input from the signal it produced. Composites
// read the other recomputed signals; they return null when an input is
// missing from the report, and the reported signal is then left out.
const RECOMPUTE = {
    isExtended: (s) => checkIsExtended({
        supported: s.supported || !!s.data.blockedByPolicy,
        value: s.data.value,
        windowManagementAllowed: s.data.blockedByPolicy ? false : null
    }),
    availOffset: (s) => checkAvailOffset({ left: s.data.left, top: s.data.top }),
    windowPosition: (s) => checkWindowPosition({ position: s.data, everDetected: s.data.everDetected }),
    isExtendedIntegrity: (s) => checkIsExtendedIntegrity({ present: s.supported, ...s.data }),
    refreshRate: (s) => checkRefreshRate({ hz: s.data.hz, previousHz: s.data.previousHz }),
    virtualization: (s) => checkVirtualization({ available: s.supported, ...s.data }),
    permission: (s) => checkPermission({ supported: s.supported, ...s.data }),
    embedding: (s) => checkEmbedding(s.data),
    screenDetails: (s) => checkScreenDetails({ supported: s.supported, ...s.data }),
    screenLabelIntegrity: (s) => checkScreenLabelIntegrity({ supported: s.supported, ...s.data }),
    screenLabels: (s, done) => {
        const details = done.screenDetails;
        return details && details.data.screens ? checkScreenLabels({ screens: details.data.screens }) : null;
    },
    isExtendedConsistency: (s, done) => (done.isExtended ? checkIsExtendedConsistency(done) : null)
};
// Composites last, so their inputs are already recomputed.
const ORDER = [...Object.keys(RECOMPUTE).filter((id) => id !== "screenLabels" && id !== "isExtendedConsistency"), "screenLabels", "isExtendedConsistency"];

const same = (a, b) => a.supported === b.supported && a.outcome === b.outcome && a.strength === b.strength;

/**
 * @param {import("./index.js").Report} report  As received from the client (parsed JSON).
 * @param {Object} [options]
 * @param {import("../monitor/score.js").Scorer} [options.scorer]  Default: defaultScorer.
 * @returns {{ verdict: string, score: number | null, signals: Object, mismatches: Array, unknownChecks: string[], versionMatches: boolean }}
 *   signals are the recomputed ones the verdict is based on. mismatches lists signals whose
 *   reported outcome doesn't follow from their data ({ id, reported, recomputed }).
 */
export function rescore(report, { scorer = defaultScorer } = {}) {
    const reported = (report && report.signals) || {};
    const signals = {};
    const mismatches = [];

    for (const id of ORDER) {
        const signal = reported[id];
        if (!signal || !signal.data) continue;
        let recomputed;
        try {
            recomputed = RECOMPUTE[id](signal, signals);
        } catch (err) {
            recomputed = undefined;
        }
        if (recomputed === null) continue;
        if (recomputed === undefined) {
            mismatches.push({ id, reported: signal.outcome, recomputed: null });
            continue;
        }
        signals[id] = recomputed;
        if (!same(signal, recomputed)) mismatches.push({ id, reported: signal.outcome, recomputed: recomputed.outcome });
    }

    const { verdict, score } = scorer(signals);
    return {
        verdict,
        score,
        signals,
        mismatches,
        unknownChecks: Object.keys(reported).filter((id) => !RECOMPUTE[id]),
        versionMatches: !!report && report.version === VERSION
    };
}

export { defaultScorer };
export const version = VERSION;
