import { createSignal } from "../../signal.js";

// ---------- 1. screen.isExtended ----------
// Checks are pure: facts in, Signal out. They never touch window, document
// or screen, so the same code runs on a server.
//
// In a frame denied the window-management permissions policy, isExtended
// still returns a boolean, but it isn't meaningful, so the check reports
// itself unsupported (see the embedding check).
export function checkIsExtended({ supported, value, windowManagementAllowed = null }) {
    if (!supported) return createSignal("isExtended", "evidence", { supported: false, data: { value: null, blockedByPolicy: false } });
    if (windowManagementAllowed === false) {
        return createSignal("isExtended", "evidence", { supported: false, data: { value, blockedByPolicy: true } });
    }
    return createSignal("isExtended", "evidence", {
        outcome: value ? "multiple" : "single",
        strength: "strong",
        data: { value, blockedByPolicy: false }
    });
}
