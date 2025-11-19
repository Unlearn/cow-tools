import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Update the defaultCommand array below with the SSH invocation that should provide
 * the SOCKS proxy for automation runs. The default uses a placeholder host and
 * assumes key-based authentication so the command can run non-interactively.
 */
const defaultConfig = {
    command: [
        "ssh",
        "-N",
        "-o",
        "ExitOnForwardFailure=yes",
        "-o",
        "ServerAliveInterval=30",
        "-o",
        "ServerAliveCountMax=3",
        "-D",
        "127.0.0.1:1080",
        "proxy-exit",
    ],
    localHost: "127.0.0.1",
    localPort: 1080,
    readyTimeoutMs: 10000,
};

const getOverrideConfig = () => {
    const overridePath = process.env.BROWSER_TOOLS_SSH_PROXY_TEST_CONFIG;
    if (!overridePath) {
        return null;
    }
    try {
        const absolutePath = resolve(overridePath);
        const contents = readFileSync(absolutePath, "utf8");
        const parsed = JSON.parse(contents);
        if (!Array.isArray(parsed.command) || parsed.command.length === 0) {
            throw new Error("Override config is missing a command array");
        }
        if (typeof parsed.localHost !== "string" || typeof parsed.localPort !== "number") {
            throw new Error("Override config must include localHost/localPort");
        }
        return parsed;
    } catch (err) {
        const reason = err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
        throw new Error(`Failed to load SSH proxy override config: ${reason}`);
    }
};

export const getSshProxyConfig = () => getOverrideConfig() ?? defaultConfig;
