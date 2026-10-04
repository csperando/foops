import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { installFakeBrowser } from "./helpers/fakeBrowser.js";

let out;
before(() => {
    out = mkdtempSync(join(tmpdir(), "foops-build-"));
    execFileSync(process.execPath, ["build.mjs", out], { cwd: new URL("..", import.meta.url) });
});
after(() => rmSync(out, { recursive: true, force: true }));

const read = (file) => readFileSync(join(out, file), "utf8");
const load = (file) => import(pathToFileURL(join(out, file)).href);

test("bundles don't depend on import.meta, and keep the stack probe's marker", () => {
    for (const file of ["foops.esm.js", "foops.min.js"]) {
        assert.ok(!read(file).includes("import.meta"), `${file} uses import.meta`);
        assert.ok(read(file).includes("foopsStackProbe$boundary"), `${file} lost the marker`);
    }
});

test("the IIFE exposes window.foops", () => {
    const src = read("foops.min.js");
    const scope = {};
    new Function("window", src.replace(/^var foops=/, "window.foops="))(scope);
    assert.equal(typeof scope.foops.monitor.createSession, "function");
});

test("the ESM bundle runs a session", async () => {
    const env = installFakeBrowser({ isExtended: true });
    try {
        const { monitor, version } = await load("foops.esm.js");
        const report = await monitor.run({ cadence: { refreshTimeoutMs: 200 } });
        assert.equal(report.verdict, "multiple");
        assert.equal(report.version, version);
    } finally {
        env.restore();
    }
});

test("the server bundle re-scores without any browser globals", async () => {
    const { rescore } = await load("server.js");
    const report = {
        version: "0.0.0",
        signals: { isExtended: { id: "isExtended", kind: "evidence", supported: true, outcome: "single", strength: "strong", data: { value: true, blockedByPolicy: false } } }
    };
    const result = rescore(report);
    assert.equal(result.verdict, "multiple");
    assert.equal(result.mismatches[0].id, "isExtended");
});
