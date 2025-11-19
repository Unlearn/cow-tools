#!/usr/bin/env node

import mri from "mri";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { automationCall } from "./lib/automation.js";
import { ensureBrowserToolsWorkdir } from "./lib/workdir-guard.js";
import { startHeartbeatInterval } from "./lib/session-heartbeat.js";

const argv = mri(process.argv.slice(2), {
    alias: { h: "help", s: "selector", v: "viewport" },
    string: ["selector"],
    boolean: ["viewport"],
});
const showUsage = () => {
    console.log("Usage: screenshot.js [--selector <css>] [--viewport]");
    console.log("");
    console.log("Description:");
    console.log(
        "  Captures the current Brave automation tab to a PNG in the system temp directory and prints the file path.",
    );
    console.log(
        "  Agents can pass this path to external viewers or attach it to logs when visual confirmation is needed.",
    );
    console.log("");
    console.log("Options:");
    console.log("  --selector, -s  Capture only the element that matches the CSS selector");
    console.log("  --viewport, -v  Limit capture to the visible viewport instead of full page");
    console.log("");
    console.log("Examples:");
    console.log("  screenshot.js                        # full-page capture");
    console.log("  screenshot.js --viewport             # visible area only");
    console.log('  screenshot.js --selector "h1.title"  # single element');
};

if (argv.help) {
    showUsage();
    process.exit(0);
}

ensureBrowserToolsWorkdir("screenshot.js");
const stopHeartbeat = startHeartbeatInterval();

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

let p = null;
let exitCode = 0;
let filepath = "";

try {
    p = (await b.pages()).at(-1);

    if (!p) {
        throw new Error("✗ No active tab found");
    }

    await automationCall(p, "hideBanner");

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `screenshot-${timestamp}.png`;
    filepath = join(tmpdir(), filename);

    if (selector) {
        const elementHandle = await p.$(selector);
        if (!elementHandle) {
            throw new Error(`✗ No element found for selector: ${selector}`);
        }
        await p.$eval(selector, (el) =>
            el.scrollIntoView({ behavior: "instant", block: "center", inline: "center" }),
        );
        await elementHandle.screenshot({ path: filepath });
    } else {
        await p.screenshot({ path: filepath, fullPage: !viewportOnly });
    }

    console.log(filepath);
} catch (error) {
    exitCode = 1;
    const reason = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
    console.error(reason);
} finally {
    if (p) {
        await automationCall(p, "showBanner").catch(() => {});
    }
    await b.disconnect().catch(() => {});
    stopHeartbeat();
    if (exitCode !== 0) {
        process.exit(exitCode);
    }
}
