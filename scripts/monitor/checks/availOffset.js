import { createSignal } from "../../signal.js";

// ---------- 4. availLeft/availTop heuristic ----------
// availLeft/availTop are the origin of the available area of the screen the
// window is on, relative to the primary display. The window being on a
// display left of or above the primary gives a negative offset; right of
// or below it, an offset of at least the primary's size. A taskbar or dock
// docked left/top on a single display gives a small positive one, which
// says nothing, so positive offsets only count at display scale.
//
// It only sees the screen the window is on, so it can't rule anything out:
// "not seen" is inconclusive rather than "single".
export const MIN_DISPLAY_OFFSET = 640;

const isDisplayOffset = (n) => n < 0 || n >= MIN_DISPLAY_OFFSET;

export function checkAvailOffset({ left, top }) {
    if (left === null || top === null) {
        return createSignal("availOffset", "evidence", { supported: false, data: { left: null, top: null, offsetDetected: false } });
    }
    const offsetDetected = isDisplayOffset(left) || isDisplayOffset(top);
    return createSignal("availOffset", "evidence", {
        outcome: offsetDetected ? "multiple" : "inconclusive",
        strength: offsetDetected ? "weak" : null,
        data: { left, top, offsetDetected }
    });
}
