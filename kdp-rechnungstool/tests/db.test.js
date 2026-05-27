import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase } from "../server/db.js";

test("creates settings and default Amazon customers", () => {
  const db = createDatabase(":memory:");
  const settings = db.prepare("select * from settings").get();
  assert.equal(settings.invoice_prefix, "RE");
  assert.equal(settings.invoice_year, 2026);
  assert.ok(settings.last_invoice_number);

  const customers = db.prepare("select marketplace from marketplace_customers order by marketplace").all();
  assert.deepEqual(customers.map((row) => row.marketplace), ["amazon.ca", "amazon.co.uk", "amazon.com", "amazon.de"]);
});
