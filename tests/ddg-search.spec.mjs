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

            const { stdout } = await runTool("ddg-search.js", ["China"], {
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

    test("fails clearly when Brave is unavailable", async () => {
        await ensureStopped();

        await expect(runTool("ddg-search.js", ["test-query"], { timeout: 20_000 })).rejects.toThrow(
            /Unable to connect to Brave on http:\/\/localhost:9222/,
        );
    });
});
