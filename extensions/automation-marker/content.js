(() => {
    if (window.__automationBannerInjected) {
        return;
    }
    window.__automationBannerInjected = true;

    if (window.__automationHideBanner) {
        return;
    }

    const badge = document.createElement('div');
    badge.id = 'automation-session-banner';
    badge.textContent = 'Automation Session';
    badge.style.cssText = [
        'position:fixed',
        'top:10px',
        'right:10px',
        'background:#1d4ed8',
        'color:#fff',
        'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
        'font-size:11px',
        'letter-spacing:0.1em',
        'padding:6px 12px',
        'border-radius:999px',
        'box-shadow:0 2px 6px rgba(0,0,0,0.25)',
        'z-index:2147483647',
        'pointer-events:none'
    ].join(';');

    const container = document.body || document.documentElement;
    container.appendChild(badge);
})();
