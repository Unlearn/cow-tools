#!/usr/bin/env node

import { spawn, execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const useProfile = process.argv[2] === "--profile";
const homeDir = process.env["HOME"];

if (process.argv[2] && process.argv[2] !== "--profile") {
	console.log("Usage: start.js [--profile]");
	console.log("\nOptions:");
	console.log("  --profile  Copy your default Brave profile (cookies, logins)");
	console.log("\nExamples:");
	console.log("  start.js            # Start with fresh profile");
	console.log("  start.js --profile  # Start with your Brave profile");
	process.exit(1);
}

if (!homeDir) {
	console.error("✗ HOME is not set; cannot locate Brave profile");
	process.exit(1);
}

// Kill existing Brave
try {
    execSync("killall 'Brave Browser'", { stdio: "ignore" });
} catch {}

// Wait a bit for processes to fully die
await new Promise((r) => setTimeout(r, 1000));

// Setup profile directory
const cacheDir = join(homeDir, ".cache", "scraping");
mkdirSync(cacheDir, { recursive: true });

if (useProfile) {
	const profileSource = join(
		homeDir,
		"Library",
		"Application Support",
		"BraveSoftware",
		"Brave-Browser",
	);

	if (existsSync(profileSource)) {
		// Sync profile with rsync (much faster on subsequent runs)
		execSync(`rsync -a --delete "${profileSource}/" "${cacheDir}/"`, { stdio: "pipe" });
	} else {
		console.warn(
			`Warning: Brave profile folder not found at ${profileSource}. Continuing with a clean profile instead.`,
		);
	}
}

// Start Brave in background (detached so Node can exit)
spawn(
	"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
	["--remote-debugging-port=9222", `--user-data-dir=${cacheDir}`],
	{ detached: true, stdio: "ignore" },
).unref();

// Wait for Brave to be ready by attempting to connect
let connected = false;
for (let i = 0; i < 30; i++) {
    try {
        const browser = await puppeteer.connect({
            browserURL: "http://localhost:9222",
            defaultViewport: null,
        });
        await browser.disconnect();
        connected = true;
        break;
    } catch {
        await new Promise((r) => setTimeout(r, 500));
    }
}

if (!connected) {
    console.error("✗ Failed to connect to Brave");
    process.exit(1);
}

console.log(`✓ Brave started on :9222${useProfile ? " with your profile" : ""}`);
