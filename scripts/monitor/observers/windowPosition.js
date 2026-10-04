import { readWindowPosition } from "../probes/windowPosition.js";
import { checkWindowPosition } from "../checks/windowPosition.js";

// ---------- 5. Window position observer ----------
// No native "window moved" event exists, so callers sample this on a timer.
// It remembers whether any sample was out of bounds; each observer has its
// own memory, so separate sessions don't leak into each other.
export function createWindowPositionObserver() {
    let everDetected = false;
    return {
        sample() {
            const signal = checkWindowPosition({ position: readWindowPosition(), everDetected });
            everDetected = signal.data.everDetected;
            return signal;
        },
        reset() {
            everDetected = false;
        }
    };
}
