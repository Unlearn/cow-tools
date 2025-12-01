import { spawn } from "node:child_process";
import { readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { getSshProxyConfig } from "./ssh-proxy-config.js";

const toolsRoot = fileURLToPath(new URL("../", import.meta.url));
const cacheRoot = join(process.env["BROWSER_TOOLS_CACHE"] ?? toolsRoot, ".cache");
const statePath = join(cacheRoot, "ssh-proxy.json");

const ensureCacheDir = () => {
    mkdirSync(cacheRoot, { recursive: true });
};

const readState = () => {
    try {
        const raw = readFileSync(statePath, "utf8");
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

const writeState = (state) => {
    ensureCacheDir();
    writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
};

const removeState = () => {
    try {
        rmSync(statePath);
    } catch {
        /* ignore */
    }
};

const waitForPort = (host, port, timeoutMs) =>
    new Promise((resolve, reject) => {
        const deadline = Date.now() + timeoutMs;
        let resolved = false;
        const timeoutHandle = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                reject(new Error(`Timed out waiting for ${host}:${port}`));
            }
        }, timeoutMs);
        timeoutHandle.unref();

        const attempt = () => {
            if (resolved) return;
            const socket = net.connect({ host, port });
            const teardown = () => {
                socket.removeAllListeners();
                socket.destroy();
            };
            socket.once("connect", () => {
                teardown();
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeoutHandle);
                    resolve();
                }
            });
            const handleFailure = (err) => {
                teardown();
                if (Date.now() >= deadline) {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeoutHandle);
                        reject(err);
                    }
                    return;
                }
                setTimeout(attempt, 250).unref();
            };
            socket.once("error", handleFailure);
            socket.setTimeout(1000, () => handleFailure(new Error(`No response from ${host}:${port}`)));
        };

        attempt();
    });

const killPid = async (pid, signal = "SIGTERM") => {
    if (!pid || !Number.isInteger(pid)) {
        return false;
    }
    try {
        process.kill(pid, signal);
        return true;
    } catch (err) {
        if (err?.code === "ESRCH") {
            return false;
        }
        throw err;
    }
};

export const stopSshProxyTunnel = async ({ silent = false } = {}) => {
    const state = readState();
    if (!state) {
        return false;
    }

    removeState();
    const { pid } = state;
    if (!pid) {
        return false;
    }

    try {
        const terminated = await killPid(pid, "SIGTERM");
        if (!terminated) {
            return false;
        }
        for (let i = 0; i < 10; i++) {
            try {
                process.kill(pid, 0);
                await delay(100);
            } catch (err) {
                if (err?.code === "ESRCH") {
                    return true;
                }
                throw err;
            }
        }
        // Check if process still exists before SIGKILL
        try {
            process.kill(pid, 0);
            await killPid(pid, "SIGKILL");
        } catch (err) {
            if (err?.code === "ESRCH") {
                return true;
            }
            throw err;
        }
        return true;
    } catch (err) {
        if (!silent) {
            const reason = err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
            console.warn("Warning: failed to terminate SSH proxy", reason);
        }
        return false;
    }
};

export const startSshProxyTunnel = async () => {
    const { command, localHost, localPort, readyTimeoutMs = 10000 } = getSshProxyConfig();
    if (!Array.isArray(command) || command.length === 0) {
        throw new Error("SSH proxy command is not configured");
    }

    ensureCacheDir();
    const existing = readState();
    if (existing?.pid) {
        await stopSshProxyTunnel({ silent: true });
    }

    const child = spawn(command[0], command.slice(1), {
        detached: true,
        stdio: "ignore",
    });

    const errors = [];
    child.once("error", (err) => {
        errors.push(err);
    });

    try {
        await waitForPort(localHost, localPort, readyTimeoutMs);
    } catch (err) {
        try {
            await killPid(child.pid);
        } catch {
            /* ignore */
        }
        throw new Error(`SSH proxy failed to start: ${err?.message ?? err}`);
    }

    child.unref();
    writeState({
        pid: child.pid,
        host: localHost,
        port: localPort,
        command,
        startedAt: Date.now(),
    });

    if (errors.length > 0) {
        throw errors[0];
    }

    return { pid: child.pid, host: localHost, port: localPort };
};
