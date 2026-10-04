import { test } from "node:test";
import assert from "node:assert/strict";
import { checkIsExtended } from "../../scripts/monitor/checks/isExtended.js";
import { checkAvailOffset } from "../../scripts/monitor/checks/availOffset.js";
import { checkIsExtendedIntegrity } from "../../scripts/monitor/checks/isExtendedIntegrity.js";
import { checkIsExtendedConsistency } from "../../scripts/monitor/checks/isExtendedConsistency.js";
import { presentIntegrity } from "../../scripts/ui/present.js";

const clean = { present: true, getterNative: true, toStringPatched: false, pristineTampered: [] };

test("isExtendedIntegrity: clean", () => {
    const signal = checkIsExtendedIntegrity(clean);
    assert.equal(signal.outcome, "clean");
    assert.equal(signal.data.reason, null);
});

test("isExtendedIntegrity: reasons in order of strength", () => {
    const all = { present: true, getterNative: false, toStringPatched: true, pristineTampered: ["toString"] };
    assert.equal(checkIsExtendedIntegrity(all).data.reason, "getter-not-native");
    assert.equal(checkIsExtendedIntegrity({ ...all, getterNative: true }).data.reason, "pristine-tampered");
    const patched = checkIsExtendedIntegrity({ ...clean, toStringPatched: true });
    assert.deepEqual([patched.outcome, patched.strength, patched.data.reason], ["modified", "weak", "tostring-patched"]);
});

test("isExtendedIntegrity: a missing isExtended is unsupported, not tampered", () => {
    assert.equal(checkIsExtendedIntegrity({ present: false }).supported, false);
});

const single = checkIsExtended({ supported: true, value: false });
const position = (everDetected) => ({ supported: true, data: { everDetected } });

test("isExtendedConsistency: single display plus another heuristic's evidence is suspicious", () => {
    assert.equal(checkIsExtendedConsistency({ isExtended: single, availOffset: checkAvailOffset({ left: -1920, top: 0 }) }).outcome, "suspicious");
    assert.equal(checkIsExtendedConsistency({ isExtended: single, windowPosition: position(true) }).outcome, "suspicious");
});

test("isExtendedConsistency: agreement is clean", () => {
    assert.equal(checkIsExtendedConsistency({ isExtended: single, availOffset: checkAvailOffset({ left: 0, top: 0 }), windowPosition: position(false) }).outcome, "clean");
    const multiple = checkIsExtended({ supported: true, value: true });
    assert.equal(checkIsExtendedConsistency({ isExtended: multiple, windowPosition: position(true) }).outcome, "clean");
});

test("isExtendedConsistency: unsupported without isExtended", () => {
    assert.equal(checkIsExtendedConsistency({ isExtended: checkIsExtended({ supported: false }) }).supported, false);
});

test("integrity card: getter problems outrank the cross-check", () => {
    const suspicious = checkIsExtendedConsistency({ isExtended: single, windowPosition: position(true) });
    const tampered = checkIsExtendedIntegrity({ ...clean, getterNative: false });
    assert.equal(presentIntegrity({ integrity: tampered, consistency: suspicious }).label, "possibly overridden");
    assert.equal(presentIntegrity({ integrity: checkIsExtendedIntegrity(clean), consistency: suspicious }).label, "inconsistent");
    const ok = presentIntegrity({ integrity: checkIsExtendedIntegrity(clean), consistency: checkIsExtendedConsistency({ isExtended: single }) });
    assert.deepEqual([ok.state, ok.label], ["yes", "looks trustworthy"]);
});
