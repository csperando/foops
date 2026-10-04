import { test } from "node:test";
import assert from "node:assert/strict";
import { checkWindowPosition, isOutOfPrimaryBounds } from "../../scripts/monitor/checks/windowPosition.js";
import { checkRefreshRate } from "../../scripts/monitor/checks/refreshRate.js";
import { createWindowPositionObserver } from "../../scripts/monitor/observers/windowPosition.js";
import { createRefreshRateObserver } from "../../scripts/monitor/observers/refreshRate.js";

const inside = { screenX: 100, screenY: 100, outerWidth: 800, outerHeight: 600, screenWidth: 1920, screenHeight: 1080 };
const outside = { ...inside, screenX: 1800 };

test("isOutOfPrimaryBounds", () => {
    assert.equal(isOutOfPrimaryBounds(inside), false);
    assert.equal(isOutOfPrimaryBounds(outside), true);
    assert.equal(isOutOfPrimaryBounds({ ...inside, screenX: -5 }), true);
    assert.equal(isOutOfPrimaryBounds({ ...inside, screenY: 500 }), true);
});

test("windowPosition: out of bounds is strong evidence; in bounds is inconclusive", () => {
    assert.deepEqual([checkWindowPosition({ position: outside }).outcome, checkWindowPosition({ position: outside }).strength], ["multiple", "strong"]);
    assert.equal(checkWindowPosition({ position: inside }).outcome, "inconclusive");
    assert.equal(checkWindowPosition({ position: inside, everDetected: true }).outcome, "multiple");
});

test("refreshRate: only a shift beyond the threshold counts", () => {
    assert.equal(checkRefreshRate({ hz: 60, previousHz: null }).outcome, "inconclusive");
    assert.equal(checkRefreshRate({ hz: 62, previousHz: 60 }).outcome, "inconclusive");
    const changed = checkRefreshRate({ hz: 144, previousHz: 60 });
    assert.deepEqual([changed.outcome, changed.strength, changed.data.changed], ["multiple", "weak", true]);
});

// Observers read the browser through probes; stub just enough of it.
function withWindow(position, fn) {
    const saved = { window: globalThis.window, screen: globalThis.screen };
    globalThis.window = { screenX: position.screenX, screenY: position.screenY, outerWidth: position.outerWidth, outerHeight: position.outerHeight };
    globalThis.screen = { width: position.screenWidth, height: position.screenHeight };
    try {
        return fn();
    } finally {
        Object.assign(globalThis, saved);
    }
}

test("windowPosition observer: remembers a detection until reset, per observer", () => {
    const a = createWindowPositionObserver();
    const b = createWindowPositionObserver();
    withWindow(outside, () => a.sample());
    assert.equal(withWindow(inside, () => a.sample()).data.everDetected, true);
    assert.equal(withWindow(inside, () => b.sample()).data.everDetected, false);
    a.reset();
    assert.equal(withWindow(inside, () => a.sample()).data.everDetected, false);
});

test("refreshRate observer: compares with its own previous measurement and refuses overlap", async () => {
    const savedRaf = globalThis.requestAnimationFrame;
    let fps = 60;
    let now = 0;
    globalThis.requestAnimationFrame = (cb) => setImmediate(() => cb((now += 1000 / fps)));
    try {
        const observer = createRefreshRateObserver({ durationMs: 100 });
        const first = observer.measure();
        assert.equal(observer.measuring, true);
        assert.equal(await observer.measure(), null);
        assert.equal((await first).data.previousHz, null);
        fps = 144;
        const second = await observer.measure();
        assert.equal(second.data.changed, true);
        assert.equal(observer.measuring, false);
    } finally {
        globalThis.requestAnimationFrame = savedRaf;
    }
});

test("refresh and drag cards keep their old labels", async () => {
    const { presentRefreshRate, presentWindowPosition } = await import("../../scripts/ui/present.js");
    assert.equal(presentRefreshRate(checkRefreshRate({ hz: 59.94, previousHz: null })).label, "~60 Hz");
    assert.equal(presentRefreshRate(checkRefreshRate({ hz: 144, previousHz: 60 })).label, "rate changed");
    assert.equal(JSON.parse(presentRefreshRate(checkRefreshRate({ hz: 59.94, previousHz: 60.04 })).text).measuredHz, 59.9);
    assert.equal(presentWindowPosition(checkWindowPosition({ position: inside })).label, "watching");
    assert.deepEqual(JSON.parse(presentWindowPosition(checkWindowPosition({ position: outside })).text).primaryScreen, { width: 1920, height: 1080 });
});
