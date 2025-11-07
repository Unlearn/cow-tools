#!/usr/bin/env node

import mri from "mri";
import puppeteer from "puppeteer-core";

const argv = mri(process.argv.slice(2), { alias: { h: "help" }, boolean: ["new"] });
const showUsage = () => {
    console.log("Usage: nav.js <url> [--new]");
    console.log("\nExamples:");
    console.log("  nav.js https://example.com       # Navigate current tab");
    console.log("  nav.js https://example.com --new # Open in new tab");
};

if (argv.help) {
    showUsage();
    process.exit(0);
}

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
    console.log("✓ Navigated to:", url);
}

await b.disconnect();
