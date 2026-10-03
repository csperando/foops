// ---------- foops: public entry ----------
// The only module consumers import. Exposes a summary verdict, never the
// individual detector results — those stay internal to ./core.js.
import { runAll, watchAll, checkScreenDetails } from "./core.js";

function screenCountVerdict(result) {
    const count = result.data && result.data.count;
    if (!count) return "unknown";
    return count > 1 ? "multiple" : "single";
}

export const monitor = Object.freeze({
    // () => Promise<{ verdict: "single" | "multiple" | "unknown" }>
    run: async () => {
        const { verdict } = await runAll();
        return { verdict };
    },
    // (onChange) => stop(). onChange({ verdict }) fires once with the first
    // reading, then only when the verdict changes.
    watch: (onChange) => {
        let last;
        return watchAll(({ verdict }) => {
            if (verdict === last) return;
            last = verdict;
            onChange({ verdict });
        });
    },
    // () => Promise<{ verdict }>; prompts for permission, so call it from a
    // user gesture (e.g. a click handler).
    screenDetails: async () => {
        const { result } = await checkScreenDetails();
        return { verdict: screenCountVerdict(result) };
    }
});
