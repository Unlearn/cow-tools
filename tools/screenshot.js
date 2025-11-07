#!/usr/bin/env node

import mri from "mri";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { automationCall } from "./lib/automation.js";

const argv = mri(process.argv.slice(2), { alias: { h: "help" } });
const showUsage = () => {
    console.log("Usage: screenshot.js");
    console.log("\nCaptures the current Brave automation tab to a PNG in the system temp directory and prints the file path.");
};

if (argv.help) {
    showUsage();
    process.exit(0);
}

if (argv._.length > 0) {
    showUsage();
    process.exit(1);
}

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

await p.screenshot({ path: filepath });
await automationCall(p, "showBanner");

console.log(filepath);

await b.disconnect();
