import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const browserToolsRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));

export function ensureBrowserToolsWorkdir(scriptName = "browser-tools command") {
    const cwd = resolve(process.cwd());
    if (cwd === browserToolsRoot) {
        return;
    }

    try {
        process.chdir(browserToolsRoot);
        if (!process.env.CI) {
            console.warn(
                [
                    `⚠ ${scriptName} expected to run from ${browserToolsRoot}, but detected ${cwd}.`,
                    "Automatically switched to the required directory; set the CLI workdir explicitly to silence this warning.",
                ].join(" "),
            );
        }
    } catch (err) {
        console.error(
            [
                `✗ ${scriptName} must run from ${browserToolsRoot} and the directory could not be set automatically.`,
                "Set the Codex CLI shell workdir to this directory before invoking `node tools/...`.",
                "Example shell call:",
                `  {"command":["bash","-lc","node tools/start.js"],"workdir":"${browserToolsRoot}"}`,
                `Details: ${err?.message ?? err}`,
            ].join("\n"),
        );
        process.exit(1);
    }
}
