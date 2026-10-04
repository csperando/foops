import { createSignal } from "../../signal.js";
import { findVmHint } from "./vmHints.js";

// ---------- 8. VM / virtualization context ----------
// Doesn't detect monitors; it's a trust modifier. Inside a VM, display
// counts are whatever the hypervisor presents, and refresh-rate timing is
// usually emulated. A renderer string without a hint isn't proof of
// physical hardware (spoofable, and some real GPUs use generic names).
export function checkVirtualization({ available, renderer = null, vendor = null, unmasked = false, error = null }) {
    if (!available) return createSignal("virtualization", "context", { supported: false, data: { error } });
    const matchedHint = findVmHint(`${renderer} ${vendor}`);
    return createSignal("virtualization", "context", {
        outcome: matchedHint ? "virtual" : "physical",
        strength: matchedHint ? "weak" : null,
        data: { renderer, vendor, unmasked, matchedHint }
    });
}
