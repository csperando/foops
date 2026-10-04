import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultScorer } from "../../scripts/monitor/score.js";
import { checkIsExtended } from "../../scripts/monitor/checks/isExtended.js";
import { checkIsExtendedIntegrity } from "../../scripts/monitor/checks/isExtendedIntegrity.js";

test("defaultScorer follows isExtended", () => {
    assert.deepEqual(defaultScorer({ isExtended: checkIsExtended({ supported: true, value: true }) }), { verdict: "multiple", score: 1 });
    assert.deepEqual(defaultScorer({ isExtended: checkIsExtended({ supported: true, value: false }) }), { verdict: "single", score: 0 });
});

test("defaultScorer is unknown without a usable isExtended", () => {
    assert.deepEqual(defaultScorer({}), { verdict: "unknown", score: null });
    assert.deepEqual(defaultScorer({ isExtended: checkIsExtended({ supported: false }) }), { verdict: "unknown", score: null });
    const blocked = checkIsExtended({ supported: true, value: false, windowManagementAllowed: false });
    assert.equal(defaultScorer({ isExtended: blocked }).verdict, "unknown");
});

test("defaultScorer ignores tamper signals for now", () => {
    const tampered = checkIsExtendedIntegrity({ present: true, getterNative: false, toStringPatched: false, pristineTampered: [] });
    const signals = { isExtended: checkIsExtended({ supported: true, value: false }), isExtendedIntegrity: tampered };
    assert.equal(defaultScorer(signals).verdict, "single");
});
