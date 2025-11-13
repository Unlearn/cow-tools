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
    let fixtureUrl;

    async function ensureTestPageReady() {
        const { browser, page } = await getLastPage();
        await waitForAutomationReady(page);
        return { browser, page };
    }

    test.beforeAll(async () => {
        const fixtureHtml = `
            <html>
              <body>
                <header>
                  <a id="cta-link" href="https://example.com">Primary CTA</a>
                  <button id="secondary">Secondary Action</button>
                  <p class="body-copy">Body copy block</p>
                </header>
              </body>
            </html>
        `;
        server = await serveStaticHtml(fixtureHtml);
        fixtureUrl = `${server.baseUrl}/interactive`;
        await startAutomation({ profile: true, reset: true });
    });

    test.afterAll(async () => {
        await stopAutomation();
        await server?.close();
    });

    test.beforeEach(async () => {
        await runTool("nav.js", [fixtureUrl]);
        const { browser } = await ensureTestPageReady();
        await browser.close();
    });

    test("automation helper exposes listClickable via eval.js", async () => {
        const { stdout } = await runTool("eval.js", ["window.automation.listClickable(3)"]);
        const entries = parseKeyValueBlocks(stdout);
        expect(entries[0].text).toContain("Primary CTA");
        expect(entries.length).toBeGreaterThanOrEqual(1);
    });

    test("automation helper highlights elements, toggles banner, and collects text", async () => {
        const { browser, page } = await ensureTestPageReady();
        const result = await page.evaluate(() => {
            const banner = document.getElementById("automation-session-banner");
            const before = window.getComputedStyle(banner).display;
            window.automation.hideBanner();
            const hidden = window.getComputedStyle(banner).display;
            window.automation.showBanner();
            const after = window.getComputedStyle(banner).display;
            const highlight = window.automation.highlight("#cta-link");
            window.automation.hideHighlight();
            const texts = window.automation.collectText("a", 2);
            return { before, hidden, after, highlight, textsLength: texts.length };
        });
        expect(result.before).toBe("block");
        expect(result.hidden).toBe("none");
        expect(result.after).toBe("block");
        expect(result.highlight.selector).toContain("#cta-link");
        expect(result.textsLength).toBeGreaterThanOrEqual(1);
        await browser.close();
    });

    test("pick.js returns selected element metadata", async () => {
        const picker = spawnTool("pick.js", ["Select the CTA link"]);
        const pickerResult = collectProcessOutput(picker);
        await waitForStreamData(picker.stdout, (out) => out.includes("Picker ready"));

        const { browser, page } = await ensureTestPageReady();
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

    test("pick.js cancels selection when Escape is pressed", async () => {
        const picker = spawnTool("pick.js", ["Select the CTA link"]);
        const pickerResult = collectProcessOutput(picker);
        await waitForStreamData(picker.stdout, (out) => out.includes("Picker ready"));

        const { browser, page } = await ensureTestPageReady();
        await page.bringToFront();
        await page.waitForTimeout(250);
        await page.keyboard.press("Escape");
        await browser.close();

        const { code, stdout } = await pickerResult;
        expect(code).toBe(0);
        expect(stdout).toContain("null");
    });
});
