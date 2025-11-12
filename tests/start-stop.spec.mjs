import { test, expect } from "@playwright/test";
import {
    startAutomation,
    stopAutomation,
    ensureStopped,
    connectToBrave,
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
});
