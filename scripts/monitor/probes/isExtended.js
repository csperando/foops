import { readWindowManagementPolicy } from "./embedding.js";

// ---------- 1. screen.isExtended ----------
// Probes read browser APIs and return raw facts: no judgement, no strings.
export function readIsExtended() {
    if (!("isExtended" in screen)) return { supported: false, value: null, windowManagementAllowed: null };
    return { supported: true, value: screen.isExtended, windowManagementAllowed: readWindowManagementPolicy() };
}
