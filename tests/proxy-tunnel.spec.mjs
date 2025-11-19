import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    startAutomation,
    stopAutomation,
    ensureStopped,
} from "./helpers.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const browserToolsRoot = path.join(repoRoot, "browser-tools");
const cacheDir = path.join(browserToolsRoot, ".cache");
const statePath = path.join(cacheDir, "ssh-proxy.json");
const overrideConfigPath = path.join(cacheDir, "ssh-proxy-test-config.json");
const logPath = path.join(cacheDir, "fake-ssh-proxy.log");
const fakeProxyScript = path.join(repoRoot, "tests", "fixtures", "fake-ssh-proxy.mjs");

const fileExists = async (p) => {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
};

const allocatePort = () =>
    new Promise((resolvePort, rejectPort) => {
        const server = net.createServer();
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            const port = address && typeof address === "object" ? address.port : null;
            server.close(() => resolvePort(port));
        });
        server.on("error", rejectPort);
    });

async function writeOverride({ failStartup = false } = {}) {
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.rm(logPath, { force: true });
    const port = await allocatePort();
    const command = [
        process.execPath,
        fakeProxyScript,
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--log",
        logPath,
    ];
    if (failStartup) {
        command.push("--fail-startup");
    }
    const config = {
        command,
        localHost: "127.0.0.1",
        localPort: port,
        readyTimeoutMs: 3000,
    };
    await fs.writeFile(overrideConfigPath, JSON.stringify(config), "utf8");
    return {
        env: {
            BROWSER_TOOLS_SSH_PROXY_TEST_CONFIG: overrideConfigPath,
        },
        port,
    };
}

const readLogEntries = async () => {
    if (!(await fileExists(logPath))) return [];
    const contents = await fs.readFile(logPath, "utf8");
    return contents
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            try {
                return JSON.parse(line);
            } catch {
                return { event: "parse-error", raw: line };
            }
        });
};

test.describe.serial("SSH proxy tunnel lifecycle", () => {
    test.beforeEach(async () => {
        await ensureStopped();
        await fs.rm(statePath, { force: true });
        await fs.rm(overrideConfigPath, { force: true });
        await fs.rm(logPath, { force: true });
    });

    test.afterEach(async () => {
        await ensureStopped();
        await fs.rm(overrideConfigPath, { force: true });
        await fs.rm(logPath, { force: true });
    });

    test("start.js starts the SSH proxy and stop.js terminates it", async () => {
        const { env, port } = await writeOverride();
        const startResult = await startAutomation({ env, proxy: true });
        expect(startResult.stdout).toContain(`SSH proxy ready on 127.0.0.1:${port}`);

        const stateRaw = await fs.readFile(statePath, "utf8");
        const state = JSON.parse(stateRaw);
        expect(state.port).toBe(port);

        await stopAutomation({ env });
        const logEntries = await readLogEntries();
        const events = logEntries.map((entry) => entry.event);
        expect(events).toContain("listening");
        expect(events).toContain("signal");
        expect(events).toContain("closed");
    });

    test("start.js --no-proxy skips tunnel even when override is present", async () => {
        const { env } = await writeOverride();
        const startResult = await startAutomation({ env, proxy: false });
        expect(startResult.stdout).not.toContain("SSH proxy ready");
        expect(await fileExists(statePath)).toBe(false);
        expect(await fileExists(logPath)).toBe(false);
        await stopAutomation({ env });
    });

    test("proxy startup failures bubble up with a clear error", async () => {
        const { env } = await writeOverride({ failStartup: true });
        await expect(startAutomation({ env, proxy: true })).rejects.toThrow();
        expect(await fileExists(statePath)).toBe(false);
        const entries = await readLogEntries();
        expect(entries.some((entry) => entry.event === "fail-startup")).toBe(true);
    });
});
