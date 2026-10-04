import { createSignal } from "../../signal.js";

// ---------- 3. Permission state ----------
// Context, not evidence: a prior grant means getScreenDetails() (method 2)
// can run without a prompt.
export function checkPermission({ name, supported, state, error = null }) {
    if (!supported) return createSignal("permission", "context", { supported: false, data: { name, state: null, error } });
    return createSignal("permission", "context", { outcome: state, data: { name, state } });
}
