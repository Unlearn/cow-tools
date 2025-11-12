import { test, expect } from "@playwright/test";
import {
    startAutomation,
    stopAutomation,
    spawnTool,
    waitForStreamData,
    collectProcessOutput,
    waitForAutomationReady,
    getLastPage,
    withFixtureServer,
    readFile,
} from "./helpers.mjs";

const overlaySelector = "#login-helper-panel";

async function createLoginServer() {
    const loginHtml = await readFile("tests/fixtures/login-flow.html");
    return withFixtureServer((req, res) => {
        if (req.url === "/app") {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end("<h1>App home</h1>");
            return;
        }
        if (req.url === "/popup") {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end("<button id='popup-done'>Done</button>");
            return;
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(loginHtml);
    });
}

test.describe.serial("login-helper", () => {
    let server;

    test.beforeAll(async () => {
        server = await createLoginServer();
        await startAutomation({ profile: true, reset: true });
    });

    test.afterAll(async () => {
        await stopAutomation();
        await server.close();
    });

    test("user logs in successfully after navigation", async () => {
        const loginTool = spawnTool("login-helper.js", ["--url", `${server.baseUrl}/login`, "--message", "Log into Fixture"]);
        const toolResult = collectProcessOutput(loginTool);
        await waitForStreamData(loginTool.stdout, (out) => out.includes("Waiting for user login"));

        const { browser, page } = await getLastPage();
        await waitForAutomationReady(page);
        await page.waitForSelector(overlaySelector);
        await page.click("#login-button");
        await page.waitForURL(`${server.baseUrl}/app`);
        await page.waitForSelector(overlaySelector);
        await page.click(`${overlaySelector} button[data-login-action="confirm"]`);

        const { code, stdout } = await toolResult;
        await browser.close();
        expect(code).toBe(0);
        expect(stdout).toContain("User confirmed login");
    });

    test("user declines login", async () => {
        const loginTool = spawnTool("login-helper.js", ["--url", `${server.baseUrl}/login`, "--message", "Log into Fixture"]);
        const toolResult = collectProcessOutput(loginTool);
        await waitForStreamData(loginTool.stdout, (out) => out.includes("Waiting for user login"));

        const { browser, page } = await getLastPage();
        await waitForAutomationReady(page);
        await page.waitForSelector(overlaySelector);
        await page.click(`${overlaySelector} button[data-login-action="decline"]`);

        const { code, stdout } = await toolResult;
        await browser.close();
        expect(code).toBe(2);
        expect(stdout).toContain("User skipped login");
    });

    test("overlay persists while popup flow completes", async () => {
        const loginTool = spawnTool("login-helper.js", ["--url", `${server.baseUrl}/login`]);
        const toolResult = collectProcessOutput(loginTool);
        await waitForStreamData(loginTool.stdout, (out) => out.includes("Waiting for user login"));

        const { browser, page } = await getLastPage();
        await waitForAutomationReady(page);
        await page.waitForSelector(overlaySelector);
        await page.click("#popup-login");
        await page.waitForURL(`${server.baseUrl}/app`);
        await page.waitForSelector(overlaySelector);
        await page.click(`${overlaySelector} button[data-login-action="confirm"]`);

        const { code } = await toolResult;
        await browser.close();
        expect(code).toBe(0);
    });

    test("times out if user takes too long", async () => {
        const loginTool = spawnTool("login-helper.js", ["--url", `${server.baseUrl}/login`, "--timeout", "2"]);
        const { code, stdout } = await collectProcessOutput(loginTool);
        expect(code).toBe(3);
        expect(stdout).toContain("Login prompt timed out");
    });
});
