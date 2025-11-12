import { defineConfig } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const braveExecutable =
    process.env.BRAVE_EXECUTABLE ?? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";

export default defineConfig({
    testDir: "./tests",
    timeout: 90_000,
    expect: {
        timeout: 10_000,
    },
    fullyParallel: false,
    workers: 1,
    retries: isCI ? 1 : 0,
    reporter: [["list"], ...(isCI ? [["github"]] : [])],
    projects: [
        {
            name: "brave",
            use: {
                browserName: "chromium",
                channel: undefined,
                headless: false,
                launchOptions: {
                    executablePath: braveExecutable,
                },
            },
        },
    ],
});
