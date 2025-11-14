#!/usr/bin/env node

import { execSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { ensureBrowserToolsWorkdir } from "./lib/workdir-guard.js";

if (process.argv.includes("--help")) {
    console.log("Usage: stop.js");
    console.log("");
    console.log("Description:");
    console.log(
        "  Closes tabs and terminates any Brave processes launched via start.js for the automation profile.",
    );
    console.log("  Use this at the end of a run so subsequent automation sessions start clean.");
    process.exit(0);
}

ensureBrowserToolsWorkdir("stop.js");

const toolsRoot = fileURLToPath(new URL("../", import.meta.url));
const profileDir = join(process.env["BROWSER_TOOLS_CACHE"] ?? toolsRoot, ".cache", "automation-profile");

let closedTabs = 0;
try {
    const browser = await puppeteer
        .connect({ browserURL: "http://localhost:9222", defaultViewport: null, protocolTimeout: 2000 })
        .catch(() => null);
    if (browser) {
        const pages = await browser.pages();
        for (const page of pages) {
            try {
                await page.close();
                closedTabs++;
            } catch (err) {
                console.warn("Warning: unable to close a tab", err?.message ?? err);
            }
        }
        await browser.disconnect();
    }
} catch (err) {
    console.warn("Warning: could not connect to Brave to close tabs", err?.message ?? err);
}

if (closedTabs > 0) {
    console.log(`✓ Closed ${closedTabs} tab${closedTabs === 1 ? "" : "s"}`);
}

let killed = 0;
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
            killed++;
        } catch (err) {
            if (err?.code !== "ESRCH") {
                console.warn("Warning: failed to terminate Brave process", err?.message ?? err);
            }
        }
    }
} catch (err) {
    console.warn("Warning: failed to inspect Brave processes", err?.message ?? err);
}

if (killed > 0) {
    console.log(`✓ Stopped ${killed} automation Brave process${killed === 1 ? "" : "es"}`);
} else {
    console.log("ℹ No automation Brave processes found for the automation profile directory.");
}
