import { test, expect } from "@playwright/test";
import {
    startAutomation,
    stopAutomation,
    ensureStopped,
    connectToBrave,
    getLastPage,
    waitForAutomationReady,
} from "./helpers.mjs";

test.describe.serial("start/stop lifecycle", () => {
    test.beforeEach(async () => {
        await ensureStopped();
    });

    test.afterEach(async () => {
        await ensureStopped();
    });

    test("start.js launches Brave and exposes CDP", async () => {
        const { stdout } = await startAutomation();
        expect(stdout).toContain("✓ Brave started");

        const browser = await connectToBrave();
        const contexts = browser.contexts();
        expect(contexts.length).toBeGreaterThan(0);

        const pages = contexts.flatMap((ctx) => ctx.pages());
        expect(pages.length).toBeGreaterThan(0);

        await browser.close();
    });

    test("stop.js terminates sessions idempotently", async () => {
        await startAutomation();
        const first = await stopAutomation();
        expect(first.stdout).toMatch(/Stopped|Closed/);

        const second = await stopAutomation();
        expect(second.stdout).toContain("No automation Brave processes");
    });

    test("stop.js kills processes even when tabs were closed manually", async () => {
        await startAutomation();
        const browser = await connectToBrave();
        const pages = browser.contexts().flatMap((ctx) => ctx.pages());
        await Promise.all(pages.map((p) => p.close()));
        await browser.close();
        const result = await stopAutomation();
        expect(result.stdout).toContain("Stopped");
    });

    test("start.js --profile --reset honors env overrides", async () => {
        await ensureStopped();
        const env = {
            BROWSER_TOOLS_WINDOW_SIZE: "800,600",
            BROWSER_TOOLS_USER_AGENT: "Playwright-Test-Agent",
        };
        await startAutomation({ profile: true, reset: true, env });

        const { browser, page } = await getLastPage();
        await waitForAutomationReady(page);
        const dimensions = await page.evaluate(() => ({
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            outerWidth: window.outerWidth,
            outerHeight: window.outerHeight,
        }));
        const ua = await page.evaluate(() => navigator.userAgent);
        expect(dimensions.outerWidth).toBe(800);
        expect(dimensions.outerHeight).toBe(600);
        expect(dimensions.innerWidth).toBeGreaterThan(700);
        expect(dimensions.innerWidth).toBeLessThanOrEqual(800);
        expect(ua).toContain("Playwright-Test-Agent");
        await browser.close();

        await stopAutomation();
    });

    test("stop.js reports when no automation processes exist", async () => {
        await ensureStopped();
        const result = await stopAutomation();
        expect(result.stdout).toContain("No automation Brave processes");
    });
});
