(() => {
    const init = () => {
        if (window.__automationExtensionLoaded) {
            return;
        }
        window.__automationExtensionLoaded = true;

        const state = {
            banner: null,
            highlight: null,
        };

        const createBanner = () => {
            if (state.banner) return;
            const badge = document.createElement("div");
            badge.id = "automation-session-banner";
            badge.textContent = "Automation Session";
            badge.style.cssText = [
                "position:fixed",
                "top:0",
                "left:0",
                "width:100%",
                "background:#111827",
                "color:#fff",
                "font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
                "font-size:12px",
                "letter-spacing:0.15em",
                "padding:8px 16px",
                "text-align:center",
                "box-shadow:0 2px 6px rgba(0,0,0,0.35)",
                "z-index:2147483647",
                "pointer-events:none",
            ].join(";");
            (document.body || document.documentElement).appendChild(badge);
            state.banner = badge;
        };

        const ensureHighlight = () => {
            if (state.highlight) return state.highlight;
            const highlight = document.createElement("div");
            highlight.id = "automation-highlight-box";
            highlight.style.cssText = [
                "position:fixed",
                "border:2px solid #f97316",
                "background:rgba(249,115,22,0.15)",
                "pointer-events:none",
                "z-index:2147483646",
            ].join(";");
            highlight.hidden = true;
            (document.body || document.documentElement).appendChild(highlight);
            state.highlight = highlight;
            return highlight;
        };

        const hideHighlight = () => {
            if (state.highlight) {
                state.highlight.hidden = true;
            }
        };

        const serializeElement = (el) => {
            if (!el) return null;
            return {
                tag: el.tagName.toLowerCase(),
                id: el.id || null,
                class: el.className || null,
                text: (el.textContent || "").trim().slice(0, 500),
                html: (el.outerHTML || "").slice(0, 1000),
                selector: getUniqueSelector(el),
            };
        };

        const getUniqueSelector = (el) => {
            if (!el) return null;
            if (el.id) return `#${el.id}`;
            const parts = [];
            let current = el;
            while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
                let selector = current.tagName.toLowerCase();
                if (current.className) {
                    selector += "." + Array.from(current.classList).join(".");
                }
                if (current.parentElement) {
                    const siblings = Array.from(current.parentElement.children);
                    const index = siblings.indexOf(current) + 1;
                    selector += `:nth-child(${index})`;
                }
                parts.unshift(selector);
                current = current.parentElement;
            }
            return parts.join(" > ");
        };

        const highlightElement = (selector, color) => {
            const el = document.querySelector(selector);
            if (!el) {
                hideHighlight();
                return null;
            }
            const rect = el.getBoundingClientRect();
            const highlight = ensureHighlight();
            highlight.style.borderColor = color || "#f97316";
            highlight.style.backgroundColor = color ? `${color}33` : "rgba(249,115,22,0.15)";
            highlight.style.top = `${rect.top + window.scrollY}px`;
            highlight.style.left = `${rect.left + window.scrollX}px`;
            highlight.style.width = `${rect.width}px`;
            highlight.style.height = `${rect.height}px`;
            highlight.hidden = false;
            return serializeElement(el);
        };

        const collectText = (selector, limit = 10) => {
            const results = [];
            document.querySelectorAll(selector).forEach((el) => {
                if (results.length >= limit) return;
                results.push(serializeElement(el));
            });
            return results;
        };

        const listClickable = (limit = 20) => {
            const results = [];
            const nodes = document.querySelectorAll(
                "a, button, [role='button'], input[type='submit'], input[type='button']",
            );
            nodes.forEach((el) => {
                if (results.length >= limit) return;
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) return;
                results.push(serializeElement(el));
            });
            return results;
        };

        const startPicker = async (message) => {
            if (!message) {
                throw new Error("startPicker requires a message parameter");
            }
            return new Promise((resolve) => {
                const selections = [];
                const selectedElements = new Set();

                const overlay = document.createElement("div");
                overlay.style.cssText =
                    "position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;pointer-events:none";

                const highlight = document.createElement("div");
                highlight.style.cssText =
                    "position:absolute;border:2px solid #3b82f6;background:rgba(59,130,246,0.1);transition:all 0.1s";
                overlay.appendChild(highlight);

                const banner = document.createElement("div");
                banner.style.cssText =
                    "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1f2937;color:white;padding:12px 24px;border-radius:8px;font:14px sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3);pointer-events:auto;z-index:2147483647";

                const headline = document.createElement("div");
                headline.textContent = "Click the element you want the agent to use";
                headline.style.cssText =
                    "position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#111827;color:white;padding:10px 20px;border-radius:999px;font:14px sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3);pointer-events:none;z-index:2147483647";

                const updateBanner = () => {
                    banner.textContent = `${message} (${selections.length} selected, Cmd/Ctrl+click to add, Enter to finish, ESC to cancel)`;
                };
                updateBanner();

                document.body.append(banner, overlay, headline);

                const cleanup = (clearHighlights = true) => {
                    document.removeEventListener("mousemove", onMove, true);
                    document.removeEventListener("click", onClick, true);
                    document.removeEventListener("keydown", onKey, true);
                    overlay.remove();
                    banner.remove();
                    headline.remove();
                    if (clearHighlights) {
                        selectedElements.forEach((el) => {
                            el.style.outline = "";
                        });
                    }
                };

                const buildElementInfo = (el) => {
                    const parents = [];
                    let current = el.parentElement;
                    while (current && current !== document.body) {
                        const parentInfo = current.tagName.toLowerCase();
                        const id = current.id ? `#${current.id}` : "";
                        const cls = current.className
                            ? `.${current.className.trim().split(/\s+/).join(".")}`
                            : "";
                        parents.push(parentInfo + id + cls);
                        current = current.parentElement;
                    }
                    return {
                        tag: el.tagName.toLowerCase(),
                        id: el.id || null,
                        class: el.className || null,
                        text: el.textContent?.trim().slice(0, 200) || null,
                        html: el.outerHTML.slice(0, 500),
                        parents: parents.join(" > "),
                    };
                };

                const onMove = (e) => {
                    const el = document.elementFromPoint(e.clientX, e.clientY);
                    if (!el || overlay.contains(el) || banner.contains(el)) return;
                    const r = el.getBoundingClientRect();
                    highlight.style.cssText = `position:absolute;border:2px solid #3b82f6;background:rgba(59,130,246,0.1);top:${r.top}px;left:${r.left}px;width:${r.width}px;height:${r.height}px`;
                };

                const onClick = (e) => {
                    if (banner.contains(e.target)) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const el = document.elementFromPoint(e.clientX, e.clientY);
                    if (!el || overlay.contains(el) || banner.contains(el)) return;

                    if (e.metaKey || e.ctrlKey) {
                        if (!selectedElements.has(el)) {
                            selectedElements.add(el);
                            el.style.outline = "3px solid #10b981";
                            selections.push(buildElementInfo(el));
                            updateBanner();
                        }
                    } else {
                        cleanup(false);
                        const info = buildElementInfo(el);
                        resolve(selections.length > 0 ? selections : info);
                    }
                };

                const onKey = (e) => {
                    if (e.key === "Escape") {
                        e.preventDefault();
                        cleanup();
                        resolve(null);
                    } else if (e.key === "Enter" && selections.length > 0) {
                        e.preventDefault();
                        cleanup(false);
                        resolve(selections);
                    }
                };

                document.addEventListener("mousemove", onMove, true);
                document.addEventListener("click", onClick, true);
                document.addEventListener("keydown", onKey, true);
            });
        };

        createBanner();

        const automationAPI = {
            highlight: (selector, options = {}) => highlightElement(selector, options.color),
            hideHighlight,
            scrollIntoView: (selector, options = {}) => {
                const el = document.querySelector(selector);
                if (!el) return null;
                el.scrollIntoView({ behavior: options.behavior || "smooth", block: "center" });
                return serializeElement(el);
            },
            collectText,
            listClickable,
            hideBanner: () => {
                if (state.banner) state.banner.style.display = "none";
            },
            showBanner: () => {
                if (state.banner) state.banner.style.display = "";
            },
            startPicker,
        };

        window.automation = automationAPI;
        window.__automationReady = true;
        window.dispatchEvent(new CustomEvent("automation-ready"));
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
