export async function waitForAutomation(page, timeout = 2000) {
    return page.evaluate((ms) => {
        if (window.__automationReady) {
            return true;
        }
        return new Promise((resolve) => {
            const timer = setTimeout(() => resolve(false), ms);
            window.addEventListener('automation-ready', () => {
                clearTimeout(timer);
                resolve(true);
            }, { once: true });
        });
    }, timeout);
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
