import { test } from "node:test";
import assert from "node:assert/strict";
import { probeSync, probe } from "../scripts/integrity/stackProbe.js";

// Node runs on V8, so native brand checks behave as they do in Chrome.
const nativeGetter = Object.getOwnPropertyDescriptor(Map.prototype, "size").get;

test("probeSync passes a native getter", () => {
    assert.deepEqual(probeSync(nativeGetter), { native: true });
});

test("probeSync flags a fake that accepts an illegal receiver", () => {
    const fake = function size() { return 0; };
    const result = probeSync(fake);
    assert.equal(result.native, false);
    assert.match(result.reason, /accepted an illegal receiver/);
});

test("probeSync flags a wrapper that calls through", () => {
    const wrapper = function size() { return Reflect.apply(nativeGetter, this, []); };
    const result = probeSync(wrapper);
    assert.equal(result.native, false);
    assert.equal(result.reason, "script frames in its stack");
    assert.ok(result.frames.length > 0);
});

test("probeSync flags a Proxy that calls through", () => {
    const proxy = new Proxy(nativeGetter, { apply: (target, self, args) => Reflect.apply(target, self, args) });
    const result = probeSync(proxy);
    assert.equal(result.native, false);
    assert.equal(result.reason, "script frames in its stack");
});

test("probeSync reports a stack without its own frame as rewritten", () => {
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = 0;
    try {
        assert.deepEqual(probeSync(nativeGetter), { native: false, reason: "stack trace hidden or rewritten" });
    } finally {
        Error.stackTraceLimit = limit;
    }
});

test("probeSync reports a missing function", () => {
    assert.deepEqual(probeSync(undefined), { native: false, reason: "missing" });
});

test("probe passes a native function and flags an async wrapper", async () => {
    assert.deepEqual(await probe(nativeGetter), { native: true });
    const wrapper = async function size() { return Reflect.apply(nativeGetter, this, []); };
    const result = await probe(wrapper);
    assert.equal(result.native, false);
    assert.equal(result.reason, "script frames in its stack");
});
