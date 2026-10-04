// ---------- 3. Permissions API (no prompt) ----------
// Also returns the PermissionStatus (not serializable) so callers can
// listen for changes; checks only take the plain fields.
export async function queryPermission(name = "window-management") {
    if (!navigator.permissions || !navigator.permissions.query) {
        return { name, supported: false, state: null, error: "navigator.permissions is not available in this browser.", status: null };
    }
    try {
        const status = await navigator.permissions.query({ name });
        return { name, supported: true, state: status.state, error: null, status };
    } catch (err) {
        return { name, supported: false, state: null, error: `${name} is not a recognized permission name here: ` + err.message, status: null };
    }
}
