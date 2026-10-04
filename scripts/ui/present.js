import { setBadge, $ } from "./dom.js";

// ---------- Presenters ----------
// Checks return Signals (scripts/signal.js), which carry meaning only. The
// dev pages' cards need a badge class, badge text and a <pre> body; this
// module is the one place that turns one into the other.

/**
 * @typedef {Object} CardView
 * @property {"yes" | "no" | "warn" | "unknown"} state  Badge class.
 * @property {string} label                            Badge text.
 * @property {string} text                             <pre> body.
 */

export const json = (value) => JSON.stringify(value, null, 2);

// Fallback badge class per outcome, for signals without a dedicated presenter.
const GENERIC_STATE = {
    multiple: "yes",
    single: "no",
    inconclusive: "warn",
    clean: "yes",
    "modified": "warn",
    suspicious: "warn",
    tampered: "warn"
};

/** @returns {CardView} */
export function presentGeneric(signal) {
    if (!signal.supported) return { state: "unknown", label: "unsupported", text: json(signal.data) };
    return { state: GENERIC_STATE[signal.outcome] || "unknown", label: signal.outcome, text: json(signal.data) };
}

// ---------- 1. screen.isExtended ----------
export function presentIsExtended(signal) {
    if (signal.data.blockedByPolicy) {
        return {
            state: "unknown",
            label: "blocked",
            text: "This frame is denied the window-management permissions policy (an embedded frame without " +
                "allow=\"window-management\"), so screen.isExtended's answer isn't meaningful here."
        };
    }
    if (!signal.supported) {
        return { state: "unknown", label: "unsupported", text: "screen.isExtended is not available in this browser." };
    }
    const value = signal.data.value;
    return { state: value ? "yes" : "no", label: value ? "multiple" : "single", text: json({ "screen.isExtended": value }) };
}

// ---------- 4. availLeft/availTop heuristic ----------
export function presentAvailOffset(signal) {
    if (!signal.supported) {
        return { state: "unknown", label: "unsupported", text: "availLeft/availTop are not available in this browser." };
    }
    const { left, top, offsetDetected } = signal.data;
    return {
        state: offsetDetected ? "yes" : "warn",
        label: offsetDetected ? "offset found" : "inconclusive",
        text: json({
            availLeft: left,
            availTop: top,
            note: offsetDetected
                ? "The window is on a display offset from the primary one by a display's width or height."
                : "No display-sized offset (a small one is just a taskbar or dock) — doesn't rule out another display."
        })
    };
}

// ---------- 2. getScreenDetails() ----------
// One card for three signals: count, label hints and label-getter integrity.
// A spoofed label outranks a VM label, which outranks the count.
export function presentScreenDetails({ details, labels = null, labelIntegrity = null }) {
    if (!details.supported) {
        return { state: "unknown", label: "unsupported", text: "getScreenDetails() is not available in this browser." };
    }
    if (details.data.error) {
        return { state: "warn", label: "denied/error", text: "Permission denied or error: " + details.data.error };
    }
    const { count, screens, live } = details.data;
    const multi = count > 1;
    const spoofed = !!labelIntegrity && labelIntegrity.outcome === "tampered";
    const hinted = !!labels && labels.outcome === "virtual";

    let label;
    if (spoofed) label = "label spoofed";
    else if (hinted) label = "vm label found";
    else if (live) label = `${count} screens (live)`;
    else label = multi ? `${count} screens` : "1 screen";

    return {
        state: spoofed || hinted ? "warn" : (multi ? "yes" : "no"),
        label,
        text: json({
            screens,
            vmLabelHint: hinted ? labels.data.matches : null,
            labelIntegrity: labelIntegrity && labelIntegrity.supported
                ? { ...labelIntegrity.data, spoofed }
                : null
        })
    };
}

// ---------- 3. Permissions API ----------
export function presentPermission(signal) {
    const { name, state, error } = signal.data;
    if (!signal.supported) return { state: "unknown", label: "unsupported", text: error };
    return {
        state: state === "granted" ? "yes" : state === "denied" ? "no" : "warn",
        label: state,
        text: json({ [`${name} permission`]: state })
    };
}

// ---------- 5. Drag / position heuristic ----------
export function presentWindowPosition(signal) {
    const { screenX, screenY, outerWidth, outerHeight, screenWidth, screenHeight, outOfBounds, everDetected } = signal.data;
    return {
        state: everDetected ? "yes" : "warn",
        label: everDetected ? "multiple" : "watching",
        text: json({
            screenX, screenY, outerWidth, outerHeight,
            primaryScreen: { width: screenWidth, height: screenHeight },
            outOfPrimaryBounds: outOfBounds,
            everDetected
        })
    };
}

// ---------- 6. Tamper / spoof detection for isExtended ----------
// One card for two signals: the getter's integrity, then the cross-check.
const INTEGRITY_VIEWS = {
    "getter-not-native": {
        label: "possibly overridden",
        note: "The isExtended getter is not native code — a browser extension or privacy " +
            "tool may be intercepting it. Its reported value cannot be trusted on its own."
    },
    "pristine-tampered": {
        label: "reference tampered",
        note: (data) => "The getter passes, but the clean reference copies this check compares against were " +
            "replaced inside a blank iframe this page created (" + data.pristineTampered.join(", ") + "). Only a " +
            "script injected into every frame does that, so something is rewriting built-ins page-wide."
    },
    "tostring-patched": {
        label: "toString patched",
        note: "The getter checks out against a pristine copy, but this page's Function.prototype.toString " +
            "has been replaced (privacy browsers like Brave and tools like zone.js or Sentry do this). Something " +
            "is rewriting built-ins, so treat every native-code check here with extra caution."
    }
};

export function presentIntegrity({ integrity, consistency }) {
    if (!integrity.supported) {
        return {
            state: "unknown",
            label: "n/a",
            text: "screen.isExtended doesn't exist here at all — that's the honest " +
                "signature of an enterprise policy or unsupported browser, not spoofing."
        };
    }
    const { reason, getterNative, toStringPatched, pristineTampered } = integrity.data;
    const cross = consistency.supported ? consistency.data : { availOffsetDetected: false, windowPositionDetected: false };

    let state = "warn", label, note;
    if (reason) {
        const view = INTEGRITY_VIEWS[reason];
        label = view.label;
        note = typeof view.note === "function" ? view.note(integrity.data) : view.note;
    } else if (consistency.outcome === "suspicious") {
        label = "inconsistent";
        note = "isExtended reports a single display, but another heuristic on this page " +
            "(drag bounds or availLeft/Top offset) suggests otherwise. Worth treating isExtended " +
            "as unreliable until confirmed with method 2.";
    } else {
        state = "yes";
        label = "looks trustworthy";
        note = "Getter is native code and agrees with the other independent signals gathered so far.";
    }

    return {
        state,
        label,
        text: json({
            getterIsNativeCode: getterNative,
            pageToStringPatched: toStringPatched,
            pristineReferencesTampered: pristineTampered,
            crossCheck: { dragHeuristicDetectedMulti: cross.windowPositionDetected, availOffsetDetected: cross.availOffsetDetected },
            verdict: note
        })
    };
}

// ---------- 7. Hardware refresh-rate (vsync) timing ----------
const round1 = (n) => Math.round(n * 10) / 10;

export function presentRefreshRate(signal) {
    const { hz, previousHz, changed } = signal.data;
    return {
        state: changed ? "yes" : "unknown",
        label: changed ? "rate changed" : `~${Math.round(hz)} Hz`,
        text: json({
            measuredHz: round1(hz),
            previousHz: previousHz !== null ? round1(previousHz) : null,
            changedSinceLastCheck: changed,
            note: changed
                ? "Refresh rate shifted — likely moved to a physical display with a different Hz."
                : "Baseline captured. Re-measures periodically and after resize.",
            caveat: "Noisy: OS power throttling, background-tab throttling, and CPU load can also cause shifts."
        })
    };
}

// ---------- 9. Embedding context ----------
export function presentEmbedding(signal) {
    const { framed, windowManagementAllowed } = signal.data;
    const blocked = windowManagementAllowed === false;
    return {
        state: blocked ? "warn" : "yes",
        label: blocked ? "api blocked" : framed ? "iframe" : "top-level",
        text: json({
            framed,
            windowManagementAllowed,
            note: blocked
                ? "Embedded without allow=\"window-management\": isExtended and getScreenDetails() can't report on this machine's displays."
                : windowManagementAllowed === null
                    ? "This browser can't report the permissions policy."
                    : "The Window Management API is allowed here."
        })
    };
}

// ---------- 8. VM / virtualization context signal ----------
export function presentVirtualization(signal) {
    if (!signal.supported) {
        return { state: "unknown", label: "unavailable", text: "Could not read WebGL renderer info: " + signal.data.error };
    }
    const { renderer, vendor, unmasked, matchedHint } = signal.data;
    const virtual = signal.outcome === "virtual";
    return {
        state: virtual ? "warn" : "yes",
        label: virtual ? "likely virtualized" : "looks physical",
        text: json({
            renderer,
            vendor,
            unmasked,
            matchedHint,
            note: virtual
                ? "Renderer string suggests a virtual/software GPU — treat methods 1-7 as reporting on the guest OS's virtual display config, not physical monitors, and don't trust method 7's Hz as real vsync."
                : "No VM/software-render hint found — not proof of physical hardware (spoofable, and some real GPUs use generic names), just no obvious signal against it."
        })
    };
}

export function renderView(badgeId, outId, view) {
    setBadge($(badgeId), view.state, view.label);
    $(outId).textContent = view.text;
    return view;
}
