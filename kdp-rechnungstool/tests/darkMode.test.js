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
