import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("app exposes a persistent dark-mode toggle", () => {
  const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(appSource, /localStorage\.getItem\("kdp-theme"\)/);
  assert.match(appSource, /document\.documentElement\.dataset\.theme/);
  assert.match(appSource, /Dark Mode|Light Mode/);
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
  assert.match(appSource, /Anzeigen/);
  assert.doesNotMatch(appSource, /output_docx_path/);
});

test("payment grid stacks before the table clips action buttons", () => {
  const cssSource = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(cssSource, /@media \(max-width: 1180px\)[\s\S]*\.work-grid[\s\S]*grid-template-columns: 1fr/);
  assert.match(cssSource, /white-space: nowrap/);
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
  assert.match(cssSource, /\.invoice-actions[\s\S]*grid-template-columns: repeat\(2, minmax\(74px, 1fr\)\)/);
  assert.match(cssSource, /\.file-link:hover[\s\S]*transform: translateY\(-1px\)/);
  assert.match(cssSource, /\.danger-button:hover[\s\S]*transform: translateY\(-1px\)/);
  assert.match(cssSource, /linear-gradient/);
});

test("app exposes invoice review queue with confetti approval", () => {
  const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const cssSource = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(appSource, /apiGet\("\/invoice-reviews"\)/);
  assert.match(appSource, /apiPost\(`\/invoices\/\$\{invoice\.id\}\/review`/);
  assert.match(appSource, /<Confetti \/>/);
  assert.match(cssSource, /\.confetti-layer/);
  assert.match(cssSource, /@keyframes confetti-fall/);
});

test("app exposes screenshot upload import", () => {
  const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const cssSource = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(appSource, /Screenshot importieren/);
  assert.match(appSource, /apiPost\("\/screenshot-imports"/);
  assert.match(appSource, /type="file"/);
  assert.match(cssSource, /\.upload-box/);
});
