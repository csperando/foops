import { test } from "node:test";
import assert from "node:assert/strict";
import { checkVirtualization } from "../../scripts/monitor/checks/virtualization.js";
import { checkPermission } from "../../scripts/monitor/checks/permission.js";
import { findVmHint } from "../../scripts/monitor/checks/vmHints.js";

test("findVmHint is case-insensitive and tolerates missing text", () => {
    assert.equal(findVmHint("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))"), "swiftshader");
    assert.equal(findVmHint("NVIDIA GeForce RTX 4070"), null);
    assert.equal(findVmHint(undefined), null);
});

test("virtualization: a software renderer reads as virtual", () => {
    const signal = checkVirtualization({ available: true, renderer: "llvmpipe (LLVM 15.0.7, 256 bits)", vendor: "Mesa", unmasked: true });
    assert.equal(signal.kind, "context");
    assert.equal(signal.outcome, "virtual");
    assert.equal(signal.strength, "weak");
    assert.equal(signal.data.matchedHint, "llvmpipe");
});

test("virtualization: a hardware renderer reads as physical", () => {
    const signal = checkVirtualization({ available: true, renderer: "ANGLE (NVIDIA GeForce RTX 4070)", vendor: "Google Inc. (NVIDIA)", unmasked: true });
    assert.equal(signal.outcome, "physical");
    assert.equal(signal.strength, null);
});

test("virtualization: unsupported without WebGL", () => {
    const signal = checkVirtualization({ available: false, error: "WebGL not available" });
    assert.equal(signal.supported, false);
    assert.equal(signal.data.error, "WebGL not available");
});

test("permission: passes the state through as a context outcome", () => {
    for (const state of ["granted", "denied", "prompt"]) {
        const signal = checkPermission({ name: "window-management", supported: true, state });
        assert.equal(signal.outcome, state);
        assert.equal(signal.kind, "context");
    }
});

test("permission: unsupported keeps the reason", () => {
    const signal = checkPermission({ name: "window-management", supported: false, state: null, error: "nope" });
    assert.equal(signal.supported, false);
    assert.equal(signal.data.error, "nope");
});
