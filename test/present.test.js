import { test } from "node:test";
import assert from "node:assert/strict";
import {
    presentGeneric,
    presentIsExtended,
    presentAvailOffset,
    presentPermission,
    presentVirtualization,
    presentEmbedding
} from "../scripts/ui/present.js";
import { createSignal } from "../scripts/signal.js";
import { checkIsExtended } from "../scripts/monitor/checks/isExtended.js";
import { checkAvailOffset } from "../scripts/monitor/checks/availOffset.js";
import { checkPermission } from "../scripts/monitor/checks/permission.js";
import { checkVirtualization } from "../scripts/monitor/checks/virtualization.js";
import { checkEmbedding } from "../scripts/monitor/checks/embedding.js";

// The dev page's cards must keep showing what they showed before the
// detectors were split into probes and checks.
const view = (v) => [v.state, v.label];

test("isExtended card", () => {
    assert.deepEqual(view(presentIsExtended(checkIsExtended({ supported: true, value: true }))), ["yes", "multiple"]);
    assert.deepEqual(view(presentIsExtended(checkIsExtended({ supported: true, value: false }))), ["no", "single"]);
    assert.deepEqual(view(presentIsExtended(checkIsExtended({ supported: false }))), ["unknown", "unsupported"]);
    assert.equal(presentIsExtended(checkIsExtended({ supported: true, value: true })).text, JSON.stringify({ "screen.isExtended": true }, null, 2));
});

test("availOffset card", () => {
    assert.deepEqual(view(presentAvailOffset(checkAvailOffset({ left: -1920, top: 0 }))), ["yes", "offset found"]);
    assert.deepEqual(view(presentAvailOffset(checkAvailOffset({ left: 0, top: 0 }))), ["warn", "inconclusive"]);
    assert.deepEqual(view(presentAvailOffset(checkAvailOffset({ left: null, top: null }))), ["unknown", "unsupported"]);
});

test("permission card", () => {
    const card = (state) => view(presentPermission(checkPermission({ name: "window-management", supported: true, state })));
    assert.deepEqual(card("granted"), ["yes", "granted"]);
    assert.deepEqual(card("denied"), ["no", "denied"]);
    assert.deepEqual(card("prompt"), ["warn", "prompt"]);
    const unsupported = presentPermission(checkPermission({ name: "window-management", supported: false, error: "nope" }));
    assert.deepEqual([...view(unsupported), unsupported.text], ["unknown", "unsupported", "nope"]);
});

test("virtualization card", () => {
    assert.deepEqual(view(presentVirtualization(checkVirtualization({ available: true, renderer: "llvmpipe", vendor: "Mesa" }))), ["warn", "likely virtualized"]);
    assert.deepEqual(view(presentVirtualization(checkVirtualization({ available: true, renderer: "GeForce", vendor: "NVIDIA" }))), ["yes", "looks physical"]);
    const unavailable = presentVirtualization(checkVirtualization({ available: false, error: "WebGL not available" }));
    assert.deepEqual([...view(unavailable), unavailable.text], ["unknown", "unavailable", "Could not read WebGL renderer info: WebGL not available"]);
});

test("embedding card", () => {
    assert.deepEqual(view(presentEmbedding(checkEmbedding({ framed: false, windowManagementAllowed: true }))), ["yes", "top-level"]);
    assert.deepEqual(view(presentEmbedding(checkEmbedding({ framed: true, windowManagementAllowed: true }))), ["yes", "iframe"]);
    assert.deepEqual(view(presentEmbedding(checkEmbedding({ framed: true, windowManagementAllowed: false }))), ["warn", "api blocked"]);
});

test("generic fallback", () => {
    assert.deepEqual(view(presentGeneric(createSignal("x", "integrity", { outcome: "tampered" }))), ["warn", "tampered"]);
    assert.deepEqual(view(presentGeneric(createSignal("x", "evidence", { supported: false }))), ["unknown", "unsupported"]);
});
