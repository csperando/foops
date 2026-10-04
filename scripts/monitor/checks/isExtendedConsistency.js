import { createSignal } from "../../signal.js";

// ---------- 6. Cross-check: does isExtended agree with the heuristics? ----------
// A composite: built from other signals rather than from a probe. isExtended
// reporting a single display while availOffset or windowPosition saw
// evidence of another one means isExtended is unreliable here. It only
// catches disagreement — if every signal is spoofed in agreement, nothing
// can tell.
export function checkIsExtendedConsistency({ isExtended, availOffset = null, windowPosition = null }) {
    if (!isExtended || !isExtended.supported) return createSignal("isExtendedConsistency", "integrity", { supported: false, data: {} });

    const availOffsetDetected = !!(availOffset && availOffset.supported && availOffset.data.offsetDetected);
    const windowPositionDetected = !!(windowPosition && windowPosition.supported && windowPosition.data.everDetected);
    const inconsistent = isExtended.data.value === false && (availOffsetDetected || windowPositionDetected);
    return createSignal("isExtendedConsistency", "integrity", {
        outcome: inconsistent ? "suspicious" : "clean",
        strength: inconsistent ? "weak" : null,
        data: { availOffsetDetected, windowPositionDetected }
    });
}
