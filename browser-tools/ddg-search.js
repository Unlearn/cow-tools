#!/usr/bin/env node

import mri from "mri";
import * as cheerio from "cheerio";
import { ensureBrowserToolsWorkdir } from "./lib/workdir-guard.js";
import { getBrowserLikeHeaders } from "./lib/user-agent.js";

const argv = mri(process.argv.slice(2), {
    alias: { h: "help", l: "limit" },
    default: { limit: 10 },
});

const showUsage = () => {
    console.log("Usage: ddg-search.js <query> [--limit N]");
    console.log("\nExamples:");
    console.log('  ddg-search.js "site:example.com login"');
    console.log('  ddg-search.js "best restaurants" --limit 5');
};

if (argv.help) {
    showUsage();
    process.exit(0);
}

ensureBrowserToolsWorkdir("ddg-search.js");

const query = argv._.join(" ");
if (!query) {
    showUsage();
    process.exit(1);
}

let limit = Number(argv.limit) || 10;
limit = Math.min(Math.max(limit, 1), 25);

const BASE_URL = process.env.DDG_BASE_URL || "https://html.duckduckgo.com/html";
const HEADERS = getBrowserLikeHeaders({
    "Content-Type": "application/x-www-form-urlencoded",
});

const body = new URLSearchParams({ q: query, kl: "" }).toString();

try {
    const response = await fetch(BASE_URL, {
        method: "POST",
        headers: HEADERS,
        body,
    });

    if (!response.ok) {
        throw new Error(`DuckDuckGo responded with status ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const results = [];
    $(".result").each((_, element) => {
        if (results.length >= limit) return false;

        const titleLink = $(element).find(".result__title a").first();
        if (!titleLink.length) return;

        let link = titleLink.attr("href") || "";
        if (link.startsWith("//duckduckgo.com/l/?uddg=")) {
            const parts = link.split("uddg=")?.[1]?.split("&")?.[0];
            if (parts) link = decodeURIComponent(parts);
        }

        if (link.includes("y.js")) return; // skip ads

        const snippet = $(element).find(".result__snippet").text().trim();
        results.push({
            position: results.length + 1,
            title: titleLink.text().trim(),
            url: link,
            snippet,
        });
    });

    if (results.length === 0) {
        console.log("[]");
        console.error(`\nNo results found for "${query}". DuckDuckGo may be rate limiting.`);
    } else {
        console.log(JSON.stringify(results, null, 2));
        console.error(`\n\u2713 Found ${results.length} results for "${query}"`);
    }
} catch (error) {
    console.error(`Error querying DuckDuckGo: ${error.message}`);
    process.exit(1);
}
