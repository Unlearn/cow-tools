import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

export const automationEndpoint = "http://localhost:9222";

export async function runTool(script, args = [], options = {}) {
    const toolPath = path.join(repoRoot, "browser-tools", script);
    const env = { ...process.env, ...(options.env ?? {}) };
    const execOptions = {
        cwd: repoRoot,
        env,
        timeout: options.timeout ?? 60_000,
        maxBuffer: options.maxBuffer ?? 10 * 1024 * 1024,
    };

    try {
        return await execFileAsync(process.execPath, [toolPath, ...args], execOptions);
    } catch (error) {
        const stdout = error.stdout ? `\nSTDOUT:\n${error.stdout}` : "";
        const stderr = error.stderr ? `\nSTDERR:\n${error.stderr}` : "";
        error.message += `${stdout}${stderr}`;
        throw error;
    }
}

export function spawnTool(script, args = [], options = {}) {
    const toolPath = path.join(repoRoot, "browser-tools", script);
    const env = { ...process.env, ...(options.env ?? {}) };
    return spawn(process.execPath, [toolPath, ...args], {
        cwd: repoRoot,
        env,
        stdio: ["ignore", "pipe", "pipe"],
    });
}

export async function startAutomation(options = {}) {
    const args = [];
    if (options.profile) args.push("--profile");
    if (options.reset) args.push("--reset");
    return runTool("start.js", args, { timeout: 90_000, env: options.env });
}

export async function stopAutomation() {
    return runTool("stop.js", [], { timeout: 45_000 });
}

export async function ensureStopped() {
    try {
        await stopAutomation();
    } catch {
        /* ignore */
    }
}

export async function connectToBrave() {
    return chromium.connectOverCDP(automationEndpoint);
}

export async function getLastPage() {
    const browser = await connectToBrave();
    const contexts = browser.contexts();
    const context = contexts[contexts.length - 1] ?? contexts[0];
    const pages = context?.pages() ?? [];
    const page = pages[pages.length - 1];
    if (!page) {
        await browser.close();
        throw new Error("No active Brave page to attach to.");
    }
    return { browser, context, page };
}

export async function waitForAutomationReady(page, timeout = 10_000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const ready = await page.evaluate(() => Boolean(window.__automationReady));
        if (ready) return true;
        await page.waitForTimeout(200);
    }
    return false;
}

export async function withFixtureServer(handler) {
    const server = http.createServer(handler);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;
    return {
        baseUrl,
        async close() {
            await new Promise((resolve) => server.close(resolve));
        },
    };
}

export async function serveStaticHtml(html) {
    return withFixtureServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
    });
}

export async function readFile(pathname) {
    return fs.readFile(path.join(repoRoot, pathname), "utf8");
}

export function waitForStreamData(stream, matcher, timeout = 10_000) {
    return new Promise((resolve, reject) => {
        let buffer = "";

        const onData = (chunk) => {
            buffer += chunk.toString();
            if (matcher(buffer)) {
                cleanup();
                resolve();
            }
        };

        const onTimeout = () => {
            cleanup();
            reject(new Error("Timed out waiting for stream output"));
        };

        const cleanup = () => {
            clearTimeout(timer);
            stream.off("data", onData);
        };

        const timer = setTimeout(onTimeout, timeout);
        stream.on("data", onData);
    });
}

export async function collectProcessOutput(child) {
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
    });

    const [code] = await once(child, "close");
    return { code, stdout, stderr };
}

export function parseKeyValueBlocks(output) {
    const entries = [];
    let current = {};
    const flush = () => {
        if (Object.keys(current).length) {
            entries.push(current);
            current = {};
        }
    };

    output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .forEach((line) => {
            if (!line) {
                flush();
                return;
            }
            const [key, ...rest] = line.split(":");
            if (!key || rest.length === 0) return;
            current[key] = rest.join(":").trim();
        });

    flush();
    return entries;
}

export async function withHeadlessAutomation(callback) {
    await startAutomation();
    try {
        return await callback();
    } finally {
        await stopAutomation();
    }
}
