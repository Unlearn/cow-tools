#!/usr/bin/env node

import mri from "mri";
import puppeteer from "puppeteer-core";
import { randomUUID } from "node:crypto";
import { ensureBrowserToolsWorkdir } from "./lib/workdir-guard.js";
import { automationCall, waitForAutomation } from "./lib/automation.js";

const argv = mri(process.argv.slice(2), {
    alias: { h: "help" },
    string: ["url", "message", "timeout"],
    default: { timeout: "240" },
});

const showUsage = () => {
    console.log("Usage: login-helper.js [--url <page>] [--message <text>] [--timeout <seconds>]");
    console.log("\nPrompts a human to log into the visible Brave session, then waits for confirmation.");
    console.log("\nExamples:");
    console.log("  login-helper.js --url https://example.com/login");
    console.log('  login-helper.js --message "Log into the dashboard"');
    console.log("  login-helper.js --url https://example.com/login --message \"Need MFA\" --timeout 600");
};

if (argv.help) {
    showUsage();
    process.exit(0);
}

ensureBrowserToolsWorkdir("login-helper.js");

const timeoutSeconds = Math.max(5, Number(argv.timeout) || 300);
const timeoutMs = timeoutSeconds * 1000;
const message = argv.message?.trim() || "Please log in so the agent can continue.";
const targetUrl = argv.url?.trim() || null;

const browser = await puppeteer.connect({
    browserURL: "http://localhost:9222",
    defaultViewport: null,
});

const pages = await browser.pages();
const initialPage = pages.at(-1);

if (!initialPage) {
    console.error("✗ No active tab found");
    process.exit(1);
}

if (targetUrl) {
    await initialPage.goto(targetUrl, { waitUntil: "domcontentloaded" });
}

const pendingPages = new Set();

const livePages = () => Array.from(pendingPages).filter((page) => !page.isClosed());

const token = randomUUID();

const showPromptOnPage = async (page) => {
    if (!page || page.isClosed()) return;
    try {
        await waitForAutomation(page);
        await automationCall(page, "showLoginPrompt", [{ message, token }]);
    } catch {
        /* ignore navigation/closure issues */
    }
};

const dismissPromptOnPage = async (page) => {
    if (!page || page.isClosed()) return;
    try {
        await automationCall(page, "dismissLoginPrompt", [{ token }]);
    } catch {
        /* ignore */
    }
};

const queuePromptRefresh = (() => {
    const scheduled = new WeakSet();
    return (page) => {
        if (!page || page.isClosed() || scheduled.has(page)) {
            return;
        }
        scheduled.add(page);
        setTimeout(async () => {
            scheduled.delete(page);
            await showPromptOnPage(page);
        }, 0);
    };
})();

const registerPage = (page) => {
    if (pendingPages.has(page)) return;
    pendingPages.add(page);

    page.on("popup", (popup) => {
        registerPage(popup);
    });

    page.on("framenavigated", (frame) => {
        if (frame === page.mainFrame()) {
            queuePromptRefresh(page);
        }
    });

    page.on("close", () => {
        pendingPages.delete(page);
    });

    queuePromptRefresh(page);
};

for (const existingPage of pages) {
    registerPage(existingPage);
}
await Promise.all(livePages().map((page) => showPromptOnPage(page)));

console.log("Waiting for user login confirmation…");

const readPromptState = async (page) => {
    if (!page || page.isClosed()) return null;
    try {
        return await page.evaluate((promptToken) => {
            const state = window.__loginPromptState;
            if (!state || state.token !== promptToken) {
                return null;
            }
            return state;
        }, token);
    } catch {
        return null;
    }
};

const ensurePromptsPresent = async () => {
    await Promise.all(
        livePages().map(async (page) => {
            const state = await readPromptState(page);
            if (!state) {
                await showPromptOnPage(page);
            }
        }),
    );
};

const checkForCompletion = async () => {
    let pending = false;
    for (const page of livePages()) {
        const state = await readPromptState(page);
        if (!state) continue;
        if (state.status === "pending") {
            pending = true;
            continue;
        }
        return state;
    }
    return pending ? { status: "pending" } : null;
};

const startTime = Date.now();
let finalState = null;

while (Date.now() - startTime < timeoutMs) {
    await ensurePromptsPresent();
    const state = await checkForCompletion();
    if (state && state.status !== "pending") {
        finalState = state;
        break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
}

await Promise.all(livePages().map((page) => dismissPromptOnPage(page)));

if (!finalState) {
    console.log(`Login prompt timed out after ${timeoutSeconds}s.`);
    await browser.disconnect();
    process.exit(3);
}

if (finalState.status === "declined") {
    console.log("User skipped login; continuing without authentication.");
    await browser.disconnect();
    process.exit(2);
}

if (finalState.status === "confirmed") {
    console.log("User confirmed login; proceeding.");
    await browser.disconnect();
    process.exit(0);
}

await browser.disconnect();
process.exit(1);
