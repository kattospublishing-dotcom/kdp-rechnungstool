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
  assert.deepEqual(customers.map((row) => row.marketplace), [
    "amazon.ca",
    "amazon.co.uk",
    "amazon.com",
    "amazon.com.au",
    "amazon.com.br",
    "amazon.com.mx",
    "amazon.de",
    "amazon.es",
    "amazon.fr",
    "amazon.it",
    "amazon.nl"
  ]);

  const uk = db.prepare("select company_name, tax_id from marketplace_customers where marketplace = ?").get("amazon.co.uk");
  assert.equal(uk.company_name, "Amazon Media EU S.àr.l. (Société à responsabilité limitée)");
  assert.equal(uk.tax_id, "LU 20944528");
});
