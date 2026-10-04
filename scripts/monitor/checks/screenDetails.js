import { createSignal } from "../../signal.js";
import { findVmHint } from "./vmHints.js";

// ---------- 2. getScreenDetails(): screen count ----------
// The one check that enumerates screens directly, but it needs a user
// gesture and a permission grant. A denial is inconclusive, not unsupported.
// `live` marks readings from a later "screenschange" event.
export function checkScreenDetails({ supported, screens = null, error = null, live = false }) {
    if (!supported) return createSignal("screenDetails", "evidence", { supported: false, data: { count: null, screens: null } });
    if (error) {
        return createSignal("screenDetails", "evidence", { outcome: "inconclusive", data: { count: null, screens: null, error } });
    }
    return createSignal("screenDetails", "evidence", {
        outcome: screens.length > 1 ? "multiple" : "single",
        strength: "strong",
        data: { count: screens.length, screens, live }
    });
}

// ---------- 2. Screen labels: virtualization hints ----------
// screen.label is a free-form string from the OS; a VM often names its
// virtual display. Weak on its own (spoofable, and real hardware sometimes
// reports generic labels), but most stealth tooling doesn't think to fake it.
export function checkScreenLabels({ screens }) {
    const matches = screens
        .map((s, index) => ({ index, label: s.label, hint: findVmHint(s.label) }))
        .filter((m) => m.hint);
    return createSignal("screenLabels", "context", {
        outcome: matches.length ? "virtual" : "physical",
        strength: matches.length ? "weak" : null,
        data: { matches }
    });
}

// ---------- 2. Screen labels: getter integrity ----------
// The label hints above only mean something if the label is real.
export function checkScreenLabelIntegrity({ supported, getterNative = false, shadowedOnScreen = false }) {
    if (!supported) return createSignal("screenLabelIntegrity", "integrity", { supported: false, data: {} });
    const spoofed = !getterNative || shadowedOnScreen;
    return createSignal("screenLabelIntegrity", "integrity", {
        outcome: spoofed ? "tampered" : "clean",
        strength: spoofed ? "strong" : null,
        data: { getterNative, shadowedOnScreen }
    });
}
