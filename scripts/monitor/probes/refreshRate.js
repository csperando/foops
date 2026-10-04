// ---------- 7. Refresh rate (vsync) timing ----------
// Counts requestAnimationFrame callbacks over a fixed window. Background
// tabs pause rAF, so this can take arbitrarily long there; callers that
// can't wait should race it against a timeout.
export function measureRefreshRate(durationMs = 500) {
    return new Promise((resolve) => {
        let frames = 0;
        let start = null;
        function step(ts) {
            if (start === null) start = ts;
            frames++;
            if (ts - start < durationMs) {
                requestAnimationFrame(step);
            } else {
                resolve((frames / (ts - start)) * 1000);
            }
        }
        requestAnimationFrame(step);
    });
}
