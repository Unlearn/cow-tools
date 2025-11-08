#!/usr/bin/env node

import mri from "mri";
import puppeteer from "puppeteer-core";
import { ensureBrowserToolsWorkdir } from "./lib/workdir-guard.js";

const argv = mri(process.argv.slice(2), { alias: { h: "help" } });
const showUsage = () => {
    console.log("Usage: cookies.js");
    console.log("\nDump cookies from the active Brave automation tab. Requires Brave started via tools/start.js.");
};

if (argv.help) {
    showUsage();
    process.exit(0);
}

ensureBrowserToolsWorkdir("cookies.js");

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

const cookies = await p.cookies();

if (cookies.length === 0) {
    console.log("ℹ No cookies found for the active tab.");
} else {
    for (const cookie of cookies) {
        console.log(`${cookie.name}: ${cookie.value}`);
        console.log(`  domain: ${cookie.domain}`);
        console.log(`  path: ${cookie.path}`);
        console.log(`  httpOnly: ${cookie.httpOnly}`);
        console.log(`  secure: ${cookie.secure}`);
        console.log("");
    }
}

await b.disconnect();
