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
        if (!window.automation || typeof window.automation[cmd] !== "function") {
            return null;
        }
        const args = Array.isArray(data) ? data : [data];
        return window.automation[cmd](...args);
    }, command, payload);
}

export async function dismissCookieBanners(page) {
    const selectors = [
        "#onetrust-accept-btn-handler",
        "button[aria-label='Accept all']",
        "button[aria-label='Accept All']",
        "button[data-testid='accept-btn']",
        "button[data-testid='accept-all']",
        "button[mode='primary'][data-testid='ConsentBanner-Accept']",
        "button[title='Accept']",
        "button:contains('Accept all')",
        "button:contains('I agree')",
        "button:contains('Allow all')",
        "div[role='dialog'] button:nth-child(1)",
    ];

    await page.evaluate((candidates) => {
        const find = (root) => {
            for (const selector of candidates) {
                const el = root.querySelector?.(selector);
                if (el) return el;
            }
            return null;
        };

        const clickElement = (el) => {
            el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        };

        const iframeSelector = "iframe";
        const topCandidate = find(document);
        if (topCandidate) {
            clickElement(topCandidate);
            return true;
        }

        for (const iframe of document.querySelectorAll(iframeSelector)) {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow?.document;
                if (!doc) continue;
                const candidate = find(doc);
                if (candidate) {
                    clickElement(candidate);
                    return true;
                }
            } catch {
                continue;
            }
        }
        return false;
    }, selectors);
}
