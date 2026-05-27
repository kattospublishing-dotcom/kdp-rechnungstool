import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInvoiceDocx, formatEuro } from "../server/invoiceDocument.js";

test("formats euro amounts for German invoice display", () => {
  assert.equal(formatEuro(20.12), "20,12 EUR");
});

test("creates a non-empty docx file", async () => {
  const out = path.join(os.tmpdir(), `invoice-${Date.now()}.docx`);
  await createInvoiceDocx({
    outputPath: out,
    invoiceNumber: "RE202614",
    invoiceDate: "2026-05-29",
    customer: {
      company_name: "Amazon Digital Services LLC",
      address_lines_json: JSON.stringify(["410 Terry Avenue North", "Seattle, WA 98109", "United States"]),
      tax_label: "Tax ID",
      tax_id: "83-0417755",
      service_description: "KDP Buecher-Honorare amazon.com"
    },
    payment: {
      payment_number: "100001196439600",
      sales_period_start: "2026-03-01",
      sales_period_end: "2026-03-31",
      confirmed_eur_amount: 20.12
    }
  });
  assert.ok(fs.statSync(out).size > 1000);
});
