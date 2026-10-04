import { createSignal } from "../../signal.js";

// ---------- 7. Refresh rate (vsync) timing ----------
// A shift of more than CHANGE_HZ since the previous measurement usually
// means the window moved onto a display with a different refresh rate.
// Noisy: power and background-tab throttling and CPU load cause shifts too,
// so it's weak evidence, and an unchanged rate says nothing.
export const CHANGE_HZ = 5;

export function checkRefreshRate({ hz, previousHz = null }) {
    const changed = previousHz !== null && Math.abs(hz - previousHz) > CHANGE_HZ;
    return createSignal("refreshRate", "evidence", {
        outcome: changed ? "multiple" : "inconclusive",
        strength: changed ? "weak" : null,
        data: { hz, previousHz, changed }
    });
}
