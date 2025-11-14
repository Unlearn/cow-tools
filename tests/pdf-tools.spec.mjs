import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import PDFDocument from "pdfkit";
import { spawnTool, collectProcessOutput, parseKeyValueBlocks } from "./helpers.mjs";

async function createMenuPdf() {
    const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "cow-tools-pdf-"));
    const pdfPath = path.join(tmpDir, "menu-simple.pdf");

    await new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", margin: 50 });
        const stream = fs.createWriteStream(pdfPath);
        stream.on("finish", resolve);
        stream.on("error", reject);

        doc.pipe(stream);
        doc.fontSize(20).text("Sample Menu", { align: "left" });
        doc.moveDown();
        doc.fontSize(14).text("BANOFFEE TART", { continued: false });
        doc.fontSize(12).text("lady finger banana + salted dulce de leche +");
        doc.text("banana ice-cream + pistachio");
        doc.moveDown();
        doc.fontSize(14).text("KUMARA AND COFFEE", { continued: false });
        doc.fontSize(12).text("brown butter cake + coffee cream + salted caramel +");
        doc.text("kumara ice-cream + hazelnuts");
        doc.end();
    });

    return pdfPath;
}

async function createComplexMenuPdf() {
    const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "cow-tools-pdf-"));
    const pdfPath = path.join(tmpDir, "menu-complex.pdf");

    await new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", margin: 50 });
        const stream = fs.createWriteStream(pdfPath);
        stream.on("finish", resolve);
        stream.on("error", reject);

        doc.pipe(stream);

        doc.fontSize(22).text("WINTER DESSERTS 2025", { align: "left" });
        doc.moveDown();

        doc.fontSize(14).text("Signature dessert: Banoffee Tart with pistachio crumb.");
        doc.moveDown();

        doc.fontSize(14).text(
            "Chef's favourite dessert: Kumara and Coffee – brown butter cake, coffee cream, salted caramel.",
        );
        doc.moveDown();

        doc.fontSize(14).text(
            "Late-night dessert special: Chocolate Bonbons & Coal-Roasted Pear, served warm with vanilla ice-cream.",
        );
        doc.moveDown();

        doc.fontSize(12).text("Ask about our dairy-free dessert of the day.");
        doc.moveDown();

        doc.fontSize(12).text("Snacks: olives, bread, and cheese available after 9pm.");

        doc.end();
    });

    return pdfPath;
}

test.describe("pdf2md.js", () => {
    test("converts a simple menu PDF to markdown and emits citation", async () => {
        const pdfPath = await createMenuPdf();
        const child = spawnTool("pdf2md.js", [pdfPath]);
        const { code, stdout, stderr } = await collectProcessOutput(child);

        // Tool should succeed for a well-formed local PDF.
        expect(code).toBe(0);
        expect(stdout).toContain("BANOFFEE TART");
        expect(stdout).toContain("KUMARA AND COFFEE");

        // Citation should be emitted to stderr in a key:value block format.
        const entries = parseKeyValueBlocks(stderr);
        expect(entries.length).toBeGreaterThanOrEqual(1);
        expect(entries[0].source).toBe(pdfPath);
        expect(entries[0].contentType).toBe("application/pdf");
    });

    test("supports search flags on generated markdown", async () => {
        const pdfPath = await createMenuPdf();
        const child = spawnTool("pdf2md.js", [
            pdfPath,
            "--search",
            "BANOFFEE",
            "--context",
            "0",
        ]);
        const { code, stdout } = await collectProcessOutput(child);

        expect(code).toBe(0);
        expect(stdout).toContain("BANOFFEE TART");
        expect(stdout).toContain("Matches (pattern: /BANOFFEE/, context words: 0):");
        expect(stdout).toContain("- `BANOFFEE`");
    });
    test("emits a no-match block when pattern is absent", async () => {
        const pdfPath = await createMenuPdf();
        const child = spawnTool("pdf2md.js", [
            pdfPath,
            "--search",
            "TIRAMISU",
            "--context",
            "1",
        ]);
        const { code, stdout } = await collectProcessOutput(child);

        expect(code).toBe(0);
        expect(stdout).toContain("Matches (pattern: /TIRAMISU/, context words: 1):");
        expect(stdout).toContain("- _No matches found_");
    });
    test("handles complex regex patterns with context and flags", async () => {
        const pdfPath = await createComplexMenuPdf();
        const child = spawnTool("pdf2md.js", [
            pdfPath,
            "--search",
            "dessert|Bonbons",
            "--context",
            "3",
            "--search-flags",
            "i",
        ]);
        const { code, stdout } = await collectProcessOutput(child);

        expect(code).toBe(0);
        // Ensure headings and multiple dessert lines survive PDF → Markdown.
        expect(stdout).toContain("WINTER DESSERTS 2025");
        expect(stdout).toContain("Banoffee Tart");
        expect(stdout).toContain("Chocolate Bonbons");

        // Match header should mirror fetch-readable.js style.
        expect(stdout).toContain("Matches (pattern: /dessert|Bonbons/i, context words: 3):");
        // At least one snippet should include each alternation arm in the pattern.
        expect(stdout).toMatch(/`.*dessert.*`/i);
        expect(stdout).toMatch(/`.*Bonbons.*`/);
    });
});
