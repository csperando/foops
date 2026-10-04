import { isNativeFunction } from "../../integrity/nativeCode.js";
import { getPristine } from "../../integrity/pristine.js";

// ---------- 2. getScreenDetails() ----------
export function isScreenDetailsSupported() {
    return "getScreenDetails" in window;
}

// Prompts for the window-management permission, so it must run from a user
// gesture. Returns the live ScreenDetails (it fires "screenschange").
export function requestScreenDetails() {
    return window.getScreenDetails();
}

// Plain copies of the live ScreenDetailed objects.
export function shapeScreens(screens) {
    return screens.map((s) => ({
        label: s.label,
        width: s.width,
        height: s.height,
        left: s.left,
        top: s.top,
        isPrimary: s.isPrimary,
        isInternal: s.isInternal,
        devicePixelRatio: s.devicePixelRatio
    }));
}

// screen.label comes from a getter on ScreenDetailed.prototype, as spoofable
// as screen.isExtended. A spoof replaces the getter (or shadows `label` on a
// screen object) to report a plausible name like "Generic PnP Monitor".
// Same two-part native check as isExtended's integrity probe: source text
// against the pristine realm's getter, plus the toString-independent
// behavior probe.
export function readLabelGetterIntegrity(screens) {
    if (!("ScreenDetailed" in window)) return { supported: false };
    const descriptor = Object.getOwnPropertyDescriptor(ScreenDetailed.prototype, "label");
    const pristine = getPristine();
    return {
        supported: true,
        getterNative: !!descriptor && isNativeFunction(descriptor.get, pristine && pristine.screenDetailedLabel),
        shadowedOnScreen: screens.some((s) => Object.prototype.hasOwnProperty.call(s, "label"))
    };
}
