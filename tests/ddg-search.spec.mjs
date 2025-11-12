import { test, expect } from "@playwright/test";
import { runTool, withFixtureServer, readFile } from "./helpers.mjs";

test("ddg-search.js parses DuckDuckGo results", async () => {
    const fixture = await readFile("tests/fixtures/ddg-response.html");
    const server = await withFixtureServer((req, res) => {
        if (req.method !== "POST") {
            res.writeHead(404);
            res.end();
            return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(fixture);
    });

    const { stdout } = await runTool("ddg-search.js", ["playwright", "--limit", "2"], {
        env: { DDG_BASE_URL: server.baseUrl },
    });

    const results = JSON.parse(stdout);
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe("Example Result");
    expect(results[1].url).toBe("https://example.org");

    await server.close();
});

test("ddg-search.js surfaces HTTP errors", async () => {
    const server = await withFixtureServer((req, res) => {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("nope");
    });

    await expect(
        runTool("ddg-search.js", ["failure"], { env: { DDG_BASE_URL: server.baseUrl } }),
    ).rejects.toThrow(/status 500/);

    await server.close();
});
