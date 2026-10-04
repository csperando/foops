import { test } from "node:test";
import assert from "node:assert/strict";
import { checkEmbedding } from "../../scripts/monitor/checks/embedding.js";
import { checkIsExtended } from "../../scripts/monitor/checks/isExtended.js";
import { presentIsExtended } from "../../scripts/ui/present.js";

test("embedding: top-level and framed", () => {
    assert.equal(checkEmbedding({ framed: false, windowManagementAllowed: true }).outcome, "top");
    const framed = checkEmbedding({ framed: true, windowManagementAllowed: true });
    assert.deepEqual([framed.outcome, framed.strength], ["iframe", null]);
});

test("embedding: a blocked policy is a strong context signal", () => {
    assert.equal(checkEmbedding({ framed: true, windowManagementAllowed: false }).strength, "strong");
});

test("isExtended: a frame denied window-management is unsupported, whatever the value says", () => {
    const signal = checkIsExtended({ supported: true, value: false, windowManagementAllowed: false });
    assert.equal(signal.supported, false);
    assert.equal(signal.outcome, null);
    assert.equal(signal.data.blockedByPolicy, true);
    assert.equal(presentIsExtended(signal).label, "blocked");
});

test("isExtended: an unknown policy (null) is trusted as before", () => {
    assert.equal(checkIsExtended({ supported: true, value: true, windowManagementAllowed: null }).outcome, "multiple");
});
