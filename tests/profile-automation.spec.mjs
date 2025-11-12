import { test, expect } from "@playwright/test";
import {
    startAutomation,
    stopAutomation,
    runTool,
    spawnTool,
    serveStaticHtml,
    waitForAutomationReady,
    getLastPage,
    waitForStreamData,
    collectProcessOutput,
    parseKeyValueBlocks,
} from "./helpers.mjs";

test.describe.serial("visible automation helper", () => {
    let server;

    test.beforeAll(async () => {
        const fixtureHtml = `
            <html>
              <body>
                <header>
                  <a id="cta-link" href="https://example.com">Primary CTA</a>
                  <button id="secondary">Secondary Action</button>
                </header>
              </body>
            </html>
        `;
        server = await serveStaticHtml(fixtureHtml);
        await startAutomation({ profile: true, reset: true });
        await runTool("nav.js", [`${server.baseUrl}/interactive`]);
        const { browser, page } = await getLastPage();
        await waitForAutomationReady(page);
        await browser.close();
    });

    test.afterAll(async () => {
        await stopAutomation();
        if (server) {
            await server.close();
        }
    });

    test("automation helper exposes listClickable via eval.js", async () => {
        const { stdout } = await runTool("eval.js", ["window.automation.listClickable(3)"]);
        const entries = parseKeyValueBlocks(stdout);
        expect(entries[0].text).toContain("Primary CTA");
        expect(entries.length).toBeGreaterThanOrEqual(1);
    });

    test("pick.js returns selected element metadata", async () => {
        const picker = spawnTool("pick.js", ["Select the CTA link"]);
        const pickerResult = collectProcessOutput(picker);
        await waitForStreamData(picker.stdout, (out) => out.includes("Picker ready"));

        const { browser, page } = await getLastPage();
        await waitForAutomationReady(page);
        await page.bringToFront();
        await page.waitForTimeout(250);
        await page.click("#cta-link");
        await page.waitForTimeout(250);
        await page.keyboard.press("Enter");
        await browser.close();

        const { stdout } = await pickerResult;
        const selections = parseKeyValueBlocks(stdout);
        expect(selections[0].id).toBe("cta-link");
        expect(selections[0].tag).toBe("a");
    });
});
