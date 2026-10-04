import { test } from "node:test";
import assert from "node:assert/strict";
import { checkScreenDetails, checkScreenLabels, checkScreenLabelIntegrity } from "../../scripts/monitor/checks/screenDetails.js";
import { presentScreenDetails } from "../../scripts/ui/present.js";

const screen = (label, extra = {}) => ({ label, width: 1920, height: 1080, left: 0, top: 0, isPrimary: true, isInternal: false, devicePixelRatio: 1, ...extra });

test("screenDetails: counts screens", () => {
    assert.equal(checkScreenDetails({ supported: true, screens: [screen("A"), screen("B")] }).outcome, "multiple");
    const single = checkScreenDetails({ supported: true, screens: [screen("A")] });
    assert.equal(single.outcome, "single");
    assert.equal(single.strength, "strong");
    assert.equal(single.data.count, 1);
});

test("screenDetails: a denial is inconclusive, not unsupported", () => {
    const signal = checkScreenDetails({ supported: true, error: "Permission denied" });
    assert.equal(signal.supported, true);
    assert.equal(signal.outcome, "inconclusive");
    assert.equal(signal.data.error, "Permission denied");
});

test("screenLabels: matches a virtualization label", () => {
    const signal = checkScreenLabels({ screens: [screen("Dell U2720Q"), screen("VMware SVGA 3D")] });
    assert.equal(signal.outcome, "virtual");
    assert.deepEqual(signal.data.matches, [{ index: 1, label: "VMware SVGA 3D", hint: "vmware" }]);
});

test("screenLabels: ignores ordinary and missing labels", () => {
    const signal = checkScreenLabels({ screens: [screen("Built-in Retina Display"), screen(undefined), screen("")] });
    assert.equal(signal.outcome, "physical");
    assert.deepEqual(signal.data.matches, []);
});

test("screenLabelIntegrity: a non-native or shadowed getter is tampered", () => {
    assert.equal(checkScreenLabelIntegrity({ supported: true, getterNative: false, shadowedOnScreen: false }).outcome, "tampered");
    assert.equal(checkScreenLabelIntegrity({ supported: true, getterNative: true, shadowedOnScreen: true }).outcome, "tampered");
    assert.equal(checkScreenLabelIntegrity({ supported: true, getterNative: true, shadowedOnScreen: false }).outcome, "clean");
    assert.equal(checkScreenLabelIntegrity({ supported: false }).supported, false);
});

test("screen-details card: a spoofed label outranks a VM label, which outranks the count", () => {
    const screens = [screen("VMware SVGA 3D"), screen("B")];
    const details = checkScreenDetails({ supported: true, screens });
    const labels = checkScreenLabels({ screens });
    const clean = checkScreenLabelIntegrity({ supported: true, getterNative: true, shadowedOnScreen: false });
    const spoofed = checkScreenLabelIntegrity({ supported: true, getterNative: false, shadowedOnScreen: false });
    assert.equal(presentScreenDetails({ details, labels, labelIntegrity: spoofed }).label, "label spoofed");
    assert.equal(presentScreenDetails({ details, labels, labelIntegrity: clean }).label, "vm label found");
    const plain = [screen("A"), screen("B")];
    const view = presentScreenDetails({
        details: checkScreenDetails({ supported: true, screens: plain }),
        labels: checkScreenLabels({ screens: plain }),
        labelIntegrity: clean
    });
    assert.deepEqual([view.state, view.label], ["yes", "2 screens"]);
    assert.deepEqual(JSON.parse(view.text).labelIntegrity, { getterNative: true, shadowedOnScreen: false, spoofed: false });
});

test("screen-details card: live, single, unsupported and denied labels", () => {
    const one = [screen("A")];
    const label = (details) => presentScreenDetails({ details, labels: checkScreenLabels({ screens: one }) }).label;
    assert.equal(label(checkScreenDetails({ supported: true, screens: one })), "1 screen");
    assert.equal(label(checkScreenDetails({ supported: true, screens: one, live: true })), "1 screens (live)");
    assert.equal(presentScreenDetails({ details: checkScreenDetails({ supported: false }) }).label, "unsupported");
    assert.equal(presentScreenDetails({ details: checkScreenDetails({ supported: true, error: "x" }) }).label, "denied/error");
});
