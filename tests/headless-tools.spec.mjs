import fs from "node:fs/promises";
import { test, expect } from "@playwright/test";
import {
    startAutomation,
    stopAutomation,
    runTool,
    getLastPage,
    serveStaticHtml,
} from "./helpers.mjs";

const stripAnsi = (value) => value.replace(/\u001b\[[0-9;]*m/g, "");

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

        await runTool("nav.js", ["https://example.org", "--new"]);
        const pages = await page.context().pages();
        expect(pages.length).toBeGreaterThanOrEqual(2);
        await browser.close();

        const { stdout: title } = await runTool("eval.js", ["document.title"]);
        expect(title.trim()).toBe("Example Domain");

        const { stdout: objectResult } = await runTool("eval.js", [
            "({links: Array.from(document.links).length, title: document.title})",
        ]);
        expect(objectResult).toContain("links:");
        expect(objectResult).toContain("title: Example Domain");

        const { stdout: asyncResult } = await runTool("eval.js", ["await Promise.resolve('async-ok')"]);
        expect(asyncResult.trim()).toBe("async-ok");
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
        let screenshot = await runTool("screenshot.js", ["--viewport"]);
        let screenshotPath = screenshot.stdout.trim();
        let stats = await fs.stat(screenshotPath);
        expect(stats.size).toBeGreaterThan(8_000);
        await fs.unlink(screenshotPath);

        screenshot = await runTool("screenshot.js", ["--selector", "h1"]);
        screenshotPath = screenshot.stdout.trim();
        stats = await fs.stat(screenshotPath);
        expect(stats.size).toBeGreaterThan(1_000);
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

    test("fetch-readable.js can search text and emit contextual matches", async () => {
        const articleHtml = `
            <html>
              <body>
                <main>
                  <h1>City Rankings 2025</h1>
                  <p>Paris leads the list, followed by Tokyo and Sydney.</p>
                  <p>The dessert lineup opens with Fraisier and continues with mille-feuille.</p>
                  <p>Reservations are mandatory.</p>
                </main>
              </body>
            </html>
        `;
        const server = await serveStaticHtml(articleHtml);
        const url = `${server.baseUrl}/ranking`;

        const { stdout } = await runTool("fetch-readable.js", [
            url,
            "--search",
            "dessert|Tokyo",
            "--context",
            "0",
        ]);

        expect(stdout).toContain("City Rankings 2025");
        expect(stdout).toContain("Paris leads the list");
        expect(stdout).toContain("Fraisier");
        expect(stdout).toContain("Tokyo");
        expect(stdout).toContain("Matches (pattern: /dessert|Tokyo/, context words: 0):");
        expect(stdout).toContain("- `Tokyo`");
        expect(stdout).toContain("- `dessert`");

        await server.close();
    });

    test("fetch-readable.js supports context padding and literal patterns", async () => {
        const articleHtml = `
            <html>
              <body>
                <main>
                  <p>Intro paragraph mentioning chocolate cake.</p>
                  <p>Middle paragraph describing vanilla custard.</p>
                  <p>Closing paragraph about coffee service.</p>
                </main>
              </body>
            </html>
        `;
        const server = await serveStaticHtml(articleHtml);
        const url = `${server.baseUrl}/desserts`;

        const { stdout } = await runTool("fetch-readable.js", [
            url,
            "--search",
            "vanilla",
            "--context",
            "1",
        ]);

        expect(stdout).toContain("Matches (pattern: /vanilla/, context words: 1):");
        expect(stdout).toContain("- `describing vanilla custard.`");

        await server.close();
    });

    test("automation helper fallback injects in headless mode", async () => {
        await runTool("nav.js", ["https://example.com"]);
        const before = await runTool("eval.js", ["Boolean(window.__automationReady)"]);
        expect(stripAnsi(before.stdout).trim()).toBe("false");

        const elementShot = await runTool("screenshot.js", ["--selector", "h1"]);
        await fs.unlink(elementShot.stdout.trim());

        const after = await runTool("eval.js", ["Boolean(window.__automationReady)"]);
        expect(stripAnsi(after.stdout).trim()).toBe("true");
    });
});
