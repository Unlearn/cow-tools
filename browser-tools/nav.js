#!/usr/bin/env node

import mri from "mri";
import puppeteer from "puppeteer-core";
import { ensureBrowserToolsWorkdir } from "./lib/workdir-guard.js";
import { dismissCookieBanners } from "./lib/automation.js";

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

const url = argv._[0];
const newTab = Boolean(argv.new);

if (!url) {
    showUsage();
    process.exit(1);
}

const b = await puppeteer.connect({
    browserURL: "http://localhost:9222",
    defaultViewport: null,
});

if (newTab) {
    const p = await b.newPage();
    await p.goto(url, { waitUntil: "domcontentloaded" });
    await dismissCookieBanners(p).catch(() => {});
    console.log("✓ Opened:", url);
} else {
    const pages = await b.pages();
    const p = pages.at(-1);

    if (!p) {
        console.error("✗ No active tab found");
        await b.disconnect();
        process.exit(1);
    }

    await p.goto(url, { waitUntil: "domcontentloaded" });
    await dismissCookieBanners(p).catch(() => {});
    console.log("✓ Navigated to:", url);
}

await b.disconnect();
