#!/usr/bin/env node

import mri from "mri";
import puppeteer from "puppeteer-core";
import { ensureBrowserToolsWorkdir } from "./lib/workdir-guard.js";

const argv = mri(process.argv.slice(2), { alias: { h: "help" } });
const showUsage = () => {
    console.log("Usage: eval.js 'code'");
    console.log("\nExamples:");
    console.log('  eval.js "document.title"');
    console.log('  eval.js "document.querySelectorAll(\'a\').length"');
};

if (argv.help) {
    showUsage();
    process.exit(0);
}

ensureBrowserToolsWorkdir("eval.js");

const code = argv._.join(" ");
if (!code) {
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

const result = await p.evaluate((c) => {
    const AsyncFunction = (async () => {}).constructor;
    return new AsyncFunction(`return (${c})`)();
}, code);

if (Array.isArray(result)) {
    for (let i = 0; i < result.length; i++) {
        if (i > 0) console.log("");
        for (const [key, value] of Object.entries(result[i])) {
            console.log(`${key}: ${value}`);
        }
    }
} else if (typeof result === "object" && result !== null) {
    for (const [key, value] of Object.entries(result)) {
        console.log(`${key}: ${value}`);
    }
} else {
    console.log(result);
}

await b.disconnect();
