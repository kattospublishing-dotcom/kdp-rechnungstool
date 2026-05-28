import test from "node:test";
import assert from "node:assert/strict";
import { formatInvoiceNumber, parseInvoiceNumber, nextInvoiceNumber, previousInvoiceNumber } from "../server/invoiceNumbers.js";

test("formats sequence with RE prefix, year, and two digit minimum", () => {
  assert.equal(formatInvoiceNumber({ prefix: "RE", year: 2026, sequence: 6 }), "RE202606");
  assert.equal(formatInvoiceNumber({ prefix: "RE", year: 2026, sequence: 14 }), "RE202614");
});

test("parses existing invoice number", () => {
  assert.deepEqual(parseInvoiceNumber("RE202613"), { prefix: "RE", year: 2026, sequence: 13 });
});

test("computes next invoice number", () => {
  assert.equal(nextInvoiceNumber("RE202613"), "RE202614");
});

test("computes previous invoice number", () => {
  assert.equal(previousInvoiceNumber("RE202614"), "RE202613");
});
