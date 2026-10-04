// ---------- Permissions API (no prompt) ----------
// Used by the webcam page ("camera"); the monitor uses monitor/probes/permission.js.
export async function checkPermissionState(name = "window-management") {
    if (!navigator.permissions || !navigator.permissions.query) {
        return {
            status: null,
            result: {
                state: "unknown",
                label: "unsupported",
                text: "navigator.permissions is not available in this browser."
            }
        };
    }

    try {
        const status = await navigator.permissions.query({ name });
        return {
            status,
            result: {
                state: status.state === "granted" ? "yes" : status.state === "denied" ? "no" : "warn",
                label: status.state,
                text: JSON.stringify({ [`${name} permission`]: status.state }, null, 2)
            }
        };
    } catch (err) {
        return {
            status: null,
            result: {
                state: "unknown",
                label: "unsupported",
                text: `${name} is not a recognized permission name here: ` + err.message
            }
        };
    }
}
