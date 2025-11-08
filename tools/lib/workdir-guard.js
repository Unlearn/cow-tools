import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const browserToolsRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));

export function ensureBrowserToolsWorkdir(scriptName = "browser-tools command") {
    const cwd = resolve(process.cwd());
    if (cwd !== browserToolsRoot) {
        console.error(
            [
                `✗ ${scriptName} must run from ${browserToolsRoot}.`,
                "Set the Codex CLI shell workdir to this directory before invoking `node tools/...`.",
                "Example shell call:",
                `  {"command":["bash","-lc","node tools/start.js"],"workdir":"${browserToolsRoot}"}`,
            ].join("\n"),
        );
        process.exit(1);
    }
}
