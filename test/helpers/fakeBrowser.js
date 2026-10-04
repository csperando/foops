// Just enough of a browser for sessions to run under node --test: window,
// screen, document, navigator.permissions and requestAnimationFrame.
// No DOM, so WebGL and the pristine iframe are unavailable (those checks
// report unsupported or tampered here); tests cover session wiring, not
// those probes.

function eventTarget(fields = {}) {
    const handlers = {};
    return Object.assign(fields, {
        addEventListener(type, fn) {
            (handlers[type] ||= new Set()).add(fn);
        },
        removeEventListener(type, fn) {
            handlers[type] && handlers[type].delete(fn);
        },
        dispatch(type) {
            for (const fn of [...(handlers[type] || [])]) fn({ type });
        },
        listenerCount(type) {
            return handlers[type] ? handlers[type].size : 0;
        }
    });
}

const GLOBALS = ["window", "screen", "Screen", "document", "navigator", "requestAnimationFrame"];

export function installFakeBrowser({
    isExtended = false,
    availLeft = 0,
    availTop = 0,
    framed = false,
    windowManagementAllowed = true,
    permission = "prompt",
    screens = null,
    hz = 60
} = {}) {
    const saved = Object.fromEntries(GLOBALS.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

    const window = eventTarget({ screenX: 100, screenY: 100, outerWidth: 800, outerHeight: 600 });
    window.self = window;
    window.top = framed ? {} : window;
    if (screens) {
        const details = eventTarget({ screens });
        window.getScreenDetails = async () => details;
        window.screenDetails = details;
    }

    const screen = eventTarget({ isExtended, availLeft, availTop, width: 1920, height: 1080 });
    const permissionStatus = eventTarget({ state: permission });
    let now = 0;
    const env = {
        window,
        screen,
        Screen: function Screen() {},
        document: {
            featurePolicy: { allowsFeature: () => windowManagementAllowed },
            createElement() {
                throw new Error("no DOM in tests");
            }
        },
        navigator: { permissions: { query: async () => permissionStatus } },
        requestAnimationFrame: (cb) => setImmediate(() => cb((now += 1000 / env.hz))),
        hz,
        permissionStatus
    };

    for (const key of GLOBALS) {
        Object.defineProperty(globalThis, key, { value: env[key], configurable: true, writable: true });
    }
    env.restore = () => {
        for (const key of GLOBALS) {
            if (saved[key]) Object.defineProperty(globalThis, key, saved[key]);
            else delete globalThis[key];
        }
    };
    return env;
}
