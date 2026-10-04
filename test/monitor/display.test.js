import { test } from "node:test";
import assert from "node:assert/strict";
import { checkIsExtended } from "../../scripts/monitor/checks/isExtended.js";
import { checkAvailOffset } from "../../scripts/monitor/checks/availOffset.js";

test("isExtended: true is strong evidence of multiple displays", () => {
    const signal = checkIsExtended({ supported: true, value: true });
    assert.equal(signal.outcome, "multiple");
    assert.equal(signal.strength, "strong");
});

test("isExtended: false is strong evidence of a single display", () => {
    const signal = checkIsExtended({ supported: true, value: false });
    assert.equal(signal.outcome, "single");
    assert.equal(signal.strength, "strong");
});

test("isExtended: unsupported", () => {
    const signal = checkIsExtended({ supported: false, value: null });
    assert.equal(signal.supported, false);
    assert.equal(signal.outcome, null);
});

test("availOffset: a non-zero offset is weak evidence of multiple displays", () => {
    const signal = checkAvailOffset({ left: -1920, top: 0 });
    assert.equal(signal.outcome, "multiple");
    assert.equal(signal.strength, "weak");
    assert.equal(signal.data.offsetDetected, true);
});

test("availOffset: a display to the right or below counts too", () => {
    assert.equal(checkAvailOffset({ left: 1920, top: 0 }).outcome, "multiple");
    assert.equal(checkAvailOffset({ left: 0, top: 1080 }).outcome, "multiple");
});

test("availOffset: a taskbar-sized positive offset is inconclusive", () => {
    assert.equal(checkAvailOffset({ left: 48, top: 0 }).outcome, "inconclusive");
    assert.equal(checkAvailOffset({ left: 0, top: 40 }).data.offsetDetected, false);
});

test("availOffset: a zero offset is inconclusive, not single", () => {
    const signal = checkAvailOffset({ left: 0, top: 0 });
    assert.equal(signal.outcome, "inconclusive");
    assert.equal(signal.strength, null);
});

test("availOffset: unsupported when either value is missing", () => {
    assert.equal(checkAvailOffset({ left: null, top: 0 }).supported, false);
});
