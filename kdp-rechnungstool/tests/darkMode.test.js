import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("app exposes a persistent dark-mode toggle", () => {
  const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(appSource, /localStorage\.getItem\("kdp-theme"\)/);
  assert.match(appSource, /document\.documentElement\.dataset\.theme/);
  assert.match(appSource, /aria-label=\{theme === "dark" \? "Light Mode aktivieren" : "Dark Mode aktivieren"\}/);
  assert.match(appSource, /ThemeIcon/);
});

test("stylesheet defines dark-mode theme tokens", () => {
  const cssSource = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(cssSource, /\[data-theme="dark"\]/);
  assert.match(cssSource, /--color-bg/);
  assert.match(cssSource, /--color-panel/);
});

test("invoice history links to Word download instead of showing local path", () => {
  const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(appSource, /href=\{`\/api\/invoices\/\$\{invoice\.id\}\/docx`\}/);
  assert.match(appSource, /Vorschau/);
  assert.match(appSource, /Word/);
  assert.doesNotMatch(appSource, /output_docx_path/);
});

test("payment grid keeps labels and action buttons on one line", () => {
  const cssSource = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(cssSource, /@media \(max-width: 1180px\)[\s\S]*\.dashboard-grid[\s\S]*grid-template-columns: 1fr/);
  assert.match(cssSource, /white-space: nowrap/);
  assert.match(cssSource, /\.payments-table[\s\S]*min-width: 920px/);
  assert.match(cssSource, /\.payments-table th,[\s\S]*\.payments-table td[\s\S]*overflow-wrap: normal/);
});

test("invoice tables fit without horizontal scrolling controls", () => {
  const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const cssSource = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(appSource, /className="history-table"/);
  assert.match(appSource, /className="review-table"/);
  assert.match(appSource, /apiDelete\(`\/invoices\/\$\{invoice\.id\}`\)/);
  assert.match(cssSource, /\.table-wrap[\s\S]*overflow-x: hidden/);
  assert.match(cssSource, /table[\s\S]*table-layout: fixed/);
  assert.doesNotMatch(cssSource, /min-width: 700px/);
});

test("invoice action buttons stay side by side with animated styling", () => {
  const cssSource = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(cssSource, /\.invoice-actions[\s\S]*width: max-content/);
  assert.match(cssSource, /\.invoice-actions[\s\S]*grid-template-columns: repeat\(3, max-content\)/);
  assert.match(cssSource, /\.invoice-actions \.danger-button[\s\S]*min-width: 96px/);
  assert.match(cssSource, /\.file-link:hover[\s\S]*transform: translateY\(-1px\)/);
  assert.match(cssSource, /\.danger-button:hover[\s\S]*transform: translateY\(-1px\)/);
  assert.match(cssSource, /linear-gradient/);
});

test("app exposes organized dashboard and invoice preview pane", () => {
  const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const cssSource = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(appSource, /className="dashboard-grid"/);
  assert.match(appSource, /className="invoice-preview"/);
  assert.match(appSource, /\/api\/invoices\/\$\{previewInvoice\.id\}\/preview/);
  assert.match(cssSource, /\.preview-panel/);
  assert.match(cssSource, /\.invoice-preview/);
});

test("invoice preview fits the full page and exposes icon zoom controls", () => {
  const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const cssSource = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(appSource, /const PREVIEW_PAGE_WIDTH = 794/);
  assert.match(appSource, /const \[previewZoom, setPreviewZoom\]/);
  assert.match(appSource, /aria-label="Vorschau verkleinern"/);
  assert.match(appSource, /aria-label="Vorschau vergroessern"/);
  assert.match(appSource, /scrolling="no"/);
  assert.match(cssSource, /\.preview-stage[\s\S]*overflow: auto/);
  assert.match(cssSource, /\.preview-paper[\s\S]*transform: scale\(var\(--preview-scale\)\)/);
  assert.match(cssSource, /\.zoom-button/);
});

test("app exposes invoice review queue with confetti approval", () => {
  const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const cssSource = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(appSource, /apiGet\("\/invoice-reviews"\)/);
  assert.match(appSource, /apiPost\(`\/invoices\/\$\{invoice\.id\}\/review`/);
  assert.match(appSource, /<Confetti key=\{confettiBurst\} \/>/);
  assert.match(cssSource, /\.confetti-layer/);
  assert.match(cssSource, /@keyframes confetti-fall/);
});

test("app exposes screenshot upload import", () => {
  const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const cssSource = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(appSource, /Automatisch importieren/);
  assert.match(appSource, /apiPost\("\/screenshot-imports"/);
  assert.match(appSource, /type="file"/);
  assert.match(cssSource, /\.upload-box/);
});

test("app exposes analytics cards and country revenue chart", () => {
  const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const cssSource = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(appSource, /apiGet\("\/stats"\)/);
  assert.match(appSource, /Einnahmen nach Laendern/);
  assert.match(appSource, /Umsatz zum Vormonat/);
  assert.match(cssSource, /\.analytics-grid/);
  assert.match(cssSource, /\.country-bar/);
});

test("preview pane can be docked outside the main workflow", () => {
  const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const cssSource = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(appSource, /className="workspace-grid"/);
  assert.match(appSource, /className="main-flow"/);
  assert.match(cssSource, /--dashboard-width: 1760px/);
  assert.match(cssSource, /\.workspace-grid[\s\S]*width: min\(var\(--dashboard-width\), calc\(100% - 32px\)\)/);
  assert.match(cssSource, /\.workspace-grid[\s\S]*grid-template-columns: minmax\(1000px, 1fr\) minmax\(740px, 0\.74fr\)/);
  assert.match(cssSource, /\.workspace-grid[\s\S]*align-items: stretch/);
  assert.match(cssSource, /\.preview-panel[\s\S]*position: static/);
  assert.match(cssSource, /\.preview-panel[\s\S]*display: flex/);
  assert.match(cssSource, /\.preview-panel[\s\S]*height: 100%/);
  assert.doesNotMatch(cssSource, /\.preview-panel \{[\s\S]*position: sticky/);
  assert.match(cssSource, /\.preview-stage[\s\S]*flex: 1/);
  assert.match(cssSource, /\.preview-stage[\s\S]*height: auto/);
  assert.match(cssSource, /\.preview-stage[\s\S]*min-height: clamp\(820px, 70vh, 1040px\)/);
  assert.match(cssSource, /\.payments-table th:nth-child\(5\)[\s\S]*width: 28%/);
  assert.match(cssSource, /\.review-table th:nth-child\(6\)[\s\S]*width: 20%/);
});
