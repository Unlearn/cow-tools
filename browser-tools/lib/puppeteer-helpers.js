import puppeteer from "puppeteer-core";
import { ensureBrowserToolsWorkdir } from "./workdir-guard.js";

export async function connectToBraveOrExit(scriptName) {
    ensureBrowserToolsWorkdir(scriptName);
    try {
        const browser = await puppeteer.connect({
            browserURL: "http://localhost:9222",
            defaultViewport: null,
        });
        return browser;
    } catch (error) {
        const reason = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
        console.error(
            [
                `✗ ${scriptName} could not connect to Brave on http://localhost:9222.`,
                "  Start a session via `node start.js` (or restart it if the watchdog timed out), then rerun this command.",
                reason ? `  Details: ${reason}` : "",
            ]
                .filter(Boolean)
                .join("\n"),
        );
        process.exit(1);
    }
}

export async function getActivePageOrExit(browser, scriptName) {
    const page = (await browser.pages()).at(-1);
    if (!page) {
        console.error(
            [
                `✗ ${scriptName} could not find an active tab in Brave.`,
                "  Ensure start.js is running and at least one tab is open before invoking this tool.",
            ].join("\n"),
        );
        await browser.disconnect().catch(() => {});
        process.exit(1);
    }
    return page;
}
