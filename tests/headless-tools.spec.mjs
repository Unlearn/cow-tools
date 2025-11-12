import fs from "node:fs/promises";
import { test, expect } from "@playwright/test";
import {
    startAutomation,
    stopAutomation,
    runTool,
    getLastPage,
    serveStaticHtml,
} from "./helpers.mjs";

test.describe.serial("headless browser tools", () => {
    test.beforeAll(async () => {
        await startAutomation();
    });

    test.afterAll(async () => {
        await stopAutomation();
    });

    test("nav.js and eval.js operate on the active tab", async () => {
        await runTool("nav.js", ["https://example.com"]);
        const { browser, page } = await getLastPage();
        await expect(page).toHaveURL(/example\.com/);
        await expect(page).toHaveTitle("Example Domain");
        await browser.close();

        const { stdout } = await runTool("eval.js", ["document.title"]);
        expect(stdout.trim()).toBe("Example Domain");
    });

    test("cookies.js reports cookies set via eval.js", async () => {
        await runTool("nav.js", ["https://example.com"]);
        await runTool("eval.js", ['(()=>{document.cookie="suite=headless";return document.cookie;})()']);
        const { stdout } = await runTool("cookies.js");
        expect(stdout).toContain("suite");
        expect(stdout).toContain("headless");
    });

    test("screenshot.js captures the page and fetch-readable.js returns markdown", async () => {
        await runTool("nav.js", ["https://example.com"]);
        const screenshot = await runTool("screenshot.js");
        const screenshotPath = screenshot.stdout.trim();
        const stats = await fs.stat(screenshotPath);
        expect(stats.size).toBeGreaterThan(10_000);
        await fs.unlink(screenshotPath);

        const articleHtml = `
            <html>
              <body>
                <main>
                  <h1>Automation Ready</h1>
                  <p>This is a test article used for fetch-readable.js.</p>
                </main>
              </body>
            </html>
        `;
        const server = await serveStaticHtml(articleHtml);
        const url = `${server.baseUrl}/article`;

        const { stdout: markdown } = await runTool("fetch-readable.js", [url]);
        expect(markdown).toContain("# Automation Ready");
        expect(markdown).toContain("test article");

        await server.close();
    });
});
