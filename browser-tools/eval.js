#!/usr/bin/env node

import mri from "mri";
import puppeteer from "puppeteer-core";
import { ensureBrowserToolsWorkdir } from "./lib/workdir-guard.js";
import { startHeartbeatInterval } from "./lib/session-heartbeat.js";

const argv = mri(process.argv.slice(2), { alias: { h: "help" } });
const showUsage = () => {
    console.log("Usage: eval.js 'code'");
    console.log("");
    console.log("Description:");
    console.log(
        "  Evaluates arbitrary JavaScript in the active Brave automation tab and prints the result.",
    );
    console.log(
        "  Useful for quick DOM inspections (e.g., counting links, extracting specific attributes,",
    );
    console.log("  or probing page state before calling other tools).");
    console.log("");
    console.log("Examples:");
    console.log('  eval.js "document.title"');
    console.log('  eval.js "document.querySelectorAll(\'a\').length"');
    console.log(
        '  eval.js "[...document.links].map(a => a.href).filter(h => h.includes(\'menu\'))"',
    );
};

if (argv.help) {
    showUsage();
    process.exit(0);
}

ensureBrowserToolsWorkdir("eval.js");
const stopHeartbeat = startHeartbeatInterval();

const code = argv._.join(" ");
if (!code) {
    showUsage();
    process.exit(1);
}

const b = await puppeteer.connect({
    browserURL: "http://localhost:9222",
    defaultViewport: null,
});

try {
    const p = (await b.pages()).at(-1);

    if (!p) {
        console.error("✗ No active tab found");
        stopHeartbeat();
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
} catch (error) {
    console.error("✗ Evaluation failed:", error?.message ?? error);
    stopHeartbeat();
    process.exit(1);
} finally {
    await b.disconnect();
    stopHeartbeat();
}
