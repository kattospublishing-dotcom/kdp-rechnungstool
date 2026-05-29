import test from "node:test";
import assert from "node:assert/strict";
import { parseKdpScreenshotText } from "../server/screenshotImport.js";

const sampleText = `
100001131 175540 Amazon.com Bezahlt 2026-04-29 EFT USD 5.36 0.8526 EUR 4.57
Verkaufszeitraum Source Aufgelaufene Tantiemen Steuereinbehaltung Nettoeinnahmen
01. Feb. 2026 - 28. Feb. 2026 Taschenbuchverkäufe USD 5.36 USD 0.00 USD 5.36
100000057 281031 Amazon.de Bezahlt 2026-04-29 EFT EUR 3.29 N/A EUR 3.29
01. Feb. 2026 - 28. Feb. 2026 Taschenbuchverkäufe EUR 3.29 EUR 0.00 EUR 3.29
100001132 509520 Amazon.ca Bezahlt 2026-04-29 EFT CAD 4.01 0.6234 EUR 2.50
01. Feb. 2026 - 28. Feb. 2026 Taschenbuchverkäufe CAD 4.01 CAD 0.00 CAD 4.01
`;

test("parses KDP screenshot OCR text into payment rows", () => {
  const rows = parseKdpScreenshotText(sampleText);
  assert.deepEqual(rows.map((row) => row.marketplace), ["amazon.com", "amazon.de", "amazon.ca"]);
  assert.deepEqual(rows.map((row) => row.paymentNumber), ["100001131175540", "100000057281031", "100001132509520"]);
  assert.equal(rows[0].confirmedEurAmount, 4.57);
  assert.equal(rows[1].originalCurrency, "EUR");
  assert.equal(rows[2].exchangeRate, 0.6234);
  assert.equal(rows[0].salesPeriodStart, "2026-02-01");
  assert.equal(rows[0].salesPeriodEnd, "2026-02-28");
});

test("parses wrapped German March sales period from OCR text", () => {
  const rows = parseKdpScreenshotText(`
100000057 824841 Amazon.de Bezahlt 2026-05-29 EFT EUR 9.15 N/A EUR 9.15
Verkaufszeitraum Source Aufgelaufene Tantiemen Steuereinbehaltung Nettoeinnahmen
01. M\u00e4rz 2026 - 31.
M\u00e4rz 2026 Taschenbuchverk\u00e4ufe EUR 9.15 EUR 0.00 EUR 9.15
100001198 573660 Amazon.ca Bezahlt 2026-05-29 EFT CAD 140.91 0.6206 EUR 87.45
01. M\u00e4rz 2026 - 31.
M\u00e4rz 2026 Taschenbuchverk\u00e4ufe CAD 140.91 CAD 0.00 CAD 140.91
`);

  assert.deepEqual(rows.map((row) => row.marketplace), ["amazon.de", "amazon.ca"]);
  assert.equal(rows[0].salesPeriodStart, "2026-03-01");
  assert.equal(rows[0].salesPeriodEnd, "2026-03-31");
  assert.equal(rows[1].confirmedEurAmount, 87.45);
});
