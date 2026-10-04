import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installFakeBrowser } from "../helpers/fakeBrowser.js";
import { createSession, CHECK_IDS } from "../../scripts/monitor/session.js";

let env;
const sessions = [];

function session(options) {
    const s = createSession({ cadence: { windowPositionMs: 60000, refreshRateMs: 60000, refreshTimeoutMs: 200 }, ...options });
    sessions.push(s);
    return s;
}

afterEach(() => {
    for (const s of sessions.splice(0)) s.stop();
    if (env) env.restore();
    env = null;
});

test("start() resolves with a report of every passive check", async () => {
    env = installFakeBrowser();
    const report = await session().start();
    for (const id of ["isExtended", "availOffset", "windowPosition", "isExtendedIntegrity", "isExtendedConsistency", "refreshRate", "virtualization", "permission", "embedding"]) {
        assert.ok(report.signals[id], `missing ${id}`);
    }
    assert.equal(report.signals.screenDetails, undefined);
    assert.equal(report.signals.isExtended.outcome, "single");
    assert.equal(report.signals.permission.outcome, "prompt");
    assert.ok(report.timeline.length >= 9);
    assert.ok(report.startedAt > 0);
});

test("reports survive a JSON round trip", async () => {
    env = installFakeBrowser();
    const report = await session().start();
    assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
});

test("checks limits what runs and what's reported; dependencies stay internal", async () => {
    env = installFakeBrowser({ availLeft: -1920 });
    const report = await session({ checks: ["isExtendedConsistency"] }).start();
    assert.deepEqual(Object.keys(report.signals), ["isExtendedConsistency"]);
    assert.equal(report.signals.isExtendedConsistency.outcome, "suspicious");
});

test("unknown check ids are rejected", () => {
    assert.throws(() => createSession({ checks: ["isExtended", "nope"] }), /nope/);
    assert.equal(CHECK_IDS.length, 12);
});

test("a display change updates the report and adds a timeline entry", async () => {
    env = installFakeBrowser();
    const s = session();
    await s.start();
    const changes = [];
    s.on("change", (report, entries) => changes.push(...entries));
    env.screen.isExtended = true;
    env.screen.dispatch("change");
    assert.equal(s.report().signals.isExtended.outcome, "multiple");
    assert.deepEqual(changes.map((e) => [e.id, e.outcome]), [["isExtended", "multiple"], ["verdict", "multiple"]]);
    assert.equal(s.report().verdict, "multiple");
});

test("updates without an outcome change don't touch the timeline", async () => {
    env = installFakeBrowser();
    const s = session({ checks: ["isExtended"] });
    await s.start();
    let updates = 0;
    s.on("update", () => updates++);
    env.window.dispatch("resize");
    assert.equal(updates, 1);
    assert.deepEqual(s.report().timeline.map((e) => e.id), ["isExtended", "verdict"]);
});

test("sessions don't share observer memory", async () => {
    env = installFakeBrowser();
    const a = session({ checks: ["windowPosition"] });
    await a.start();
    env.window.screenX = 1800;
    env.window.dispatch("resize");
    assert.equal(a.report().signals.windowPosition.outcome, "multiple");
    env.window.screenX = 100;
    const b = session({ checks: ["windowPosition"] });
    const report = await b.start();
    assert.equal(report.signals.windowPosition.outcome, "inconclusive");
    assert.equal(a.report().signals.windowPosition.outcome, "multiple");
});

test("stop() removes every listener and freezes the report", async () => {
    env = installFakeBrowser();
    const s = session();
    await s.start();
    assert.ok(env.window.listenerCount("resize") > 0);
    const final = s.stop();
    assert.equal(s.state, "stopped");
    assert.equal(env.window.listenerCount("resize"), 0);
    assert.equal(env.screen.listenerCount("change"), 0);
    assert.equal(env.permissionStatus.listenerCount("change"), 0);
    env.screen.isExtended = true;
    env.screen.dispatch("change");
    assert.deepEqual(s.report(), final);
});

test("a session starts only once", async () => {
    env = installFakeBrowser();
    const s = session({ checks: ["isExtended"] });
    await s.start();
    await assert.rejects(() => s.start());
});

test("reset() clears observer memory and restarts the timeline from the current state", async () => {
    env = installFakeBrowser();
    const s = session({ checks: ["isExtended", "windowPosition"] });
    await s.start();
    env.window.screenX = 1800;
    env.window.dispatch("resize");
    env.window.screenX = 100;
    s.reset();
    const report = s.report();
    assert.equal(report.signals.windowPosition.outcome, "inconclusive");
    assert.deepEqual(report.timeline.map((e) => e.id).sort(), ["isExtended", "verdict", "windowPosition", "windowPosition"].sort());
});

test("permission changes are picked up while running", async () => {
    env = installFakeBrowser();
    const s = session({ checks: ["permission"] });
    await s.start();
    env.permissionStatus.state = "granted";
    env.permissionStatus.dispatch("change");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(s.report().signals.permission.outcome, "granted");
});

test("screenDetails(): counts screens and follows screenschange", async () => {
    const screens = [{ label: "A", width: 1920, height: 1080 }, { label: "B", width: 1920, height: 1080 }];
    env = installFakeBrowser({ screens });
    const s = session();
    await s.start();
    const report = await s.screenDetails();
    assert.equal(report.signals.screenDetails.outcome, "multiple");
    assert.equal(report.signals.screenLabels.outcome, "physical");
    screens.pop();
    env.window.screenDetails.dispatch("screenschange");
    assert.equal(s.report().signals.screenDetails.outcome, "single");
    assert.equal(s.report().signals.screenDetails.data.live, true);
});

test("screenDetails(): unsupported without getScreenDetails", async () => {
    env = installFakeBrowser();
    const s = session();
    await s.start();
    assert.equal((await s.screenDetails()).signals.screenDetails.supported, false);
});

test("embedded without window-management: isExtended is blocked", async () => {
    env = installFakeBrowser({ framed: true, windowManagementAllowed: false, isExtended: false });
    const report = await session().start();
    assert.equal(report.signals.isExtended.supported, false);
    assert.equal(report.signals.isExtended.data.blockedByPolicy, true);
    assert.equal(report.signals.embedding.outcome, "iframe");
    assert.equal(report.signals.isExtendedConsistency.supported, false);
});

test("the default scorer's verdict and score are in every report", async () => {
    env = installFakeBrowser({ isExtended: true });
    const report = await session().start();
    assert.equal(report.verdict, "multiple");
    assert.equal(report.score, 1);
});

test("a custom scorer replaces the verdict and sees every requested signal", async () => {
    env = installFakeBrowser({ isExtended: false, availLeft: -1920 });
    let seen;
    const scorer = (signals) => {
        seen = Object.keys(signals);
        return signals.isExtendedConsistency && signals.isExtendedConsistency.outcome === "suspicious"
            ? { verdict: "multiple", score: 0.7 }
            : { verdict: "single", score: 0 };
    };
    const report = await session({ scorer }).start();
    assert.deepEqual([report.verdict, report.score], ["multiple", 0.7]);
    assert.ok(seen.includes("isExtendedConsistency") && seen.includes("isExtended"));
});

test("an idle session reports nothing yet and stops cleanly", () => {
    env = installFakeBrowser();
    const s = session();
    const report = s.report();
    assert.deepEqual([report.verdict, report.startedAt, report.signals, report.timeline], ["unknown", null, {}, []]);
    assert.deepEqual(s.stop(), report);
    assert.equal(s.state, "idle");
});

test("screenDetails() needs a running session that includes it", async () => {
    env = installFakeBrowser();
    await assert.rejects(() => session().screenDetails(), /Start the session/);
    const s = session({ checks: ["isExtended"] });
    await s.start();
    await assert.rejects(() => s.screenDetails(), /isn't one of this session's checks/);
});

test("unknown events are rejected and listeners can be removed", async () => {
    env = installFakeBrowser();
    const s = session({ checks: ["isExtended"] });
    assert.throws(() => s.on("nope", () => {}), /Unknown event/);
    let calls = 0;
    const off = s.on("update", () => calls++);
    await s.start();
    off();
    env.window.dispatch("resize");
    assert.equal(calls, 1);
});
