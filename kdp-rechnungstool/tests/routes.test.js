import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/index.js";
import { createDatabase } from "../server/db.js";

function createTestServer() {
  const db = createDatabase(":memory:");
  const exportDirectory = path.join(os.tmpdir(), `kdp-rechnungstool-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  db.prepare("update settings set export_directory = ? where id = 1").run(exportDirectory);
  const app = createApp(db);
  return { app, db };
}

test("GET /api/customers returns seeded marketplaces", async () => {
  const { app } = createTestServer();
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const response = await fetch(`${baseUrl}/api/customers`);
    const customers = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(customers.map((row) => row.marketplace).sort(), [
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
  } finally {
    server.close();
  }
});

test("POST /api/payments creates confirmed payment", async () => {
  const { app, db } = createTestServer();
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const customer = db.prepare("select * from marketplace_customers where marketplace = ?").get("amazon.com");

  try {
    const response = await fetch(`${baseUrl}/api/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketplaceCustomerId: customer.id,
        paymentNumber: "100001196439600",
        salesPeriodStart: "2026-03-01",
        salesPeriodEnd: "2026-03-31",
        paymentDate: "2026-05-29",
        originalCurrency: "USD",
        originalAmount: 22.42,
        exchangeRate: 0.8974,
        confirmedEurAmount: 20.12,
        status: "confirmed",
        notes: ""
      })
    });
    const payment = await response.json();
    assert.equal(response.status, 201);
    assert.equal(payment.status, "confirmed");
    assert.equal(payment.confirmed_eur_amount, 20.12);
  } finally {
    server.close();
  }
});

test("POST /api/payments rejects confirmed payment without EUR amount", async () => {
  const { app, db } = createTestServer();
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const customer = db.prepare("select * from marketplace_customers where marketplace = ?").get("amazon.com");

  try {
    const response = await fetch(`${baseUrl}/api/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketplaceCustomerId: customer.id,
        paymentNumber: "100001196439600",
        salesPeriodStart: "2026-03-01",
        salesPeriodEnd: "2026-03-31",
        paymentDate: "2026-05-29",
        originalCurrency: "USD",
        originalAmount: 22.42,
        status: "confirmed"
      })
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.error, "EUR-Betrag laut Kontoauszug fehlt.");
  } finally {
    server.close();
  }
});

test("POST /api/invoices/:paymentId/finalize rejects payments without confirmed EUR amount", async () => {
  const { app, db } = createTestServer();
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const customer = db.prepare("select * from marketplace_customers where marketplace = ?").get("amazon.com");

  try {
    const createResponse = await fetch(`${baseUrl}/api/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketplaceCustomerId: customer.id,
        paymentNumber: "100001196439600",
        salesPeriodStart: "2026-03-01",
        salesPeriodEnd: "2026-03-31",
        paymentDate: "2026-05-29",
        originalCurrency: "USD",
        originalAmount: 22.42,
        status: "draft"
      })
    });
    const payment = await createResponse.json();
    const finalizeResponse = await fetch(`${baseUrl}/api/invoices/${payment.id}/finalize`, { method: "POST" });
    const body = await finalizeResponse.json();
    assert.equal(finalizeResponse.status, 400);
    assert.equal(body.error, "Rechnung erst nach bestaetigtem EUR-Zahlungseingang moeglich.");
  } finally {
    server.close();
  }
});

test("POST /api/invoices/:paymentId/finalize creates invoice and advances number", async () => {
  const { app, db } = createTestServer();
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const customer = db.prepare("select * from marketplace_customers where marketplace = ?").get("amazon.com");

  try {
    const createResponse = await fetch(`${baseUrl}/api/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketplaceCustomerId: customer.id,
        paymentNumber: "100001196439600",
        salesPeriodStart: "2026-03-01",
        salesPeriodEnd: "2026-03-31",
        paymentDate: "2026-05-29",
        originalCurrency: "USD",
        originalAmount: 22.42,
        confirmedEurAmount: 20.12,
        status: "confirmed"
      })
    });
    const payment = await createResponse.json();

    const finalizeResponse = await fetch(`${baseUrl}/api/invoices/${payment.id}/finalize`, { method: "POST" });
    const invoice = await finalizeResponse.json();
    const settings = db.prepare("select * from settings where id = 1").get();
    const updatedPayment = db.prepare("select * from payment_records where id = ?").get(payment.id);
    const reviewQueueResponse = await fetch(`${baseUrl}/api/invoice-reviews`);
    const reviewQueue = await reviewQueueResponse.json();
    const historyResponse = await fetch(`${baseUrl}/api/invoices`);
    const history = await historyResponse.json();

    assert.equal(finalizeResponse.status, 201);
    assert.equal(invoice.invoice_number, "RE202614");
    assert.equal(invoice.reviewed_at, null);
    assert.equal(settings.last_invoice_number, "RE202614");
    assert.equal(updatedPayment.status, "invoiced");
    assert.deepEqual(reviewQueue.map((row) => row.invoice_number), ["RE202614"]);
    assert.deepEqual(history, []);
  } finally {
    server.close();
  }
});

test("GET /api/invoices/:invoiceId/docx downloads generated Word file", async () => {
  const { app, db } = createTestServer();
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const customer = db.prepare("select * from marketplace_customers where marketplace = ?").get("amazon.com");

  try {
    const createResponse = await fetch(`${baseUrl}/api/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketplaceCustomerId: customer.id,
        paymentNumber: "100001196439600",
        salesPeriodStart: "2026-03-01",
        salesPeriodEnd: "2026-03-31",
        paymentDate: "2026-05-29",
        originalCurrency: "USD",
        originalAmount: 22.42,
        confirmedEurAmount: 20.12,
        status: "confirmed"
      })
    });
    const payment = await createResponse.json();
    const finalizeResponse = await fetch(`${baseUrl}/api/invoices/${payment.id}/finalize`, { method: "POST" });
    const invoice = await finalizeResponse.json();

    const downloadResponse = await fetch(`${baseUrl}/api/invoices/${invoice.id}/docx`);
    const bytes = await downloadResponse.arrayBuffer();

    assert.equal(downloadResponse.status, 200);
    assert.equal(downloadResponse.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    assert.match(downloadResponse.headers.get("content-disposition"), /RE202614\.docx/);
    assert.ok(bytes.byteLength > 1000);
  } finally {
    server.close();
  }
});

test("GET /api/invoices/:invoiceId/preview returns an inline invoice preview", async () => {
  const { app, db } = createTestServer();
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const customer = db.prepare("select * from marketplace_customers where marketplace = ?").get("amazon.com");

  try {
    const createResponse = await fetch(`${baseUrl}/api/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketplaceCustomerId: customer.id,
        paymentNumber: "100001196439600",
        salesPeriodStart: "2026-03-01",
        salesPeriodEnd: "2026-03-31",
        paymentDate: "2026-05-29",
        originalCurrency: "USD",
        originalAmount: 22.42,
        confirmedEurAmount: 20.12,
        status: "confirmed"
      })
    });
    const payment = await createResponse.json();
    const finalizeResponse = await fetch(`${baseUrl}/api/invoices/${payment.id}/finalize`, { method: "POST" });
    const invoice = await finalizeResponse.json();

    const previewResponse = await fetch(`${baseUrl}/api/invoices/${invoice.id}/preview`);
    const html = await previewResponse.text();

    assert.equal(previewResponse.status, 200);
    assert.match(previewResponse.headers.get("content-type"), /text\/html/);
    assert.match(html, /Rechnungs-Nr\.: RE202614/);
    assert.match(html, /20,12 EUR/);
  } finally {
    server.close();
  }
});

test("DELETE /api/invoices/:invoiceId removes invoice, file, and rolls back counter", async () => {
  const { app, db } = createTestServer();
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const customer = db.prepare("select * from marketplace_customers where marketplace = ?").get("amazon.com");

  try {
    const createResponse = await fetch(`${baseUrl}/api/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketplaceCustomerId: customer.id,
        paymentNumber: "100001196439600",
        salesPeriodStart: "2026-03-01",
        salesPeriodEnd: "2026-03-31",
        paymentDate: "2026-05-29",
        originalCurrency: "USD",
        originalAmount: 22.42,
        confirmedEurAmount: 20.12,
        status: "confirmed"
      })
    });
    const payment = await createResponse.json();
    const finalizeResponse = await fetch(`${baseUrl}/api/invoices/${payment.id}/finalize`, { method: "POST" });
    const invoice = await finalizeResponse.json();
    const invoiceBeforeDelete = db.prepare("select * from invoices where id = ?").get(invoice.id);

    const deleteResponse = await fetch(`${baseUrl}/api/invoices/${invoice.id}`, { method: "DELETE" });
    const body = await deleteResponse.json();
    const settings = db.prepare("select * from settings where id = 1").get();
    const deletedInvoice = db.prepare("select * from invoices where id = ?").get(invoice.id);
    const updatedPayment = db.prepare("select * from payment_records where id = ?").get(payment.id);

    assert.equal(deleteResponse.status, 200);
    assert.equal(body.deletedInvoiceNumber, "RE202614");
    assert.equal(body.lastInvoiceNumber, "RE202613");
    assert.equal(settings.last_invoice_number, "RE202613");
    assert.equal(deletedInvoice, undefined);
    assert.equal(updatedPayment.status, "confirmed");
    assert.equal(fs.existsSync(invoiceBeforeDelete.output_docx_path), false);
  } finally {
    server.close();
  }
});

test("DELETE /api/invoices rolls counter back to baseline after several deletions", async () => {
  const { app, db } = createTestServer();
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const customer = db.prepare("select * from marketplace_customers where marketplace = ?").get("amazon.com");
  const invoices = [];

  try {
    for (const suffix of ["001", "002", "003"]) {
      const createResponse = await fetch(`${baseUrl}/api/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketplaceCustomerId: customer.id,
          paymentNumber: `100001196439${suffix}`,
          salesPeriodStart: "2026-03-01",
          salesPeriodEnd: "2026-03-31",
          paymentDate: "2026-05-29",
          originalCurrency: "USD",
          originalAmount: 22.42,
          confirmedEurAmount: 20.12,
          status: "confirmed"
        })
      });
      const payment = await createResponse.json();
      const finalizeResponse = await fetch(`${baseUrl}/api/invoices/${payment.id}/finalize`, { method: "POST" });
      invoices.push(await finalizeResponse.json());
    }

    for (const invoice of invoices) {
      await fetch(`${baseUrl}/api/invoices/${invoice.id}`, { method: "DELETE" });
    }

    const settings = db.prepare("select * from settings where id = 1").get();
    const remainingInvoices = db.prepare("select * from invoices").all();

    assert.deepEqual(invoices.map((invoice) => invoice.invoice_number), ["RE202614", "RE202615", "RE202616"]);
    assert.equal(settings.last_invoice_number, "RE202613");
    assert.deepEqual(remainingInvoices, []);
  } finally {
    server.close();
  }
});

test("GET /api/settings repairs stale invoice counter when no invoices remain", async () => {
  const { app, db } = createTestServer();
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    db.prepare("update settings set last_invoice_number = 'RE202615' where id = 1").run();

    const response = await fetch(`${baseUrl}/api/settings`);
    const settings = await response.json();
    const storedSettings = db.prepare("select * from settings where id = 1").get();

    assert.equal(response.status, 200);
    assert.equal(settings.last_invoice_number, "RE202613");
    assert.equal(storedSettings.last_invoice_number, "RE202613");
  } finally {
    server.close();
  }
});

test("POST /api/invoices/:invoiceId/review moves invoice into history", async () => {
  const { app, db } = createTestServer();
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const customer = db.prepare("select * from marketplace_customers where marketplace = ?").get("amazon.com");

  try {
    const createResponse = await fetch(`${baseUrl}/api/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketplaceCustomerId: customer.id,
        paymentNumber: "100001131175540",
        salesPeriodStart: "2026-02-01",
        salesPeriodEnd: "2026-02-28",
        paymentDate: "2026-04-29",
        originalCurrency: "USD",
        originalAmount: 5.36,
        exchangeRate: 0.8526,
        confirmedEurAmount: 4.57,
        status: "confirmed"
      })
    });
    const payment = await createResponse.json();
    const finalizeResponse = await fetch(`${baseUrl}/api/invoices/${payment.id}/finalize`, { method: "POST" });
    const invoice = await finalizeResponse.json();

    const reviewResponse = await fetch(`${baseUrl}/api/invoices/${invoice.id}/review`, { method: "POST" });
    const reviewedInvoice = await reviewResponse.json();
    const reviewQueue = await (await fetch(`${baseUrl}/api/invoice-reviews`)).json();
    const history = await (await fetch(`${baseUrl}/api/invoices`)).json();

    assert.equal(reviewResponse.status, 200);
    assert.ok(reviewedInvoice.reviewed_at);
    assert.deepEqual(reviewQueue, []);
    assert.deepEqual(history.map((row) => row.invoice_number), ["RE202614"]);
  } finally {
    server.close();
  }
});

test("GET /api/stats returns marketplace totals and month comparison", async () => {
  const { app, db } = createTestServer();
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const amazonCom = db.prepare("select * from marketplace_customers where marketplace = ?").get("amazon.com");
  const amazonDe = db.prepare("select * from marketplace_customers where marketplace = ?").get("amazon.de");

  try {
    const now = new Date().toISOString();
    const insert = db.prepare(`
      insert into payment_records (
        marketplace_customer_id,
        payment_number,
        sales_period_start,
        sales_period_end,
        payment_date,
        original_currency,
        original_amount,
        exchange_rate,
        confirmed_eur_amount,
        status,
        notes,
        created_at,
        updated_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', '', ?, ?)
    `);
    insert.run(amazonCom.id, "p-jan", "2026-01-01", "2026-01-31", "2026-03-29", "USD", 10, 0.9, 9, now, now);
    insert.run(amazonCom.id, "p-feb", "2026-02-01", "2026-02-28", "2026-04-29", "USD", 20, 0.9, 18, now, now);
    insert.run(amazonDe.id, "p-feb-de", "2026-02-01", "2026-02-28", "2026-04-29", "EUR", 3, null, 3, now, now);

    const response = await fetch(`${baseUrl}/api/stats`);
    const stats = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(stats.byMarketplace.map((row) => [row.marketplace, row.totalEur]), [
      ["Amazon.com", 27],
      ["Amazon.de", 3]
    ]);
    assert.deepEqual(stats.months.map((row) => [row.month, row.totalEur]), [
      ["2026-01", 9],
      ["2026-02", 21]
    ]);
    assert.equal(stats.latestMonth.month, "2026-02");
    assert.equal(stats.latestMonth.changeFromPreviousMonthPercent, 133.33);
  } finally {
    server.close();
  }
});

test("POST /api/screenshot-imports creates review invoices from OCR text", async () => {
  const { app } = createTestServer();
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const textOverride = `
100001131 175540 Amazon.com Bezahlt 2026-04-29 EFT USD 5.36 0.8526 EUR 4.57
01. Feb. 2026 - 28. Feb. 2026 Taschenbuchverkäufe USD 5.36 USD 0.00 USD 5.36
100000057 281031 Amazon.de Bezahlt 2026-04-29 EFT EUR 3.29 N/A EUR 3.29
01. Feb. 2026 - 28. Feb. 2026 Taschenbuchverkäufe EUR 3.29 EUR 0.00 EUR 3.29
100001132 509520 Amazon.ca Bezahlt 2026-04-29 EFT CAD 4.01 0.6234 EUR 2.50
01. Feb. 2026 - 28. Feb. 2026 Taschenbuchverkäufe CAD 4.01 CAD 0.00 CAD 4.01
`;

  try {
    const response = await fetch(`${baseUrl}/api/screenshot-imports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ textOverride, fileName: "kdp.png" })
    });
    const body = await response.json();
    const reviewQueue = await (await fetch(`${baseUrl}/api/invoice-reviews`)).json();

    assert.equal(response.status, 201);
    assert.deepEqual(body.imported.map((invoice) => invoice.invoice_number), ["RE202614", "RE202615", "RE202616"]);
    assert.deepEqual(reviewQueue.map((invoice) => invoice.invoice_number), ["RE202614", "RE202615", "RE202616"]);
  } finally {
    server.close();
  }
});
