#!/usr/bin/env node

import net from "node:net";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const getArg = (flag, fallback = null) => {
    const index = args.indexOf(flag);
    if (index === -1) return fallback;
    return args[index + 1] ?? fallback;
};

const host = getArg("--host", "127.0.0.1");
const port = Number(getArg("--port"));
const logPath = getArg("--log");
const failStartup = args.includes("--fail-startup");

if (!port || Number.isNaN(port)) {
    console.error("fake-ssh-proxy requires --port");
    process.exit(2);
}

if (!logPath) {
    console.error("fake-ssh-proxy requires --log");
    process.exit(2);
}

const resolvedLogPath = resolve(logPath);
mkdirSync(dirname(resolvedLogPath), { recursive: true });

const log = (event, extra) => {
    const entry = JSON.stringify({ timestamp: Date.now(), event, ...(extra ?? {}) });
    appendFileSync(resolvedLogPath, entry + "\n", "utf8");
};

if (failStartup) {
    log("fail-startup");
    process.exit(1);
}

const server = net.createServer((socket) => {
    socket.once("data", () => {
        /* discard */
    });
    socket.on("error", () => {
        /* ignore */
    });
    socket.end();
});

server.once("error", (err) => {
    log("listen-error", { message: err?.message ?? String(err) });
    process.exit(1);
});

server.listen(port, host, () => {
    const address = server.address();
    log("listening", { host: address.address, port: address.port });
});

const shutdown = (signal) => {
    log("signal", { signal });
    server.close(() => {
        log("closed");
        process.exit(0);
    });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
