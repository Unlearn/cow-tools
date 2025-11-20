#!/usr/bin/env node

import mri from "mri";
import { spawn, execSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { ensureBrowserToolsWorkdir } from "./lib/workdir-guard.js";
import { getUserAgent } from "./lib/user-agent.js";
import { startSshProxyTunnel, stopSshProxyTunnel } from "./lib/ssh-proxy.js";
import {
    clearHeartbeatState,
    initHeartbeatState,
    readHeartbeatState,
    setWatchdogPid,
    touchHeartbeat,
} from "./lib/session-heartbeat.js";

const usage = () => {
    console.log("Usage: start.js [--profile] [--reset] [--no-proxy]");
    console.log("");
    console.log("Description:");
    console.log(
        "  Launches Brave with the automation profile and DevTools protocol exposed on :9222 so other tools",
    );
    console.log(
        "  (nav.js, ddg-search.js, fetch-readable.js, pdf2md.js, etc.) can attach to the browser.",
    );
    console.log("");
    console.log("Options:");
    console.log("  --profile           Launch a visible Brave session using the automation profile cache");
    console.log("  --reset             Wipe the automation profile before launching (visible only)");
    console.log("  --no-proxy          Skip starting the baked-in SSH SOCKS proxy");
    console.log("  --session-timeout   Minutes before idle sessions auto-shutdown (default 10)");
    console.log("");
    console.log("Examples:");
    console.log("  start.js");
    console.log("  start.js --profile");
    console.log("  start.js --profile --reset");
};

const argv = mri(process.argv.slice(2), {
    alias: { h: "help" },
    boolean: ["profile", "reset", "proxy", "no-proxy"],
    string: ["session-timeout"],
});

ensureBrowserToolsWorkdir("start.js");

if (argv.help) {
    usage();
    process.exit(0);
}

if (argv._.length > 0) {
    usage();
    process.exit(1);
}

const useProfile = Boolean(argv.profile);
const resetProfile = Boolean(argv.reset);
const disableProxy = argv.proxy === false || Boolean(argv["no-proxy"]);
const windowSize = process.env.BROWSER_TOOLS_WINDOW_SIZE ?? "2560,1440";
const userAgent = getUserAgent();
let proxyInfo = null;
const defaultTimeoutMs = 10 * 60 * 1000;
const envTimeoutMs = Number(process.env.BROWSER_TOOLS_SESSION_TIMEOUT_MS);
const envTimeoutMinutes = Number(process.env.BROWSER_TOOLS_SESSION_TIMEOUT_MINUTES);
let sessionTimeoutMs = Number.isFinite(envTimeoutMs) && envTimeoutMs > 0 ? envTimeoutMs : defaultTimeoutMs;
if (Number.isFinite(envTimeoutMinutes) && envTimeoutMinutes > 0) {
    sessionTimeoutMs = envTimeoutMinutes * 60 * 1000;
}
if (typeof argv["session-timeout"] === "string" && argv["session-timeout"].length > 0) {
    const cliMinutes = Number(argv["session-timeout"]);
    if (!Number.isFinite(cliMinutes) || cliMinutes <= 0) {
        console.error("✗ --session-timeout must be a positive number of minutes");
        process.exit(1);
    }
    sessionTimeoutMs = cliMinutes * 60 * 1000;
}

if (resetProfile && !useProfile) {
    console.warn("⚠ Ignoring --reset because no persistent profile is in use");
}

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const browserToolsRoot = fileURLToPath(new URL("./", import.meta.url));
const cacheRoot = join(process.env["BROWSER_TOOLS_CACHE"] ?? repoRoot, ".cache");
const profileDir = join(cacheRoot, "automation-profile");
const braveNightlyBinary = "/Applications/Brave Browser Nightly.app/Contents/MacOS/Brave Browser Nightly";

mkdirSync(cacheRoot, { recursive: true });

if (useProfile && resetProfile) {
    try {
        rmSync(profileDir, { recursive: true, force: true });
        console.log("ℹ Reset automation profile");
    } catch (err) {
        const reason = err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
        console.warn("Warning: failed to reset automation profile", reason);
    }
}

mkdirSync(profileDir, { recursive: true });

const existingHeartbeat = readHeartbeatState();
if (existingHeartbeat?.watcherPid) {
    try {
        process.kill(existingHeartbeat.watcherPid, "SIGTERM");
    } catch {
        /* ignore */
    }
}
clearHeartbeatState();

let braveBinary = null;
let braveBinarySource = "automation";
const envBrave = (process.env.BROWSER_TOOLS_BRAVE_PATH ?? "").trim();
if (envBrave) {
    braveBinary = envBrave;
    braveBinarySource = "env";
} else {
    braveBinary = braveNightlyBinary;
}

if (!existsSync(braveBinary)) {
    console.error(
        [
            "✗ Unable to find the Brave Nightly binary used for automation.",
            `  Expected path: ${braveBinary}`,
            "  Install Brave Browser Nightly (or set BROWSER_TOOLS_BRAVE_PATH to an alternate executable) before launching start.js.",
        ].join("\n"),
    );
    process.exit(1);
}

try {
    const psOutput = execSync("ps -Ao pid=,command=").toString();
    for (const line of psOutput.split("\n")) {
        if (!line.includes("Brave Browser")) continue;
        if (!line.includes(`--user-data-dir=${profileDir}`)) continue;
        const pid = line.trim().split(/\s+/)[0];
        if (!pid) continue;
        const numericPid = Number(pid);
        if (!Number.isInteger(numericPid)) continue;
        try {
            process.kill(numericPid, "SIGTERM");
        } catch (err) {
            // @ts-ignore runtime error objects may have a code property
            if (err?.code !== "ESRCH") {
                const reason = err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
                console.warn("Warning: failed to terminate an existing Brave process", reason);
            }
        }
    }
} catch (err) {
    const reason = err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
    console.warn("Warning: failed to inspect Brave processes", reason);
}

await new Promise((r) => setTimeout(r, 1000));

if (!disableProxy) {
    try {
        proxyInfo = await startSshProxyTunnel();
        console.log(`✓ SSH proxy ready on ${proxyInfo.host}:${proxyInfo.port}`);
    } catch (err) {
        const reason = err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
        console.error("✗ Failed to initialize SSH proxy", reason);
        process.exit(1);
    }
}

const launchArgs = [
    "--remote-debugging-port=9222",
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-dev-shm-usage",
    `--user-agent=${userAgent}`,
];

if (proxyInfo) {
    const proxyUrl = `socks5://${proxyInfo.host}:${proxyInfo.port}`;
    launchArgs.push(`--proxy-server=${proxyUrl}`);
}

if (!useProfile) {
    launchArgs.push("--incognito", "--headless=new", `--window-size=${windowSize}`);
} else {
    const extensionDir = join(repoRoot, "extensions", "automation-helper");
    launchArgs.push(
        `--disable-extensions-except=${extensionDir}`,
        `--load-extension=${extensionDir}`,
        `--window-size=${windowSize}`,
    );
}

if (braveBinarySource === "env") {
    console.log(`ℹ Using Brave binary from BROWSER_TOOLS_BRAVE_PATH: ${braveBinary}`);
} else {
    console.log(`ℹ Using Brave Browser Nightly: ${braveBinary}`);
}

const braveProcess = spawn(braveBinary, launchArgs, { detached: true, stdio: "ignore" });
braveProcess.unref();

const killBraveProcess = (signal = "SIGTERM") => {
    if (!braveProcess?.pid) {
        return false;
    }
    try {
        process.kill(braveProcess.pid, signal);
        return true;
    } catch (err) {
        // @ts-ignore runtime error objects may have a code property
        if (err?.code !== "ESRCH") {
            const reason = err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
            console.warn("Warning: failed to terminate Brave process", reason);
        }
        return false;
    }
};

let browser = null;
const maxAttempts = 30;
for (let i = 0; i < maxAttempts; i++) {
    try {
        browser = await puppeteer.connect({
            browserURL: "http://localhost:9222",
            defaultViewport: null,
        });
        break;
    } catch {
        await new Promise((r) => setTimeout(r, 500));
    }
}

if (!browser) {
    console.error("✗ Failed to connect to Brave");
    killBraveProcess();
    if (proxyInfo) {
        await stopSshProxyTunnel({ silent: true });
    }
    process.exit(1);
}

try {
    const pages = await browser.pages();
    await Promise.all(
        pages.map((p) =>
            p.setUserAgent(userAgent).catch(() => {
                /* ignore */
            }),
        ),
    );
} catch (err) {
    const reason = err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
    console.warn("Warning: unable to set user agent on existing pages", reason);
}

let automationReady = true;
if (useProfile) {
    try {
        const page = await browser.newPage();
        try {
            await page.goto("https://example.com", { waitUntil: "domcontentloaded" });
            automationReady = await page.evaluate((timeout) => {
                if (window.__automationReady) {
                    return true;
                }
                return new Promise((resolve) => {
                    const timer = setTimeout(() => resolve(false), timeout);
                    window.addEventListener(
                        "automation-ready",
                        () => {
                            clearTimeout(timer);
                            resolve(true);
                        },
                        { once: true },
                    );
                });
            }, 2000);
        } finally {
            await page.close();
        }
    } catch (err) {
        automationReady = false;
        const reason = err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
        console.warn("Warning: unable to verify automation helper", reason);
    }
}

await browser.disconnect();

initHeartbeatState(sessionTimeoutMs);
touchHeartbeat();
try {
    const watchdog = spawn(process.execPath, [join(browserToolsRoot, "lib", "session-watchdog.js")], {
        cwd: browserToolsRoot,
        env: process.env,
        detached: true,
        stdio: "ignore",
    });
    setWatchdogPid(watchdog.pid);
    watchdog.unref();
} catch (err) {
    const reason = err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
    console.warn("Warning: failed to start session watchdog", reason);
}
const timeoutLabel =
    sessionTimeoutMs >= 60_000
        ? `${Math.round(sessionTimeoutMs / 60_000)} min`
        : `${Math.max(1, Math.round(sessionTimeoutMs / 1000))} sec`;

if (useProfile) {
    console.log("✓ Brave started on :9222 (visible automation profile)");
    if (!automationReady) {
        console.warn(
            "⚠ Automation helper extension did not signal ready; CLI tools will inject a fallback helper automatically, but rerun with --reset if you expect the extension.",
        );
    }
} else {
    console.log("✓ Brave started on :9222 (headless incognito)");
}

console.log(`ℹ Session watchdog armed (${timeoutLabel} timeout)`);
