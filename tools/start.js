#!/usr/bin/env node

import mri from "mri";
import { spawn, execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const usage = () => {
    console.log("Usage: start.js [--profile] [--reset]");
    console.log("\nOptions:");
    console.log("  --profile  Launch a visible Brave session using the automation profile cache");
    console.log("  --reset    Wipe the automation profile before launching (visible only)");
    console.log("\nExamples:");
    console.log("  start.js");
    console.log("  start.js --profile");
    console.log("  start.js --profile --reset");
};

const argv = mri(process.argv.slice(2), {
    alias: { h: "help" },
    boolean: ["profile", "reset"],
});

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
        console.warn("Warning: failed to reset automation profile", err?.message ?? err);
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
        try {
            execSync(`kill -TERM ${pid}`);
        } catch {}
    }
} catch (err) {
    console.warn("Warning: failed to inspect Brave processes", err?.message ?? err);
}

await new Promise((r) => setTimeout(r, 1000));

const launchArgs = [
    "--remote-debugging-port=9222",
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-dev-shm-usage",
];

if (!useProfile) {
    launchArgs.push("--incognito", "--headless=new", "--disable-gpu");
} else {
    const extensionDir = join(toolsRoot, "extensions", "automation-helper");
    launchArgs.push(`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`);
}

spawn(
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    launchArgs,
    { detached: true, stdio: "ignore" },
).unref();

let connected = false;
const maxAttempts = 30;
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

if (useProfile) {
    console.log("✓ Brave started on :9222 (visible automation profile)");
} else {
    console.log("✓ Brave started on :9222 (headless incognito)");
}
