// ---------- Monitor session ----------
// One session per thing being watched (e.g. one interview). It owns the
// observers, the pristine realm and every listener and timer, runs probes
// through checks, and keeps a timeline of outcome changes. Sessions never
// share state, so several can run at once (or one after another) without
// leaking into each other.
import { retainPristine, releasePristine } from "../integrity/pristine.js";
import { readIsExtended } from "./probes/isExtended.js";
import { readAvailOffset } from "./probes/availOffset.js";
import { readIsExtendedIntegrity } from "./probes/isExtendedIntegrity.js";
import { readEmbedding } from "./probes/embedding.js";
import { readWebGLRenderer } from "./probes/virtualization.js";
import { queryPermission } from "./probes/permission.js";
import {
    isScreenDetailsSupported,
    requestScreenDetails,
    shapeScreens,
    readLabelGetterIntegrity
} from "./probes/screenDetails.js";
import { checkIsExtended } from "./checks/isExtended.js";
import { checkAvailOffset } from "./checks/availOffset.js";
import { checkIsExtendedIntegrity } from "./checks/isExtendedIntegrity.js";
import { checkIsExtendedConsistency } from "./checks/isExtendedConsistency.js";
import { checkEmbedding } from "./checks/embedding.js";
import { checkVirtualization } from "./checks/virtualization.js";
import { checkPermission } from "./checks/permission.js";
import { checkScreenDetails, checkScreenLabels, checkScreenLabelIntegrity } from "./checks/screenDetails.js";
import { createWindowPositionObserver } from "./observers/windowPosition.js";
import { createRefreshRateObserver } from "./observers/refreshRate.js";
import { defaultScorer } from "./score.js";
import { VERSION } from "../version.js";

export const CHECK_IDS = Object.freeze([
    "isExtended",
    "screenDetails",
    "screenLabels",
    "screenLabelIntegrity",
    "permission",
    "availOffset",
    "windowPosition",
    "isExtendedIntegrity",
    "isExtendedConsistency",
    "refreshRate",
    "virtualization",
    "embedding"
]);

// Checks built from other checks' results. A dependency runs whenever its
// dependent does, but only requested checks appear in reports.
const DEPENDENCIES = {
    isExtendedConsistency: ["isExtended", "availOffset", "windowPosition"],
    screenLabels: ["screenDetails"],
    screenLabelIntegrity: ["screenDetails"]
};

export const DEFAULT_CADENCE = Object.freeze({
    windowPositionMs: 500,   // no "window moved" event exists, so it's polled
    refreshRateMs: 4000,     // each measurement takes ~500 ms of rAF
    refreshTimeoutMs: 1000   // start() stops waiting for the first measurement after this
});

function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
}

/**
 * @param {Object} [options]
 * @param {string[]} [options.checks]   Check ids to run (default: all). Skip refreshRate or
 *                                      virtualization to avoid their cost.
 * @param {Object} [options.cadence]    Overrides for DEFAULT_CADENCE.
 * @param {import("./score.js").Scorer} [options.scorer]  Turns signals into { verdict, score }
 *                                      (default: defaultScorer). It sees every requested signal.
 */
export function createSession({ checks = CHECK_IDS, cadence = {}, scorer = defaultScorer } = {}) {
    const unknown = checks.filter((id) => !CHECK_IDS.includes(id));
    if (unknown.length) throw new TypeError("Unknown check id(s): " + unknown.join(", "));

    const requested = new Set(checks);
    const active = new Set(checks);
    for (const id of checks) for (const dep of DEPENDENCIES[id] || []) active.add(dep);
    const timing = { ...DEFAULT_CADENCE, ...cadence };

    const listeners = { update: new Set(), change: new Set(), pending: new Set() };
    const windowPosition = createWindowPositionObserver();
    const refresh = createRefreshRateObserver();
    const cleanups = [];
    let detachScreenDetails = null;
    let state = "idle"; // idle | running | stopped
    let signals = {};
    let timeline = [];
    let startedAt = null;
    let updatedAt = null;
    let lastVerdict = null;

    function fire(event, ...args) {
        for (const fn of listeners[event]) fn(...args);
    }

    function visibleSignals() {
        const visible = {};
        for (const id of CHECK_IDS) if (requested.has(id) && signals[id]) visible[id] = signals[id];
        return visible;
    }

    function report() {
        const visible = visibleSignals();
        const { verdict, score } = scorer(visible);
        return { version: VERSION, verdict, score, startedAt, updatedAt, signals: visible, timeline: timeline.slice() };
    }

    function record(id, signal) {
        const entry = { t: Date.now(), id, supported: signal.supported, outcome: signal.outcome, strength: signal.strength };
        timeline.push(entry);
        return entry;
    }

    // Recomputes the composite whenever one of its inputs is in `partial`.
    function withConsistency(partial) {
        if (!active.has("isExtendedConsistency")) return partial;
        if (!DEPENDENCIES.isExtendedConsistency.some((id) => id in partial)) return partial;
        const latest = { ...signals, ...partial };
        return {
            ...partial,
            isExtendedConsistency: checkIsExtendedConsistency({
                isExtended: latest.isExtended,
                availOffset: latest.availOffset,
                windowPosition: latest.windowPosition
            })
        };
    }

    function emit(partial) {
        if (state !== "running") return;
        partial = withConsistency(partial);
        const ids = [];
        const entries = [];
        for (const [id, signal] of Object.entries(partial)) {
            if (!active.has(id)) continue;
            const previous = signals[id];
            signals[id] = signal;
            if (!requested.has(id)) continue;
            ids.push(id);
            if (!previous || previous.outcome !== signal.outcome || previous.supported !== signal.supported) {
                entries.push(record(id, signal));
            }
        }
        if (!ids.length) return;
        updatedAt = Date.now();
        // The scorer's verdict goes on the timeline too, as id "verdict".
        const { verdict, score } = scorer(visibleSignals());
        if (verdict !== lastVerdict) {
            lastVerdict = verdict;
            const entry = { t: updatedAt, id: "verdict", outcome: verdict, score };
            timeline.push(entry);
            entries.push(entry);
        }
        fire("update", report(), ids);
        if (entries.length) fire("change", report(), entries);
    }

    // The display-topology checks: cheap enough to rerun on every resize.
    function topology() {
        const partial = {};
        if (active.has("isExtended")) partial.isExtended = checkIsExtended(readIsExtended());
        if (active.has("availOffset")) partial.availOffset = checkAvailOffset(readAvailOffset());
        if (active.has("windowPosition")) partial.windowPosition = windowPosition.sample();
        if (active.has("isExtendedIntegrity")) partial.isExtendedIntegrity = checkIsExtendedIntegrity(readIsExtendedIntegrity());
        if (active.has("embedding")) partial.embedding = checkEmbedding(readEmbedding());
        return partial;
    }

    async function measureRefresh() {
        if (!active.has("refreshRate") || refresh.measuring) return;
        fire("pending", "refreshRate");
        const signal = await refresh.measure();
        if (signal) emit({ refreshRate: signal });
    }

    async function updatePermission() {
        const facts = await queryPermission("window-management");
        emit({ permission: checkPermission(facts) });
        return facts.status;
    }

    function listen(target, event, handler) {
        target.addEventListener(event, handler);
        cleanups.push(() => target.removeEventListener(event, handler));
    }

    function every(ms, fn) {
        const timer = setInterval(fn, ms);
        cleanups.push(() => clearInterval(timer));
    }

    function screenDetailsSignals(liveScreens, live) {
        const screens = shapeScreens(liveScreens);
        return {
            screenDetails: checkScreenDetails({ supported: true, screens, live }),
            screenLabels: checkScreenLabels({ screens }),
            screenLabelIntegrity: checkScreenLabelIntegrity(readLabelGetterIntegrity(liveScreens))
        };
    }

    return {
        /** Starts watching. Resolves with the first full report. */
        async start() {
            if (state !== "idle") throw new Error("A session can only be started once");
            state = "running";
            startedAt = Date.now();
            retainPristine();

            const onResize = () => {
                emit(topology());
                measureRefresh();
            };
            listen(window, "resize", onResize);
            if ("isExtended" in screen && screen.addEventListener) listen(screen, "change", () => emit(topology()));
            if (active.has("windowPosition")) every(timing.windowPositionMs, () => emit({ windowPosition: windowPosition.sample() }));
            if (active.has("refreshRate")) every(timing.refreshRateMs, measureRefresh);

            const initial = topology();
            if (active.has("virtualization")) initial.virtualization = checkVirtualization(readWebGLRenderer());
            emit(initial);

            const pending = [withTimeout(measureRefresh(), timing.refreshTimeoutMs)];
            if (active.has("permission")) {
                pending.push(updatePermission().then((status) => {
                    if (status && state === "running") listen(status, "change", updatePermission);
                }));
            }
            await Promise.all(pending);
            return report();
        },

        /**
         * Runs getScreenDetails(), which prompts for permission: call it from a
         * user gesture. Later screen changes keep updating the session.
         */
        async screenDetails() {
            if (state !== "running") throw new Error("Start the session first");
            if (!active.has("screenDetails")) throw new Error("screenDetails isn't one of this session's checks");
            fire("pending", "screenDetails");
            if (!isScreenDetailsSupported()) {
                emit({ screenDetails: checkScreenDetails({ supported: false }) });
                return report();
            }
            try {
                const details = await requestScreenDetails();
                emit(screenDetailsSignals(details.screens, false));
                if (detachScreenDetails) detachScreenDetails();
                const onChange = () => emit(screenDetailsSignals(details.screens, true));
                details.addEventListener("screenschange", onChange);
                detachScreenDetails = () => details.removeEventListener("screenschange", onChange);
            } catch (err) {
                emit({ screenDetails: checkScreenDetails({ supported: true, error: err.message }) });
            }
            return report();
        },

        /** Clears the timeline and the observers' memory, keeping the session running. */
        reset() {
            windowPosition.reset();
            refresh.reset();
            timeline = [];
            lastVerdict = null;
            startedAt = Date.now();
            for (const id of CHECK_IDS) if (requested.has(id) && signals[id]) record(id, signals[id]);
            emit(topology());
        },

        /** Stops every listener and timer and releases the pristine realm. Returns the final report. */
        stop() {
            if (state !== "running") return report();
            state = "stopped";
            for (const cleanup of cleanups.splice(0)) cleanup();
            if (detachScreenDetails) detachScreenDetails();
            releasePristine();
            return report();
        },

        report,

        /**
         * Events:
         *   update  (report, ids)      any requested signal was refreshed
         *   change  (report, entries)  an outcome or the verdict changed; entries were added to the timeline
         *   pending (id)               an async check (refreshRate, screenDetails) began
         * Returns a function that removes the listener.
         */
        on(event, fn) {
            if (!listeners[event]) throw new TypeError("Unknown event: " + event);
            listeners[event].add(fn);
            return () => listeners[event].delete(fn);
        },

        get state() {
            return state;
        }
    };
}
