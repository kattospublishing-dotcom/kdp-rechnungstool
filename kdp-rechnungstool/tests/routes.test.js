import test from "node:test";
import assert from "node:assert/strict";
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

    assert.equal(finalizeResponse.status, 201);
    assert.equal(invoice.invoice_number, "RE202614");
    assert.equal(settings.last_invoice_number, "RE202614");
    assert.equal(updatedPayment.status, "invoiced");
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
