import { createSignal } from "../../signal.js";

// ---------- 9. Embedding context ----------
// Interview tools are often embedded in another site. In a frame that's
// denied window-management, isExtended's answer isn't meaningful, so the
// isExtended check reports itself unsupported there; this signal says why.
export function checkEmbedding({ framed, windowManagementAllowed = null }) {
    const blocked = windowManagementAllowed === false;
    return createSignal("embedding", "context", {
        outcome: framed ? "iframe" : "top",
        strength: blocked ? "strong" : null,
        data: { framed, windowManagementAllowed }
    });
}
