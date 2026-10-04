import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeBrowser } from "./helpers/fakeBrowser.js";

// Imported before any fake browser exists: the server entry must not touch
// browser globals.
const server = await import("../scripts/lib/server.js");
const { monitor, version } = await import("../scripts/lib/index.js");

async function clientReport(options = {}, run = async (s) => s) {
    const env = installFakeBrowser(options);
    try {
        const session = monitor.createSession({ cadence: { refreshTimeoutMs: 200 } });
        await session.start();
        await run(session, env);
        return JSON.parse(JSON.stringify(session.stop()));
    } finally {
        env.restore();
    }
}

test("an honest report re-scores to the same verdict with no mismatches", async () => {
    const report = await clientReport({ isExtended: true, screens: [{ label: "A" }, { label: "B" }] }, (s) => s.screenDetails());
    const result = server.rescore(report);
    assert.equal(result.verdict, report.verdict);
    assert.equal(result.score, report.score);
    assert.deepEqual(result.mismatches, []);
    assert.deepEqual(result.unknownChecks, []);
    assert.equal(result.versionMatches, true);
    assert.deepEqual(Object.keys(result.signals).sort(), Object.keys(report.signals).sort());
});

test("an edited verdict is ignored", async () => {
    const report = await clientReport({ isExtended: true });
    report.verdict = "single";
    report.score = 0;
    assert.equal(server.rescore(report).verdict, "multiple");
});

test("an edited outcome is reported as a mismatch and not used", async () => {
    const report = await clientReport({ isExtended: true });
    report.signals.isExtended.outcome = "single";
    const result = server.rescore(report);
    assert.equal(result.verdict, "multiple");
    assert.deepEqual(result.mismatches, [{ id: "isExtended", reported: "single", recomputed: "multiple" }]);
});

test("composites are recomputed from the other signals", async () => {
    const report = await clientReport({ isExtended: false, availLeft: -1920 });
    assert.equal(report.signals.isExtendedConsistency.outcome, "suspicious");
    report.signals.isExtendedConsistency.outcome = "clean";
    report.signals.isExtendedConsistency.strength = null;
    const result = server.rescore(report);
    assert.equal(result.signals.isExtendedConsistency.outcome, "suspicious");
    assert.equal(result.mismatches[0].id, "isExtendedConsistency");
});

test("a blocked isExtended stays blocked", async () => {
    const report = await clientReport({ framed: true, windowManagementAllowed: false });
    const result = server.rescore(report);
    assert.equal(result.signals.isExtended.data.blockedByPolicy, true);
    assert.deepEqual(result.mismatches, []);
});

test("custom scorers run on the recomputed signals", async () => {
    const report = await clientReport({ isExtended: false });
    const result = server.rescore(report, { scorer: (s) => ({ verdict: s.isExtended.outcome, score: null }) });
    assert.equal(result.verdict, "single");
});

test("garbage in: unknown checks, malformed signals, wrong version", () => {
    const result = server.rescore({ version: "0.0.0", signals: { nope: { data: {} }, availOffset: { outcome: "multiple", data: null } } });
    assert.deepEqual(result.unknownChecks, ["nope"]);
    assert.equal(result.versionMatches, false);
    assert.equal(result.verdict, "unknown");
    assert.equal(server.rescore(undefined).verdict, "unknown");
});

test("the server entry exposes its version and the default scorer", () => {
    assert.equal(server.version, version);
    assert.equal(server.defaultScorer, monitor.defaultScorer);
});
