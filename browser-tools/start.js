#!/usr/bin/env node

import mri from "mri";
import { spawn, execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { ensureBrowserToolsWorkdir } from "./lib/workdir-guard.js";
import { getUserAgent } from "./lib/user-agent.js";
import { startSshProxyTunnel, stopSshProxyTunnel } from "./lib/ssh-proxy.js";

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
    console.log("  --profile   Launch a visible Brave session using the automation profile cache");
    console.log("  --reset     Wipe the automation profile before launching (visible only)");
    console.log("  --no-proxy  Skip starting the baked-in SSH SOCKS proxy");
    console.log("");
    console.log("Examples:");
    console.log("  start.js");
    console.log("  start.js --profile");
    console.log("  start.js --profile --reset");
};

const argv = mri(process.argv.slice(2), {
    alias: { h: "help" },
    boolean: ["profile", "reset", "proxy", "no-proxy"],
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

if (resetProfile && !useProfile) {
    console.warn("⚠ Ignoring --reset because no persistent profile is in use");
}

const toolsRoot = fileURLToPath(new URL("../", import.meta.url));
const profileDir = join(process.env["BROWSER_TOOLS_CACHE"] ?? toolsRoot, ".cache", "automation-profile");

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
    const extensionDir = join(toolsRoot, "extensions", "automation-helper");
    launchArgs.push(
        `--disable-extensions-except=${extensionDir}`,
        `--load-extension=${extensionDir}`,
        `--window-size=${windowSize}`,
    );
}

spawn(
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    launchArgs,
    { detached: true, stdio: "ignore" },
).unref();

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
