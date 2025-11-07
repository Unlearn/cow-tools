#!/usr/bin/env node

import * as cheerio from "cheerio";

const args = process.argv.slice(2);
if (args.length === 0) {
	console.log("Usage: ddg-search.js <query> [--limit N]");
	console.log("\nExample:");
	console.log('  ddg-search.js "site:example.com login" --limit 5');
    process.exit(1);
}

let limit = 10;
const limitIndex = args.indexOf("--limit");
if (limitIndex !== -1) {
    const limitValue = Number(args[limitIndex + 1]);
    if (!Number.isNaN(limitValue) && limitValue > 0) {
        limit = Math.min(limitValue, 25);
    }
    args.splice(limitIndex, 2);
}

const query = args.join(" ");

const BASE_URL = "https://html.duckduckgo.com/html";
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Content-Type": "application/x-www-form-urlencoded",
};

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
