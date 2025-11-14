#!/usr/bin/env node

import mri from "mri";
import puppeteer from "puppeteer-core";
import { ensureBrowserToolsWorkdir } from "./lib/workdir-guard.js";

const argv = mri(process.argv.slice(2), {
    alias: { h: "help" },
    boolean: ["json"],
});

const showUsage = () => {
    console.log("Usage: ddg-search.js [--json] <query>");
    console.log("");
    console.log("Description:");
    console.log(
        "  Runs a DuckDuckGo web search in the active Brave session. By default, writes a Markdown",
    );
    console.log(
        "  summary of the top results to stdout (suitable for logs and quick inspection). When --json",
    );
    console.log(
        "  is passed, writes a JSON array of results instead, for structured filtering via tools like jq.",
    );
    console.log("  Each result has: position, title, url, domain, siteName, date, snippet.");
    console.log("");
    console.log("Examples:");
    console.log("  # Human/agent-readable summary (default):");
    console.log('  ddg-search.js "best restaurants tokyo 2025"');
    console.log("");
    console.log("  # Structured JSON for filtering:");
    console.log('  ddg-search.js --json "site:example.com login" | jq -r ".[0].url"');
    console.log("");
    console.log("  # First result from a specific domain (JSON mode):");
    console.log(
        '  ddg-search.js --json "wa good food guide restaurant of the year 2025" \\',
    );
    console.log(
        '    | jq -r \'[.[] | select(.domain | contains("wagoodfoodguide.com"))][0].url\'',
    );
};

if (argv.help) {
    showUsage();
    process.exit(0);
}

ensureBrowserToolsWorkdir("ddg-search.js");

const query = argv._.join(" ").trim();
if (!query) {
    showUsage();
    process.exit(1);
}

const limit = 10;
// DuckDuckGo settings derived from the user's custom config.
// Keep this map as the single source of truth so individual options are easy to understand and tweak.
const DDG_SETTINGS_PARAMS = {
    // Appearance / theme
    kae: "-1", // auto theme: disabled (keep default)

    // Region / language
    kad: "en_GB", // UI language + locale (English, Great Britain)

    // Safe-search / content filters
    kz: "-1", // safe search level (custom preset from config)
    ksn: "5", // number of search results per page

    // Behaviour / layout flags (taken directly from exported settings)
    kbj: "1",
    kc: "-1",
    kac: "-1",
    k1: "-1",
    kaj: "m",
    kak: "-1",
    kax: "-1",
    kaq: "-1",
    kao: "-1",
    kap: "-1",
    kau: "-1",
    ko: "-1",
    kf: "-1",
    kpsb: "-1",
    kbg: "-1",
    kbe: "0",
};

const DDG_SETTINGS_QUERY = new URLSearchParams(DDG_SETTINGS_PARAMS).toString();

async function runViaBrave(q, max) {
    let browser;
    try {
        browser = await puppeteer.connect({
            browserURL: "http://localhost:9222",
            defaultViewport: null,
        });
    } catch (err) {
        throw new Error(
            `Unable to connect to Brave on http://localhost:9222: ${err?.message || err}. ` +
                "Start Brave with start.js before running ddg-search.js.",
        );
    }

    try {
        const pages = await browser.pages();
        const page = pages.at(-1) || (await browser.newPage());

        const url =
            process.env.DDG_SERP_URL ||
            `https://duckduckgo.com/?${DDG_SETTINGS_QUERY}&q=${encodeURIComponent(q)}&ia=web`;
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
        await page
            .waitForSelector("[data-testid='result']", { timeout: 15000 })
            .catch(() => {});

        const isAnomaly = await page.evaluate(() => {
            const title = document.querySelector(".anomaly-modal__title");
            if (title && title.textContent?.includes("Unfortunately, bots use DuckDuckGo too.")) {
                return true;
            }
            return false;
        });

        if (isAnomaly) {
            throw new Error(
                "DuckDuckGo presented a bot challenge on the full site. Try a different network or run this manually in the browser.",
            );
        }

        const results = await page.evaluate((maxResults) => {
            const cards = Array.from(document.querySelectorAll("[data-testid='result']"));
            const out = [];

            for (const card of cards) {
                if (out.length >= maxResults) break;

                const titleA = card.querySelector("[data-testid='result-title-a']");
                if (!(titleA instanceof HTMLAnchorElement)) continue;

                const snippetEl =
                    card.querySelector("[data-testid='result-snippet']") ||
                    card.lastElementChild ||
                    null;
                const title = titleA.textContent?.trim() || "";
                const url = titleA.href || "";
                const pNodes = Array.from(card.querySelectorAll("p"));
                let domain = "";
                let siteName = "";

                if (pNodes.length > 0) {
                    domain = pNodes[0]?.textContent?.trim() || "";
                }
                if (pNodes.length > 1) {
                    const text = pNodes[1]?.textContent?.trim() || "";
                    if (text && !text.includes("http")) {
                        siteName = text;
                    }
                }

                if (!domain && url) {
                    try {
                        const u = new URL(url);
                        domain = u.hostname.replace(/^www\./, "");
                    } catch {
                        /* ignore */
                    }
                }

                if (!siteName) {
                    siteName = domain;
                }

                let date = "";
                if (snippetEl) {
                    const spans = Array.from(snippetEl.querySelectorAll("span"));
                    for (const span of spans) {
                        const text = span.textContent?.trim() || "";
                        if (!text) continue;
                        const absoluteDate = /^\d{1,2}\s+\w+\s+\d{4}$/;
                        const relativeDate =
                            /^\d+\s+(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s+ago$/;
                        if (absoluteDate.test(text) || relativeDate.test(text)) {
                            date = text;
                            break;
                        }
                    }
                }

                let snippet = snippetEl?.textContent?.trim() || "";

                if (!snippet) {
                    const children = Array.from(card.children);
                    let best = "";
                    for (const child of children) {
                        const text = child.textContent?.trim() || "";
                        if (!text) continue;
                        if (
                            text.includes("Only include results for this site") ||
                            text.includes("Redo search without this site") ||
                            text.includes("Share feedback about this site")
                        ) {
                            continue;
                        }
                        if (/^https?:\/\//.test(text)) continue;
                        if (text === domain || text === siteName) continue;
                        if (text.startsWith(domain)) continue;
                        if (text.length <= best.length) continue;
                        best = text;
                    }
                    snippet = best;
                }

                if (date && snippet.startsWith(date)) {
                    snippet = snippet.slice(date.length).trim();
                }

                if (!title || !url) continue;
                if (url.includes("duckduckgo.com/y.js")) continue; // skip ads

                out.push({
                    position: out.length + 1,
                    title,
                    url,
                    domain,
                    siteName,
                    date,
                    snippet,
                });
            }

            return out;
        }, max);

        return results;
    } finally {
        await browser.disconnect().catch(() => {});
    }
}

function formatMarkdownResults(results, q) {
    const lines = [];
    lines.push(`# DuckDuckGo results for "${q}"`);
    lines.push("");

    for (const result of results) {
        lines.push(`## ${result.position}. ${result.title || "(no title)"}`);
        lines.push("");
        lines.push(`- URL: ${result.url}`);
        if (result.domain) lines.push(`- Domain: ${result.domain}`);
        if (result.siteName) lines.push(`- Site: ${result.siteName}`);
        if (result.date) lines.push(`- Date: ${result.date}`);
        if (result.snippet) {
            lines.push(`- Snippet: ${result.snippet}`);
        }
        lines.push("");
    }

    return lines.join("\n");
}

try {
    let results;

    results = await runViaBrave(query, limit);

    if (!results || results.length === 0) {
        if (argv.json) {
            console.log("[]");
        } else {
            console.log(`# DuckDuckGo results for "${query}"`);
            console.log("");
            console.log("_No results found._");
        }
        console.error(`\nNo results found for "${query}".`);
    } else if (argv.json) {
        console.log(JSON.stringify(results, null, 2));
        console.error(`\n\u2713 Found ${results.length} results for "${query}"`);
    } else {
        console.log(formatMarkdownResults(results, query));
        console.error(`\n\u2713 Found ${results.length} results for "${query}"`);
    }
} catch (error) {
    console.error(`Error querying DuckDuckGo: ${error.message}`);
    process.exit(1);
}
