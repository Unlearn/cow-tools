#!/usr/bin/env node

import mri from "mri";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import TurndownService from "turndown";

const argv = mri(process.argv.slice(2), { alias: { h: "help" } });
const showUsage = () => {
    console.log("Usage: fetch-readable.js <url>");
    console.log("\nExamples:");
    console.log("  fetch-readable.js https://example.com > article.md");
    console.log("  fetch-readable.js https://blog.com | rg 'keyword'");
};

if (argv.help) {
    showUsage();
    process.exit(0);
}

const url = argv._[0];

if (!url) {
    showUsage();
    process.exit(1);
}

const b = await puppeteer.connect({
    browserURL: "http://localhost:9222",
    defaultViewport: null,
});

const page = (await b.pages()).at(-1);
if (!page) {
    console.error("✗ No active tab found. Start Brave via tools/start.js first.");
    await b.disconnect();
    process.exit(1);
}

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
    return { title: parsed.title, content: parsed.content };
});

if (!article) {
    console.error("✗ Failed to extract readable content. The page may be incompatible.");
    await b.disconnect();
    process.exit(1);
}

const turndown = new TurndownService({ headingStyle: "atx" });
const markdown = turndown.turndown(article.content ?? "");
const finalContent = `# ${article.title}\n\n${markdown}\n`;

process.stdout.write(finalContent);

await b.disconnect();
