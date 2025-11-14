import { test, expect } from "@playwright/test";
import { runTool, withHeadlessAutomation, ensureStopped, readFile, withFixtureServer } from "./helpers.mjs";

test.describe.serial("ddg-search.js", () => {
    test("parses DDG-style SERP markup", async () => {
        const fixtureHtml = await readFile("tests/fixtures/ddg-serp.html");

        await withHeadlessAutomation(async () => {
            const server = await withFixtureServer((req, res) => {
                res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                res.end(fixtureHtml);
            });

            const { stdout } = await runTool("ddg-search.js", ["--json", "China"], {
                env: { DDG_SERP_URL: server.baseUrl },
            });

            await server.close();

            const results = JSON.parse(stdout);
            expect(results).toHaveLength(2);

            const first = results[0];
            expect(first.title).toBe("China - Wikipedia");
            expect(first.url).toBe("https://en.wikipedia.org/wiki/China");
            expect(first.domain).toBe("en.wikipedia.org");
            expect(first.siteName).toBe("Wikipedia");
            expect(first.date).toBe("");
            expect(first.snippet).toContain("officially the People's Republic of China");

            const second = results[1];
            expect(second.title).toContain("China | Events, People, Dates, Flag, Map, & Facts | Britannica");
            expect(second.url).toBe("https://www.britannica.com/place/China");
            expect(second.domain).toBe("britannica.com");
            expect(second.siteName).toBe("Britannica");
            expect(second.date).toBe("4 days ago");
            expect(second.snippet).toContain("China is a country of East Asia.");
        });
    });

    test("renders a Markdown summary by default", async () => {
        const fixtureHtml = await readFile("tests/fixtures/ddg-serp.html");

        await withHeadlessAutomation(async () => {
            const server = await withFixtureServer((req, res) => {
                res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                res.end(fixtureHtml);
            });

            const { stdout } = await runTool("ddg-search.js", ["China"], {
                env: { DDG_SERP_URL: server.baseUrl },
            });

            await server.close();

            const text = stdout.trim();

            expect(text).toContain('# DuckDuckGo results for "China"');
            expect(text).toContain("## 1. China - Wikipedia");
            expect(text).toContain("https://en.wikipedia.org/wiki/China");
            expect(text).toContain("## 2. China | Events, People, Dates, Flag, Map, & Facts | Britannica");
            expect(text).toContain("https://www.britannica.com/place/China");
        });
    });

    test("returns no results for queries with no SERP cards", async () => {
        const emptyHtml = await readFile("tests/fixtures/ddg-empty.html");

        await withHeadlessAutomation(async () => {
            const server = await withFixtureServer((req, res) => {
                res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                res.end(emptyHtml);
            });

            const { stdout } = await runTool("ddg-search.js", ["--json", '"this very long string with quotes"'], {
                env: { DDG_SERP_URL: server.baseUrl },
            });

            await server.close();

            const results = JSON.parse(stdout);
            expect(Array.isArray(results)).toBe(true);
            expect(results).toHaveLength(0);
        });
    });

    test("fails clearly when Brave is unavailable", async () => {
        await ensureStopped();

        await expect(runTool("ddg-search.js", ["test-query"], { timeout: 20_000 })).rejects.toThrow(
            /Unable to connect to Brave on http:\/\/localhost:9222/,
        );
    });
});
