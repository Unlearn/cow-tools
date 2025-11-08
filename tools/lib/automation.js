import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const automationScriptPath = fileURLToPath(
    new URL("../../extensions/automation-helper/content.js", import.meta.url),
);
let cachedAutomationSource = null;

async function loadAutomationSource() {
    if (cachedAutomationSource) {
        return cachedAutomationSource;
    }
    cachedAutomationSource = await readFile(automationScriptPath, "utf8");
    return cachedAutomationSource;
}

async function checkAutomation(page, timeout = 2000) {
    return page.evaluate((ms) => {
        if (window.__automationReady) {
            return true;
        }
        return new Promise((resolve) => {
            const timer = setTimeout(() => resolve(false), ms);
            window.addEventListener(
                "automation-ready",
                () => {
                    clearTimeout(timer);
                    resolve(true);
                },
                { once: true },
            );
        });
    }, timeout);
}

export async function waitForAutomation(page, timeout = 2000) {
    let ready = await checkAutomation(page, timeout);
    if (ready) {
        return true;
    }

    const source = await loadAutomationSource().catch(() => null);
    if (source) {
        await page.addScriptTag({ content: source }).catch(() => {});
        ready = await checkAutomation(page, timeout);
    }

    return ready;
}

export async function automationCall(page, command, payload = []) {
    const ready = await waitForAutomation(page);
    if (!ready) {
        return null;
    }
    return page.evaluate((cmd, data) => {
        if (!window.automation || typeof window.automation[cmd] !== 'function') {
            return null;
        }
        const args = Array.isArray(data) ? data : [data];
        return window.automation[cmd](...args);
    }, command, payload);
}
