import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const fallbackBrowserToolsRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const fallbackProjectRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const projectRoot = (() => {
    try {
        const output = execSync("git rev-parse --show-toplevel", {
            cwd: fallbackProjectRoot,
            stdio: ["ignore", "pipe", "ignore"],
        })
            .toString()
            .trim();
        if (output) {
            return resolve(output);
        }
    } catch {
        // ignore and fall back
    }
    return fallbackProjectRoot;
})();
let browserToolsRoot = resolve(projectRoot, "browser-tools");
if (!existsSync(browserToolsRoot)) {
    browserToolsRoot = fallbackBrowserToolsRoot;
}
const expectedNodeShim = resolve(projectRoot, ".bin/node");

export function ensureBrowserToolsWorkdir(scriptName = "browser-tools command") {
    const shimFromEnv = process.env.BROWSER_TOOLS_NODE_SHIM ? resolve(process.env.BROWSER_TOOLS_NODE_SHIM) : "";
    if (shimFromEnv !== expectedNodeShim) {
        console.error(
            [
                `✗ ${scriptName} must be executed via ${expectedNodeShim} (set by the Node shim).`,
                shimFromEnv
                    ? `  Detected BROWSER_TOOLS_NODE_SHIM="${shimFromEnv}", which does not match the repo root.`
                    : "  No BROWSER_TOOLS_NODE_SHIM detected; commands are running outside the shim.",
                "Ensure your shell PATH prefers the repo's .bin directory or invoke the shim explicitly, e.g.:",
                `  PATH="${projectRoot}/.bin:$PATH" node browser-tools/start.js`,
                `  ${expectedNodeShim} browser-tools/start.js`,
                "This guarantees the pinned Node version and curl guard are active.",
            ].join("\n"),
        );
        process.exit(1);
    }

    const cwd = resolve(process.cwd());
    if (process.env.BROWSER_TOOLS_ALLOW_ROOT === "1" || cwd === browserToolsRoot) {
        return;
    }

    console.error(
        [
            `✗ ${scriptName} must run from ${browserToolsRoot}, but detected ${cwd}.`,
            "Set your CLI shell workdir to this directory before invoking `node <script>.js` so relative paths resolve predictably.",
            "Example shell call:",
            `  {"command":["bash","-lc","node start.js"],"workdir":"${browserToolsRoot}"}`,
            "After updating the workdir, rerun the command.",
        ].join("\n"),
    );
    process.exit(1);
}
