// ---------- 8. WebGL renderer ----------
// Opens a WebGL context, so callers run it once rather than on every update.
export function readWebGLRenderer() {
    try {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
        if (!gl) throw new Error("WebGL not available");
        const dbg = gl.getExtension("WEBGL_debug_renderer_info");
        return dbg
            ? { available: true, renderer: gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL), vendor: gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL), unmasked: true }
            : { available: true, renderer: gl.getParameter(gl.RENDERER), vendor: gl.getParameter(gl.VENDOR), unmasked: false };
    } catch (err) {
        return { available: false, error: err.message };
    }
}
