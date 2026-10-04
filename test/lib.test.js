import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installFakeBrowser } from "./helpers/fakeBrowser.js";
import { monitor, version } from "../scripts/lib/index.js";

let env;
afterEach(() => {
    if (env) env.restore();
    env = null;
});

const FAST = { cadence: { refreshTimeoutMs: 200 } };

test("version matches package.json and is stamped on reports", async () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert.equal(version, pkg.version);
    env = installFakeBrowser();
    assert.equal((await monitor.run(FAST)).version, pkg.version);
});

test("run() returns a finished report and leaves nothing running", async () => {
    env = installFakeBrowser({ isExtended: true });
    const report = await monitor.run(FAST);
    assert.equal(report.verdict, "multiple");
    assert.equal(env.window.listenerCount("resize"), 0);
});

test("run() takes a custom scorer", async () => {
    env = installFakeBrowser();
    const report = await monitor.run({ ...FAST, scorer: () => ({ verdict: "x", score: 0.5 }) });
    assert.deepEqual([report.verdict, report.score], ["x", 0.5]);
});

test("every check is callable on its own", async () => {
    env = installFakeBrowser({ isExtended: true, screens: [{ label: "A" }, { label: "B" }] });
    assert.deepEqual(Object.keys(monitor.checks), monitor.CHECK_IDS);
    assert.equal((await monitor.checks.isExtended()).outcome, "multiple");
    assert.equal((await monitor.checks.embedding()).outcome, "top");
    assert.equal((await monitor.checks.screenDetails()).data.count, 2);
    assert.equal((await monitor.checks.isExtendedConsistency()).id, "isExtendedConsistency");
    assert.equal(env.window.listenerCount("resize"), 0);
});

test("the public surface is frozen", () => {
    assert.ok(Object.isFrozen(monitor));
    assert.ok(Object.isFrozen(monitor.checks));
});
