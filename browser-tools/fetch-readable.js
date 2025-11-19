#!/usr/bin/env node

import mri from "mri";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import TurndownService from "turndown";
import { ensureBrowserToolsWorkdir } from "./lib/workdir-guard.js";
import { startHeartbeatInterval } from "./lib/session-heartbeat.js";
import { buildSearchSnippets } from "./lib/search-markdown.js";

const argv = mri(process.argv.slice(2), { alias: { h: "help", c: "context" } });
const showUsage = () => {
    console.log(
        "Usage: fetch-readable.js <url> [--search pattern] [--context N] [--search-flags ie]",
    );
    console.log("");
    console.log("Description:");
    console.log(
        "  Loads <url> in the active Brave session, runs Mozilla Readability, converts the main article",
    );
    console.log(
        "  to Markdown, and writes it to stdout. With --search, emits a contextual \"Matches (pattern: …)\"",
    );
    console.log(
        "  block first so agents can quickly locate key phrases before consuming the full article.",
    );
    console.log("");
    console.log("Examples:");
    console.log("  fetch-readable.js https://example.com > article.md");
    console.log(
        '  fetch-readable.js https://blog.com --search "dessert|Tokyo" --context 1 --search-flags i',
    );
};

if (argv.help) {
    showUsage();
    process.exit(0);
}

ensureBrowserToolsWorkdir("fetch-readable.js");
const stopHeartbeat = startHeartbeatInterval();
const url = argv._[0];
const searchPattern = argv.search;
const contextWords = Math.max(0, Number.isFinite(Number(argv.context)) ? Number(argv.context) : 0);
const userFlags = typeof argv["search-flags"] === "string" ? argv["search-flags"] : "";

if (!url) {
    showUsage();
    process.exit(1);
}

const b = await puppeteer.connect({
    browserURL: "http://localhost:9222",
    defaultViewport: null,
});

const cleanup = async () => {
    await b.disconnect().catch(() => {});
    stopHeartbeat();
};

const page = (await b.pages()).at(-1);
if (!page) {
    console.error("✗ No active tab found. Start Brave via tools/start.js first.");
    await cleanup();
    process.exit(1);
}

await page.setBypassCSP(true).catch(() => {});

await page.goto(url, { waitUntil: "domcontentloaded" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readabilityPath = path.join(__dirname, "..", "lib", "Readability.js");
await page.addScriptTag({ path: readabilityPath });

const article = await page.evaluate(() => {
    if (!window.Readability) {
        throw new Error("Readability script failed to load");
    }
    const doc = document.cloneNode(true);
    const parsed = new window.Readability(doc).parse();
    if (!parsed) {
        return null;
    }
    return { title: parsed.title, content: parsed.content, textContent: parsed.textContent };
});

if (!article) {
    console.error("✗ Failed to extract readable content. The page may be incompatible.");
    await cleanup();
    process.exit(1);
}

const turndown = new TurndownService({ headingStyle: "atx" });
const markdown = turndown.turndown(article.content ?? "");

let matchesMarkdown = "";
if (searchPattern) {
    try {
        const textSource = article.textContent ?? markdown;
        const { snippets, label } = buildSearchSnippets(textSource, {
            pattern: searchPattern,
            flags: userFlags,
            contextWords,
        });
        if (snippets.length) {
            matchesMarkdown =
                `Matches (pattern: ${label}, context words: ${contextWords}):\n` +
                snippets.map((snippet) => `- \`${snippet}\``).join("\n") +
                "\n\n";
        } else {
            matchesMarkdown =
                `Matches (pattern: ${label}, context words: ${contextWords}):\n- _No matches found_\n\n`;
        }
    } catch (err) {
        console.error(`✗ Failed to process --search pattern: ${err.message}`);
        await cleanup();
        process.exit(1);
    }
}

const finalContent = `# ${article.title}\n\n${markdown}\n`;

if (matchesMarkdown) {
    process.stdout.write(matchesMarkdown);
}
process.stdout.write(finalContent);

await cleanup();
