import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const toolsRoot = fileURLToPath(new URL("../", import.meta.url));
const cacheRoot = join(process.env["BROWSER_TOOLS_CACHE"] ?? toolsRoot, ".cache");
const heartbeatPath = join(cacheRoot, "session-heartbeat.json");
const defaultHeartbeatInterval =
    Number(process.env.BROWSER_TOOLS_HEARTBEAT_INTERVAL_MS) && Number(process.env.BROWSER_TOOLS_HEARTBEAT_INTERVAL_MS) > 0
        ? Number(process.env.BROWSER_TOOLS_HEARTBEAT_INTERVAL_MS)
        : 1000;

const ensureCacheDir = () => {
    mkdirSync(cacheRoot, { recursive: true });
};

export const getHeartbeatPath = () => heartbeatPath;

export const readHeartbeatState = () => {
    try {
        const raw = readFileSync(heartbeatPath, "utf8");
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

const writeHeartbeatState = (state) => {
    ensureCacheDir();
    writeFileSync(heartbeatPath, JSON.stringify(state, null, 2), "utf8");
};

export const initHeartbeatState = (timeoutMs) => {
    const state = {
        timeoutMs,
        lastPing: Date.now(),
        shutdownRequested: false,
    };
    writeHeartbeatState(state);
    return state;
};

export const touchHeartbeat = () => {
    const state = readHeartbeatState();
    if (!state) {
        return false;
    }
    state.lastPing = Date.now();
    writeHeartbeatState(state);
    return true;
};

export const setWatchdogPid = (pid) => {
    const state = readHeartbeatState();
    if (!state) {
        return false;
    }
    state.watcherPid = pid;
    writeHeartbeatState(state);
    return true;
};

export const removeWatchdogPid = () => {
    const state = readHeartbeatState();
    if (!state || typeof state.watcherPid === "undefined") {
        return false;
    }
    delete state.watcherPid;
    writeHeartbeatState(state);
    return true;
};

export const clearHeartbeatState = () => {
    try {
        rmSync(heartbeatPath);
    } catch {
        /* ignore */
    }
};

export const requestWatchdogShutdown = () => {
    const state = readHeartbeatState();
    if (!state) {
        return false;
    }
    state.shutdownRequested = true;
    writeHeartbeatState(state);
    return true;
};

export const startHeartbeatInterval = (intervalMs = defaultHeartbeatInterval) => {
    let stopped = false;
    const tick = () => {
        if (!stopped) {
            touchHeartbeat();
        }
    };
    tick();
    const timer = setInterval(tick, Math.max(250, intervalMs));
    return () => {
        if (stopped) return;
        stopped = true;
        clearInterval(timer);
        touchHeartbeat();
    };
};
