#!/usr/bin/env node

import mri from "mri";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import { ensureBrowserToolsWorkdir } from "./lib/workdir-guard.js";
import { buildSearchSnippets } from "./lib/search-markdown.js";
import { getBrowserLikeHeaders } from "./lib/user-agent.js";

const execFileAsync = promisify(execFile);

const argv = mri(process.argv.slice(2), { alias: { h: "help", c: "context" } });

const showUsage = () => {
    console.log("Usage: pdf2md.js <pdf-path-or-url> [--search pattern] [--context N] [--search-flags ie]");
    console.log("\nExamples:");
    console.log("  # Stream a local PDF as Markdown (no search):");
    console.log("  pdf2md.js /path/to/menu.pdf");
    console.log("\n  # Convert and search a local PDF using built-in JS regex:");
    console.log('  pdf2md.js /path/to/menu.pdf --search \"dessert|Tokyo\" --context 1');
    console.log("\n  # Convert and search a PDF from a URL:");
    console.log('  pdf2md.js https://example.com/menu.pdf --search \"Banoffee\" --context 0');
    console.log('  pdf2md.js https://example.com/menu.pdf --search \"fraisier\" --context 2 --search-flags i');
};

if (argv.help) {
    showUsage();
    process.exit(0);
}

ensureBrowserToolsWorkdir("pdf2md.js");

const source = argv._[0];
const searchPattern = argv.search;
const contextWords = Math.max(0, Number.isFinite(Number(argv.context)) ? Number(argv.context) : 0);
const userFlags = typeof argv["search-flags"] === "string" ? argv["search-flags"] : "";

if (!source) {
    showUsage();
    process.exit(1);
}

async function extractPdfText(path) {
    try {
        await fs.access(path);
    } catch {
        console.error(`✗ PDF source not found: ${path}`);
        process.exit(1);
    }

    try {
        const { stdout } = await execFileAsync("pdftotext", ["-layout", "-nopgbrk", path, "-"]);
        return stdout.toString();
    } catch (err) {
        console.error(`✗ Failed to run pdftotext on ${path}: ${err.message}`);
        process.exit(1);
    }
}

async function downloadPdfToTemp(url) {
    const headers = getBrowserLikeHeaders({
        Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
    });

    let response;
    try {
        response = await fetch(url, { headers });
    } catch (err) {
        console.error(`✗ Failed to fetch PDF URL: ${err.message}`);
        process.exit(1);
    }

    if (!response.ok) {
        console.error(`✗ Failed to fetch PDF URL: HTTP ${response.status}`);
        process.exit(1);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!/application\/pdf/i.test(contentType) && !/application\/octet-stream/i.test(contentType)) {
        console.error(
            `✗ Expected a PDF response for ${url}, but received content-type "${contentType || "unknown"}".`,
        );
        process.exit(1);
    }

    let arrayBuffer;
    try {
        arrayBuffer = await response.arrayBuffer();
    } catch (err) {
        console.error(`✗ Failed to read PDF response body: ${err.message}`);
        process.exit(1);
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pdf2md-"));
    const tmpPath = path.join(tmpDir, "download.pdf");
    await fs.writeFile(tmpPath, Buffer.from(arrayBuffer));
    return { tmpDir, tmpPath };
}

let pdfPath = source;
let tmpDir = "";
if (/^https?:\/\//i.test(source)) {
    const download = await downloadPdfToTemp(source);
    pdfPath = download.tmpPath;
    tmpDir = download.tmpDir;
}

const text = await extractPdfText(pdfPath);

if (tmpDir) {
    try {
        await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
        // ignore cleanup errors
    }
}

// For now, treat the pdftotext output as Markdown with minimal normalisation.
const markdown = text.replace(/\r\n/g, "\n");

let matchesMarkdown = "";
if (searchPattern) {
    try {
        const { snippets, label } = buildSearchSnippets(markdown, {
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
        process.exit(1);
    }
}

// Emit a simple citation block on stderr so callers can reference the source.
const citationLines = [
    `source: ${source}`,
    "contentType: application/pdf",
    `generatedAt: ${new Date().toISOString()}`,
];
process.stderr.write(`${citationLines.join("\n")}\n\n`);

if (matchesMarkdown) {
    process.stdout.write(matchesMarkdown);
}
process.stdout.write(markdown);
