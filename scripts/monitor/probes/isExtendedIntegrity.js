import { isNativeFunction, isToStringPatched, tamperedPristineReferences } from "../../integrity/nativeCode.js";
import { getPristine } from "../../integrity/pristine.js";

// ---------- 6. Tamper detection for screen.isExtended ----------
// An override that fakes the value replaces the native getter. It's
// compared against the same getter from a pristine iframe realm — see
// integrity/nativeCode.js for why that can't be fooled by a per-function or
// page-wide `toString`. An own property on the `screen` instance shadows
// the prototype, so it's checked first.
export function readIsExtendedIntegrity() {
    if (!("isExtended" in screen)) return { present: false };
    const descriptor =
        Object.getOwnPropertyDescriptor(screen, "isExtended") ||
        Object.getOwnPropertyDescriptor(Screen.prototype, "isExtended");
    const pristine = getPristine();
    return {
        present: true,
        getterNative: !!descriptor && isNativeFunction(descriptor.get, pristine && pristine.screenIsExtended),
        toStringPatched: isToStringPatched(),
        pristineTampered: tamperedPristineReferences()
    };
}
