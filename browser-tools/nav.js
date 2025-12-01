#!/usr/bin/env node

import mri from "mri";
import { ensureBrowserToolsWorkdir } from "./lib/workdir-guard.js";
import { startHeartbeatInterval } from "./lib/session-heartbeat.js";
import { dismissCookieBanners } from "./lib/automation.js";
import { connectToBraveOrExit, getActivePageOrExit } from "./lib/puppeteer-helpers.js";

const argv = mri(process.argv.slice(2), { alias: { h: "help" }, boolean: ["new"] });
const showUsage = () => {
    console.log("Usage: nav.js <url> [--new]");
    console.log("");
    console.log("Description:");
    console.log(
        "  Navigates the active Brave automation tab to <url>, or opens <url> in a new tab when --new is passed.",
    );
    console.log("  Intended to be composed with tools like ddg-search.js, fetch-readable.js, and screenshot.js.");
    console.log("");
    console.log("Examples:");
    console.log("  nav.js https://example.com       # Navigate current tab");
    console.log("  nav.js https://example.com --new # Open in new tab");
};

if (argv.help) {
    showUsage();
    process.exit(0);
}

ensureBrowserToolsWorkdir("nav.js");
const stopHeartbeat = startHeartbeatInterval();

const url = argv._[0];
const newTab = Boolean(argv.new);

if (!url) {
    showUsage();
    process.exit(1);
}

const browser = await connectToBraveOrExit("nav.js");

try {
    if (newTab) {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await dismissCookieBanners(page).catch(() => {});
        console.log("✓ Opened:", url);
    } else {
        const page = await getActivePageOrExit(browser, "nav.js");
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await dismissCookieBanners(page).catch(() => {});
        console.log("✓ Navigated to:", url);
    }
} finally {
    await browser.disconnect().catch(() => {});
    stopHeartbeat();
}
