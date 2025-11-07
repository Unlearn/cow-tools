#!/usr/bin/env node

import mri from "mri";
import { spawn, execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const usage = () => {
    console.log("Usage: start.js [--profile] [--visible|--headless]");
    console.log("\nOptions:");
    console.log("  --profile   Snapshot your primary Brave profile into the automation session (cookies, logins) and force visible mode so you can supervise");
    console.log("  --visible   Launch Brave with a visible window (required for pick.js)");
    console.log("  --headless  Force headless mode (default)");
    console.log("\nExamples:");
    console.log("  start.js");
    console.log("  start.js --visible");
    console.log("  start.js --profile");
};

const argv = mri(process.argv.slice(2), {
    alias: { h: "help" },
    boolean: ["profile", "visible", "headless"],
});

if (argv.help) {
    usage();
    process.exit(0);
}

if (argv._.length > 0) {
    usage();
    process.exit(1);
}

let useProfile = Boolean(argv.profile);
let useVisible = useProfile || Boolean(argv.visible);

if (argv.headless) {
    if (useProfile) {
        console.warn("⚠ Ignoring --headless because --profile requires a visible session");
    } else {
        useVisible = false;
    }
}

const homeDir = process.env["HOME"];

if (!homeDir) {
    console.error("✗ HOME is not set; cannot locate Brave profile");
    process.exit(1);
}

const toolsRoot = fileURLToPath(new URL("../", import.meta.url));
const cacheDir = join(process.env["BROWSER_TOOLS_CACHE"] ?? toolsRoot, ".cache", "scraping");

if (useProfile) {
    const profileSource = join(
        homeDir,
        "Library",
        "Application Support",
        "BraveSoftware",
        "Brave-Browser",
    );

    try {
        rmSync(cacheDir, { recursive: true, force: true });
    } catch {}
    mkdirSync(cacheDir, { recursive: true });

    if (existsSync(profileSource)) {
        execSync(`rsync -a --delete "${profileSource}/" "${cacheDir}/"`, { stdio: "pipe" });
    } else {
        console.warn(
            `Warning: Brave profile folder not found at ${profileSource}. Continuing with a clean profile instead.`,
        );
    }
} else {
    mkdirSync(cacheDir, { recursive: true });
}


try {
    const psOutput = execSync("ps -Ao pid=,command=").toString();
    for (const line of psOutput.split("\n")) {
        if (!line.includes("Brave Browser")) continue;
        if (!line.includes(`--user-data-dir=${cacheDir}`)) continue;
        const pid = line.trim().split(/\s+/)[0];
        if (pid) {
            try {
                execSync(`kill -TERM ${pid}`);
            } catch {}
        }
    }
} catch (err) {
    console.warn("Warning: failed to inspect existing Brave processes", err?.message ?? err);
}

await new Promise((r) => setTimeout(r, 1000));

// Start Brave in background (detached so Node can exit)
const launchArgs = [
    "--remote-debugging-port=9222",
    `--user-data-dir=${cacheDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-dev-shm-usage",
];

if (!useProfile && !useVisible) {
    launchArgs.push("--incognito");
}
if (!useVisible) {
    launchArgs.push("--headless=new", "--disable-gpu");
} else {
    const extensionDir = join(toolsRoot, "extensions", "automation-helper");
    launchArgs.push(
        `--disable-extensions-except=${extensionDir}`,
        `--load-extension=${extensionDir}`,
    );
}

spawn(
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    launchArgs,
    { detached: true, stdio: "ignore" },
).unref();

// Wait for Brave to be ready by attempting to connect
let connected = false;
const maxAttempts = useProfile ? 60 : 30;
for (let i = 0; i < maxAttempts; i++) {
    try {
        const browser = await puppeteer.connect({
            browserURL: "http://localhost:9222",
            defaultViewport: null,
        });
        await browser.disconnect();
        connected = true;
        break;
    } catch {
        await new Promise((r) => setTimeout(r, 500));
    }
}

if (!connected) {
    console.error("✗ Failed to connect to Brave");
    process.exit(1);
}

console.log(`✓ Brave started on :9222${useProfile ? " with your profile" : ""}`);
