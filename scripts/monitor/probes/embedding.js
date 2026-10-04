// ---------- 9. Embedding context ----------
// Whether the Window Management API is allowed in this document. A
// cross-origin iframe without allow="window-management" is denied it, yet
// screen.isExtended still exists and returns a boolean there. null when the
// browser can't say (no Permissions Policy API).
export function readWindowManagementPolicy() {
    const policy = document.permissionsPolicy || document.featurePolicy;
    if (!policy || typeof policy.allowsFeature !== "function") return null;
    try {
        return policy.allowsFeature("window-management");
    } catch (err) {
        return null;
    }
}

export function readEmbedding() {
    let framed;
    try {
        framed = window.top !== window.self;
    } catch (err) {
        framed = true;
    }
    return { framed, windowManagementAllowed: readWindowManagementPolicy() };
}
