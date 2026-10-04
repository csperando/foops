// ---------- Virtualization hint vocabulary ----------
// Shared by the WebGL renderer check (virtualization) and the screen-label
// check (screenLabels). Both substring-match a string an attacker could set
// to anything, so they use the same list rather than maintaining two.
export const VM_HINTS = Object.freeze([
    "vmware", "virtualbox", "vbox", "parallels", "llvmpipe", "swiftshader",
    "basic render", "basic display", "microsoft basic", "hyper-v",
    "virtual", "qemu", "bochs", "remote desktop", "rdp"
]);

export function findVmHint(text) {
    const haystack = (text || "").toLowerCase();
    return VM_HINTS.find((hint) => haystack.includes(hint)) || null;
}
