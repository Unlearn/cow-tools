import { test, expect } from "@playwright/test";
import {
    startAutomation,
    ensureStopped,
    connectToBrave,
    runTool,
    readHeartbeatFile,
    heartbeatFileExists,
} from "./helpers.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForTermination = async (timeoutMs = 5000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const browser = await connectToBrave();
            await browser.close();
        } catch {
            return true;
        }
        await sleep(250);
    }
    return false;
};

const waitForHeartbeatState = async (timeoutMs = 3000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const state = await readHeartbeatFile();
        if (state) return state;
        await sleep(100);
    }
    return null;
};

test.describe.serial("session watchdog", () => {
    test.beforeEach(async () => {
        await ensureStopped();
    });

    test.afterEach(async () => {
        await ensureStopped();
    });

    test("terminates idle sessions after timeout", async () => {
        await startAutomation({
            env: {
                BROWSER_TOOLS_SESSION_TIMEOUT_MS: "2000",
            },
        });
        const terminated = await waitForTermination(7000);
        expect(terminated).toBeTruthy();
        await ensureStopped();
    });

    test("heartbeat pings extend the session", async () => {
        await startAutomation({
            env: {
                BROWSER_TOOLS_SESSION_TIMEOUT_MS: "1500",
            },
        });
        await sleep(700);
        await runTool("cookies.js");
        await sleep(700);
        const browser = await connectToBrave();
        await browser.close();
        await sleep(2000);
        const terminated = await waitForTermination(7000);
        expect(terminated).toBeTruthy();
        await ensureStopped();
    });

    test("commands update the heartbeat timestamp", async () => {
        await startAutomation({
            env: {
                BROWSER_TOOLS_SESSION_TIMEOUT_MS: "4000",
            },
        });
        const before = await waitForHeartbeatState();
        await runTool("cookies.js");
        const after = await waitForHeartbeatState();
        expect(before).not.toBeNull();
        expect(after).not.toBeNull();
        expect(after.lastPing).toBeGreaterThan(before.lastPing);
    });

    test("stop.js clears the heartbeat file and watchdog", async () => {
        await startAutomation({
            env: {
                BROWSER_TOOLS_SESSION_TIMEOUT_MS: "10000",
            },
        });
        await runTool("cookies.js");
        expect(await heartbeatFileExists()).toBeTruthy();
        await runTool("stop.js");
        const terminated = await waitForTermination(5000);
        expect(terminated).toBeTruthy();
        expect(await heartbeatFileExists()).toBeFalsy();
    });

    test("long-running eval keeps the session alive", async () => {
        await startAutomation({
            env: {
                BROWSER_TOOLS_SESSION_TIMEOUT_MS: "1200",
            },
        });
        const { stdout } = await runTool("eval.js", [
            "await (async () => { await new Promise(r => setTimeout(r, 1800)); return 'done'; })()",
        ]);
        expect(stdout).toContain("done");
        const browser = await connectToBrave();
        await browser.close();
    });
});
