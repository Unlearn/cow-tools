#!/usr/bin/env node

import mri from "mri";
import { startHeartbeatInterval } from "./lib/session-heartbeat.js";
import { connectToBraveOrExit, getActivePageOrExit } from "./lib/puppeteer-helpers.js";

const argv = mri(process.argv.slice(2), { alias: { h: "help" } });
const showUsage = () => {
    console.log("Usage: cookies.js");
    console.log("");
    console.log("Description:");
    console.log(
        "  Dumps cookies from the active Brave automation tab (name, domain, path, httpOnly, secure).",
    );
    console.log("  Useful for agents that need to confirm login state or capture session metadata.");
};

if (argv.help) {
    showUsage();
    process.exit(0);
}

const stopHeartbeat = startHeartbeatInterval();

if (argv._.length > 0) {
    showUsage();
    process.exit(1);
}

const browser = await connectToBraveOrExit("cookies.js");

try {
    const page = await getActivePageOrExit(browser, "cookies.js");
    const cookies = await page.cookies();

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

    await browser.disconnect().catch(() => {});
} finally {
    stopHeartbeat();
}
