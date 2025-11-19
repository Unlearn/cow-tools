#!/usr/bin/env node

import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readHeartbeatState, clearHeartbeatState } from "./session-heartbeat.js";

const toolsRoot = fileURLToPath(new URL("../", import.meta.url));
const stopScript = join(toolsRoot, "stop.js");
const debugWatchdog = process.env.BROWSER_TOOLS_WATCHDOG_DEBUG === "1";
const debugLog = (...args) => {
    if (debugWatchdog) {
        console.log("[watchdog]", ...args);
    }
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const run = async () => {
    while (true) {
        const state = readHeartbeatState();
        if (!state) {
            debugLog("no heartbeat state; exiting");
            return;
        }
        const { lastPing, timeoutMs, shutdownRequested } = state;
        if (shutdownRequested) {
            debugLog("shutdown requested flag detected");
            clearHeartbeatState();
            return;
        }
        if (!timeoutMs || typeof timeoutMs !== "number") {
            debugLog("timeout missing; clearing heartbeat");
            clearHeartbeatState();
            return;
        }
        const elapsed = Date.now() - lastPing;
        if (elapsed > timeoutMs) {
            debugLog(`timeout exceeded (elapsed=${elapsed}ms timeout=${timeoutMs}ms)`);
            const child = spawn(process.execPath, [stopScript, "--watchdog"], {
                cwd: toolsRoot,
                stdio: "ignore",
                detached: true,
            });
            child.unref();
            clearHeartbeatState();
            return;
        }
        const interval = Math.min(Math.max(timeoutMs / 4, 1_000), 60_000);
        debugLog(`sleeping for ${interval}ms (elapsed=${elapsed}ms)`);
        await wait(interval);
    }
};

run().catch((err) => {
    const reason = err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
    console.warn("Session watchdog exited unexpectedly", reason);
    clearHeartbeatState();
});
