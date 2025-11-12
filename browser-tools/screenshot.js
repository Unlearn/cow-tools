#!/usr/bin/env node

import mri from "mri";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { automationCall } from "./lib/automation.js";
import { ensureBrowserToolsWorkdir } from "./lib/workdir-guard.js";

const argv = mri(process.argv.slice(2), {
    alias: { h: "help", s: "selector", v: "viewport" },
    string: ["selector"],
    boolean: ["viewport"],
});
const showUsage = () => {
    console.log("Usage: screenshot.js [--selector <css>] [--viewport]");
    console.log("\nCaptures the current Brave automation tab to a PNG in the system temp directory and prints the file path.");
    console.log("\nOptions:");
    console.log("  --selector, -s  Capture only the element that matches the CSS selector");
    console.log("  --viewport, -v  Limit capture to the visible viewport instead of full page");
    console.log("\nExamples:");
    console.log("  screenshot.js                        # full-page capture");
    console.log("  screenshot.js --viewport             # visible area only");
    console.log('  screenshot.js --selector "h1.title"  # single element');
};

if (argv.help) {
    showUsage();
    process.exit(0);
}

ensureBrowserToolsWorkdir("screenshot.js");

if (argv._.length > 0) {
    showUsage();
    process.exit(1);
}

const selector = argv.selector?.trim() || null;
const viewportOnly = Boolean(argv.viewport);

const b = await puppeteer.connect({
    browserURL: "http://localhost:9222",
    defaultViewport: null,
});

const p = (await b.pages()).at(-1);

if (!p) {
    console.error("✗ No active tab found");
    process.exit(1);
}

await automationCall(p, "hideBanner");

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const filename = `screenshot-${timestamp}.png`;
const filepath = join(tmpdir(), filename);

try {
    if (selector) {
        const elementHandle = await p.$(selector);
        if (!elementHandle) {
            console.error(`✗ No element found for selector: ${selector}`);
            process.exitCode = 1;
        } else {
            await p.$eval(selector, (el) => el.scrollIntoView({ behavior: "instant", block: "center", inline: "center" }));
            await elementHandle.screenshot({ path: filepath });
        }
    } else {
        await p.screenshot({ path: filepath, fullPage: !viewportOnly });
    }
} finally {
    await automationCall(p, "showBanner");
}

if (process.exitCode === 1) {
    await b.disconnect();
    process.exit(1);
}

console.log(filepath);

await b.disconnect();
