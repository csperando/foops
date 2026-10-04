import { test } from "node:test";
import assert from "node:assert/strict";
import { createSignal } from "../scripts/signal.js";

test("createSignal builds a supported signal", () => {
    assert.deepEqual(
        createSignal("isExtended", "evidence", { outcome: "multiple", strength: "strong", data: { value: true } }),
        { id: "isExtended", kind: "evidence", supported: true, outcome: "multiple", strength: "strong", data: { value: true } }
    );
});

test("createSignal clears outcome and strength when unsupported", () => {
    const signal = createSignal("isExtended", "evidence", { supported: false, outcome: "single", strength: "strong" });
    assert.equal(signal.outcome, null);
    assert.equal(signal.strength, null);
});

test("createSignal rejects an outcome that doesn't belong to its kind", () => {
    assert.throws(() => createSignal("x", "evidence", { outcome: "clean" }), TypeError);
    assert.throws(() => createSignal("x", "integrity", { outcome: "multiple" }), TypeError);
});

test("createSignal accepts any context outcome", () => {
    assert.equal(createSignal("virtualization", "context", { outcome: "virtual" }).outcome, "virtual");
});

test("createSignal rejects unknown kinds and strengths", () => {
    assert.throws(() => createSignal("x", "verdict", { outcome: "multiple" }), TypeError);
    assert.throws(() => createSignal("x", "evidence", { outcome: "multiple", strength: "medium" }), TypeError);
});

test("signals survive a JSON round trip", () => {
    const signal = createSignal("availOffset", "evidence", { outcome: "inconclusive", data: { left: 0, top: 0 } });
    assert.deepEqual(JSON.parse(JSON.stringify(signal)), signal);
});
