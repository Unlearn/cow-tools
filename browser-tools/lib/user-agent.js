export function getUserAgent() {
    if (process.env.BROWSER_TOOLS_USER_AGENT && process.env.BROWSER_TOOLS_USER_AGENT.trim()) {
        return process.env.BROWSER_TOOLS_USER_AGENT.trim();
    }
    return "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
}

export function getBrowserLikeHeaders(extra = {}) {
    const base = {
        "User-Agent": getUserAgent(),
        "Accept-Language": "en-US,en;q=0.9",
    };
    return { ...base, ...extra };
}
