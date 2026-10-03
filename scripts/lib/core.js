// ---------- Library core (internal) ----------
// Runs the monitor detectors (methods 1-8) and returns their full per-test
// results. Not part of the public API — scripts/lib/index.js wraps this and
// exposes only the summary, so individual tests can be tiered or reshaped
// without breaking consumers.
//
// Until monitor.html is refactored onto this module, the verdict and
// screen-details decisions here mirror scripts/ui/hero.js and
// scripts/ui/cards.js. Keep them in sync.
import {
    isScreenDetailsSupported,
    requestScreenDetails,
    shapeScreens,
    detectLabelHints,
    checkLabelGetter
} from "../detectors/screenDetails.js";
import { detectIsExtended } from "../detectors/isExtended.js";
import { checkPermissionState } from "../detectors/permissions.js";
import { detectAvailHeuristic } from "../detectors/availHeuristic.js";
import { detectDragHeuristic } from "../detectors/dragHeuristic.js";
import { detectIntegrity } from "../detectors/integrityCheck.js";
import { detectRefreshRate } from "../detectors/refreshRate.js";
import { detectVmSignal } from "../detectors/vmSignal.js";
import { wasDragMultiDetected } from "../detectors/signals.js";

// ---------- Verdict ----------
// Mirrors renderHero() in scripts/ui/hero.js: the headline answer comes from
// screen.isExtended alone. The other results will feed a confidence score
// later; they don't change the verdict.
export function computeVerdict(results) {
    const isExtended = results.isExtended;
    if (!isExtended || !isExtended.data.supported) return "unknown";
    return isExtended.data.value ? "multiple" : "single";
}

// ---------- Display topology (1, 4, 5, 6) ----------
// Method 6 cross-checks isExtended against methods 4 and 5, so it has to run
// after them — same wiring as updateAll() in scripts/main.js. Cheap enough to
// rerun on every resize; method 8 isn't (it opens a WebGL context), so it
// runs once, as in main.js.
export function runTopology() {
    const isExtended = detectIsExtended();
    const avail = detectAvailHeuristic();
    const drag = detectDragHeuristic();
    const integrity = detectIntegrity({
        availOffsetDetected: avail.data.offsetDetected,
        dragMultiDetected: wasDragMultiDetected()
    });
    return { isExtended, avail, drag, integrity };
}

// ---------- All methods except 2 ----------
// Method 2 needs a user gesture, so it's separate (checkScreenDetails).
// Method 7 is null if a measurement is already in flight, or if it doesn't
// finish in time: it's driven by requestAnimationFrame, which background
// tabs pause, and run() must not hang on it.
const REFRESH_TIMEOUT_MS = 1000;

function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
}

export async function runAll() {
    const sync = { ...runTopology(), vm: detectVmSignal() };
    const [permissions, refresh] = await Promise.all([
        checkPermissionState().then(({ result }) => result),
        withTimeout(detectRefreshRate(), REFRESH_TIMEOUT_MS)
    ]);
    const results = { ...sync, permissions, refresh };
    return { verdict: computeVerdict(results), results };
}

// ---------- 2. getScreenDetails() ----------
// Pure: takes already-shaped screens plus the label-getter check, so it can
// be tested with plain objects. Mirrors both branches of
// initScreenDetailsCard() in scripts/ui/cards.js (initial + screenschange).
export function evaluateScreenDetails({ screens, labelIntegrity }, { live = false } = {}) {
    const count = screens.length;
    const multi = count > 1;
    const hints = detectLabelHints(screens);
    const labelSpoofed = !!(labelIntegrity && labelIntegrity.spoofed);

    let countLabel;
    if (live) countLabel = `${count} screens (live)`;
    else countLabel = multi ? `${count} screens` : "1 screen";

    return {
        state: labelSpoofed || hints.anyHint ? "warn" : (multi ? "yes" : "no"),
        label: labelSpoofed ? "label spoofed" : hints.anyHint ? "vm label found" : countLabel,
        text: JSON.stringify({ screens, vmLabelHint: hints.anyHint ? hints.matches : null, labelIntegrity }, null, 2),
        data: { supported: true, count, multi, labelSpoofed, vmLabelHints: hints.matches }
    };
}

// Prompts for the window-management permission, so it must run from a
// user gesture. Returns the raw ScreenDetails too, for live listening.
export async function checkScreenDetails() {
    if (!isScreenDetailsSupported()) {
        return {
            result: {
                state: "unknown",
                label: "unsupported",
                text: "getScreenDetails() is not available in this browser.",
                data: { supported: false }
            },
            details: null
        };
    }

    try {
        const details = await requestScreenDetails();
        const result = evaluateScreenDetails({
            screens: shapeScreens(details.screens),
            labelIntegrity: checkLabelGetter(details.screens)
        });
        return { result, details };
    } catch (err) {
        return {
            result: {
                state: "warn",
                label: "denied/error",
                text: "Permission denied or error: " + err.message,
                data: { supported: true, error: err.message }
            },
            details: null
        };
    }
}

// ---------- Live updates ----------
// Same triggers and cadences as scripts/main.js. Calls onUpdate with
// { verdict, results, changed } where `changed` lists the result keys that
// were refreshed. Returns stop(), which removes every listener and timer.
const DRAG_POLL_MS = 500;
const REFRESH_POLL_MS = 4000;

export function watchAll(onUpdate) {
    let stopped = false;
    let results = {};
    let permissionStatus = null;

    function emit(partial) {
        if (stopped) return;
        results = { ...results, ...partial };
        onUpdate({ verdict: computeVerdict(results), results, changed: Object.keys(partial) });
    }

    async function updateRefresh() {
        const refresh = await detectRefreshRate();
        if (refresh) emit({ refresh });
    }

    async function updatePermissions() {
        emit({ permissions: (await checkPermissionState()).result });
    }

    const onResize = () => {
        emit(runTopology());
        updateRefresh();
    };
    const onScreenChange = () => emit(runTopology());
    const dragTimer = setInterval(() => emit({ drag: detectDragHeuristic() }), DRAG_POLL_MS);
    const refreshTimer = setInterval(updateRefresh, REFRESH_POLL_MS);

    window.addEventListener("resize", onResize);
    const screenEvents = "isExtended" in screen && !!screen.addEventListener;
    if (screenEvents) screen.addEventListener("change", onScreenChange);

    emit({ ...runTopology(), vm: detectVmSignal() });
    updateRefresh();
    checkPermissionState().then(({ status, result }) => {
        if (stopped) return;
        emit({ permissions: result });
        if (status) {
            permissionStatus = status;
            status.addEventListener("change", updatePermissions);
        }
    });

    return function stop() {
        stopped = true;
        clearInterval(dragTimer);
        clearInterval(refreshTimer);
        window.removeEventListener("resize", onResize);
        if (screenEvents) screen.removeEventListener("change", onScreenChange);
        if (permissionStatus) permissionStatus.removeEventListener("change", updatePermissions);
    };
}
