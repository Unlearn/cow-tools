/**
 * @typedef {Object} SearchSnippetsResult
 * @property {string[]} snippets
 * @property {string} label
 * @property {number} contextWords
 */

/**
 * Build contextual snippets around regex matches in the given text.
 *
 * @param {string} textSource
 * @param {{ pattern: string, flags?: string, contextWords?: number }} options
 * @returns {SearchSnippetsResult}
 */
export function buildSearchSnippets(textSource, { pattern, flags = "", contextWords = 0 }) {
    if (!pattern) {
        return { snippets: [], label: "", contextWords };
    }

    const normalized = textSource.replace(/\s+/g, " ").trim();
    const displayFlags = flags;
    const regexFlags = flags.includes("g") ? flags : `${flags}g`;
    const effectiveFlags = regexFlags || "g";

    // Escape currency-like `$` characters so patterns such as "S$" or "¥" behave like
    // literal substring searches rather than end-of-line anchors. Agents rarely need
    // regex anchors, but they frequently search for price tokens.
    const escapedPattern = pattern.replace(/\$/g, "\\$");
    const regex = new RegExp(escapedPattern, effectiveFlags);

    const wordRegex = /\S+/g;
    /** @type {{ word: string, start: number, end: number }[]} */
    const wordBoundaries = [];
    let wordMatch;
    while ((wordMatch = wordRegex.exec(normalized)) !== null) {
        wordBoundaries.push({
            word: wordMatch[0],
            start: wordMatch.index,
            end: wordMatch.index + wordMatch[0].length,
        });
    }

    if (!wordBoundaries.length) {
        throw new Error("No readable text available for searching.");
    }

    /** @type {string[]} */
    const snippets = [];
    const globalRegex = regex;
    let match;
    while ((match = globalRegex.exec(normalized)) !== null) {
        const matchStart = match.index;
        const matchEnd = matchStart + match[0].length;

        const startWordIndex = wordBoundaries.findIndex(
            ({ start, end }) => matchStart >= start && matchStart < end,
        );
        const endWordIndex = wordBoundaries.findIndex(
            ({ start, end }) => matchEnd > start && matchEnd <= end,
        );

        const snippetStart = Math.max(0, (startWordIndex === -1 ? 0 : startWordIndex) - contextWords);
        const snippetEnd = Math.min(
            wordBoundaries.length - 1,
            (endWordIndex === -1 ? wordBoundaries.length - 1 : endWordIndex) + contextWords,
        );
        const snippet = wordBoundaries
            .slice(snippetStart, snippetEnd + 1)
            .map(({ word }) => word)
            .join(" ");
        snippets.push(snippet.trim());

        if (match[0].length === 0) {
            globalRegex.lastIndex += 1;
        }
    }

    const patternLabel = `/${escapedPattern}/${displayFlags}`;
    return { snippets, label: patternLabel, contextWords };
}
