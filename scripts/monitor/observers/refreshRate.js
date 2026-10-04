import { measureRefreshRate } from "../probes/refreshRate.js";
import { checkRefreshRate } from "../checks/refreshRate.js";

// ---------- 7. Refresh rate observer ----------
// Compares each measurement with the previous one from the same observer.
// measure() resolves to null if a measurement is already in flight.
export function createRefreshRateObserver({ durationMs = 500 } = {}) {
    let previousHz = null;
    let measuring = false;
    return {
        get measuring() {
            return measuring;
        },
        async measure() {
            if (measuring) return null;
            measuring = true;
            try {
                const hz = await measureRefreshRate(durationMs);
                const signal = checkRefreshRate({ hz, previousHz });
                previousHz = hz;
                return signal;
            } finally {
                measuring = false;
            }
        },
        reset() {
            previousHz = null;
        }
    };
}
