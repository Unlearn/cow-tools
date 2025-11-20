#!/usr/bin/env node

import mri from "mri";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import { ensureBrowserToolsWorkdir } from "./lib/workdir-guard.js";
import { startHeartbeatInterval } from "./lib/session-heartbeat.js";
import { buildSearchSnippets } from "./lib/search-markdown.js";
import { getBrowserLikeHeaders } from "./lib/user-agent.js";

const execFileAsync = promisify(execFile);
const FETCH_TIMEOUT_MS = 30_000;
const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB limit to avoid hangs on huge files

const argv = mri(process.argv.slice(2), { alias: { h: "help", c: "context" } });

const showUsage = () => {
    console.log("Usage: pdf2md.js <pdf-path-or-url> [--search pattern] [--context N]");
    console.log("");
    console.log("Description:");
    console.log(
        "  Converts a PDF to Markdown and writes it to stdout. When --search is provided,",
    );
    console.log(
        "  emits a contextual \"Matches (pattern: …)\" block first so agents can locate sections/items",
    );
    console.log(
        "  (for example, the first dish under a specific heading) without scanning the whole file.",
    );
    console.log("");
    console.log("Examples:");
    console.log("  # Stream a local PDF as Markdown (no search):");
    console.log("  pdf2md.js /path/to/menu.pdf");
    console.log("");
    console.log("  # Find desserts in a local menu:");
    console.log('  pdf2md.js /path/to/menu.pdf --search "Desserts" --context 4');
    console.log("");
    console.log("  # Find a specific item (case-insensitive) in a remote menu:");
    console.log('  pdf2md.js https://example.com/menu.pdf --search "fraisier" --context 2');
};

if (argv.help) {
    showUsage();
    process.exit(0);
}

ensureBrowserToolsWorkdir("pdf2md.js");
const stopHeartbeat = startHeartbeatInterval();

const source = argv._[0];
const searchPattern = argv.search;
const contextWords = Math.max(0, Number.isFinite(Number(argv.context)) ? Number(argv.context) : 0);

if (!source) {
    showUsage();
    stopHeartbeat();
    process.exit(1);
}

async function extractPdfText(path) {
    try {
        await fs.access(path);
    } catch {
        console.error(`✗ PDF source not found: ${path}`);
        stopHeartbeat();
        process.exit(1);
    }

    try {
        const { stdout } = await execFileAsync("pdftotext", ["-layout", "-nopgbrk", path, "-"]);
        return stdout.toString();
    } catch (err) {
        console.error(`✗ Failed to run pdftotext on ${path}: ${err.message}`);
        stopHeartbeat();
        process.exit(1);
    }
}

async function downloadPdfToTemp(url) {
    const headers = getBrowserLikeHeaders({
        Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("timeout")), FETCH_TIMEOUT_MS);

    let response;
    try {
        response = await fetch(url, { headers, signal: controller.signal });
    } catch (err) {
        const timedOut = err?.name === "AbortError" || err?.message === "timeout";
        console.error(
            timedOut
                ? `✗ Failed to fetch PDF URL: timed out after ${Math.round(FETCH_TIMEOUT_MS / 1000)}s`
                : `✗ Failed to fetch PDF URL: ${err.message}`,
        );
        clearTimeout(timeout);
        stopHeartbeat();
        process.exit(1);
    }

    if (!response.ok) {
        console.error(`✗ Failed to fetch PDF URL: HTTP ${response.status}`);
        clearTimeout(timeout);
        stopHeartbeat();
        process.exit(1);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!/application\/pdf/i.test(contentType) && !/application\/octet-stream/i.test(contentType)) {
        console.error(
            `✗ Expected a PDF response for ${url}, but received content-type "${contentType || "unknown"}".`,
        );
        clearTimeout(timeout);
        stopHeartbeat();
        process.exit(1);
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pdf2md-"));
    const tmpPath = path.join(tmpDir, "download.pdf");

    try {
        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error("Failed to read PDF response body");
        }

        /** @type {Buffer[]} */
        const chunks = [];
        let total = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
                total += value.byteLength;
                if (total > MAX_PDF_BYTES) {
                    controller.abort(new Error("size-limit"));
                    throw new Error(
                        `PDF exceeds maximum allowed size (${Math.round(MAX_PDF_BYTES / (1024 * 1024))} MB limit)`,
                    );
                }
                chunks.push(Buffer.from(value));
            }
        }

        clearTimeout(timeout);
        await fs.writeFile(tmpPath, Buffer.concat(chunks));
        return { tmpDir, tmpPath };
    } catch (err) {
        clearTimeout(timeout);
        try {
            await fs.rm(tmpDir, { recursive: true, force: true });
        } catch {
            /* ignore cleanup errors */
        }
        const timedOut = err?.name === "AbortError" || err?.message === "timeout";
        const sizeLimited = err?.message?.includes("maximum allowed size");
        console.error(
            timedOut
                ? `✗ Failed to fetch PDF URL: timed out after ${Math.round(FETCH_TIMEOUT_MS / 1000)}s`
                : sizeLimited
                  ? `✗ ${err.message}`
                  : `✗ Failed to read PDF response body: ${err.message}`,
        );
        stopHeartbeat();
        process.exit(1);
    }
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
        stopHeartbeat();
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
stopHeartbeat();
