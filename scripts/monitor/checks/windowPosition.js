import { createSignal } from "../../signal.js";

// ---------- 5. Window position vs. primary screen bounds ----------
// If the window is ever outside the primary screen's bounds, another display
// must exist. It can only confirm a layout it has observed (e.g. after a
// drag), never rule one out, so "not seen" is inconclusive.
export function isOutOfPrimaryBounds({ screenX, screenY, outerWidth, outerHeight, screenWidth, screenHeight }) {
    return screenX < 0 || screenY < 0 || (screenX + outerWidth) > screenWidth || (screenY + outerHeight) > screenHeight;
}

// everDetected: whether an earlier reading in this session was out of bounds.
export function checkWindowPosition({ position, everDetected = false }) {
    const outOfBounds = isOutOfPrimaryBounds(position);
    const detected = everDetected || outOfBounds;
    return createSignal("windowPosition", "evidence", {
        outcome: detected ? "multiple" : "inconclusive",
        strength: detected ? "strong" : null,
        data: { ...position, outOfBounds, everDetected: detected }
    });
}
