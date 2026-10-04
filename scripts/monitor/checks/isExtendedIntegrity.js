import { createSignal } from "../../signal.js";

// ---------- 6. Tamper detection for screen.isExtended ----------
// A missing isExtended is the honest signature of an unsupported browser or
// an enterprise policy, not spoofing, so it's unsupported rather than
// tampered.
//
// Reasons, strongest first:
//   getter-not-native  the getter was replaced; its value can't be trusted
//   pristine-tampered  the clean reference copies were replaced inside a
//                      blank iframe this page created; only a script
//                      injected into every frame does that
//   tostring-patched   this page's Function.prototype.toString was replaced.
//                      Privacy browsers (Brave), frameworks (zone.js) and
//                      monitoring tools (Sentry) all do this legitimately,
//                      so it's "modified", not "tampered".
export function checkIsExtendedIntegrity({ present, getterNative = false, toStringPatched = null, pristineTampered = [] }) {
    if (!present) return createSignal("isExtendedIntegrity", "integrity", { supported: false, data: {} });

    let outcome = "clean", strength = null, reason = null;
    if (!getterNative) {
        outcome = "tampered"; strength = "strong"; reason = "getter-not-native";
    } else if (pristineTampered.length) {
        outcome = "tampered"; strength = "strong"; reason = "pristine-tampered";
    } else if (toStringPatched) {
        outcome = "modified"; strength = "weak"; reason = "tostring-patched";
    }
    return createSignal("isExtendedIntegrity", "integrity", {
        outcome,
        strength,
        data: { reason, getterNative, toStringPatched, pristineTampered }
    });
}
