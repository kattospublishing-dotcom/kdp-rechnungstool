import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { createInvoiceDocx } from "./invoiceDocument.js";
import { nextInvoiceNumber } from "./invoiceNumbers.js";

export function createRouter(db) {
  const router = Router();
  router.get("/health", (req, res) => res.json({ ok: true }));

  router.get("/settings", (req, res) => {
    const settings = db.prepare("select * from settings where id = 1").get();
    res.json(settings);
  });

  router.get("/customers", (req, res) => {
    const customers = db.prepare("select * from marketplace_customers where active = 1 order by display_name").all();
    res.json(customers);
  });

  router.get("/payments", (req, res) => {
    const payments = db.prepare(`
      select
        p.*,
        c.marketplace,
        c.display_name
      from payment_records p
      join marketplace_customers c on c.id = p.marketplace_customer_id
      order by p.created_at desc
    `).all();
    res.json(payments);
  });

  router.post("/payments", (req, res) => {
    const {
      marketplaceCustomerId,
      paymentNumber,
      salesPeriodStart,
      salesPeriodEnd,
      paymentDate,
      originalCurrency,
      originalAmount,
      exchangeRate = null,
      confirmedEurAmount = null,
      status = "draft",
      notes = ""
    } = req.body;

    if (status === "confirmed" && !confirmedEurAmount) {
      return res.status(400).json({ error: "EUR-Betrag laut Kontoauszug fehlt." });
    }

    const now = new Date().toISOString();
    const result = db.prepare(`
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
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      marketplaceCustomerId,
      paymentNumber,
      salesPeriodStart,
      salesPeriodEnd,
      paymentDate,
      originalCurrency,
      originalAmount,
      exchangeRate,
      confirmedEurAmount,
      status,
      notes,
      now,
      now
    );

    const payment = db.prepare("select * from payment_records where id = ?").get(result.lastInsertRowid);
    res.status(201).json(payment);
  });

  router.get("/invoices", (req, res) => {
    const invoices = db.prepare(`
      select
        i.*,
        p.payment_number,
        p.sales_period_start,
        p.sales_period_end,
        p.confirmed_eur_amount,
        c.marketplace,
        c.display_name
      from invoices i
      join payment_records p on p.id = i.payment_record_id
      join marketplace_customers c on c.id = p.marketplace_customer_id
      order by i.invoice_number desc
    `).all();
    res.json(invoices);
  });

  router.get("/invoices/:invoiceId/docx", (req, res) => {
    const invoice = db.prepare("select * from invoices where id = ?").get(req.params.invoiceId);
    if (!invoice) {
      return res.status(404).json({ error: "Rechnung nicht gefunden." });
    }
    if (!fs.existsSync(invoice.output_docx_path)) {
      return res.status(404).json({ error: "Word-Datei nicht gefunden." });
    }
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${invoice.invoice_number}.docx"`);
    return res.sendFile(invoice.output_docx_path);
  });

  router.post("/invoices/:paymentId/finalize", async (req, res) => {
    const payment = db.prepare("select * from payment_records where id = ?").get(req.params.paymentId);
    if (!payment) {
      return res.status(404).json({ error: "Zahlung nicht gefunden." });
    }
    if (!payment.confirmed_eur_amount) {
      return res.status(400).json({ error: "Rechnung erst nach bestaetigtem EUR-Zahlungseingang moeglich." });
    }
    const existingInvoice = db.prepare("select * from invoices where payment_record_id = ?").get(payment.id);
    if (existingInvoice) {
      return res.status(409).json({ error: "Fuer diese Zahlung wurde bereits eine Rechnung erzeugt." });
    }

    const customer = db.prepare("select * from marketplace_customers where id = ?").get(payment.marketplace_customer_id);
    const settings = db.prepare("select * from settings where id = 1").get();
    const invoiceNumber = nextInvoiceNumber(settings.last_invoice_number);
    const outputDirectory = path.resolve(settings.export_directory);
    const outputDocxPath = path.join(outputDirectory, `${invoiceNumber}.docx`);
    if (fs.existsSync(outputDocxPath)) {
      return res.status(409).json({ error: "Exportdatei existiert bereits." });
    }

    const invoiceDate = payment.payment_date;
    await createInvoiceDocx({
      outputPath: outputDocxPath,
      invoiceNumber,
      invoiceDate,
      customer,
      payment
    });

    const now = new Date().toISOString();
    const saveInvoice = db.transaction(() => {
      const result = db.prepare(`
        insert into invoices (
          payment_record_id,
          invoice_number,
          invoice_date,
          output_docx_path,
          output_pdf_path,
          created_at,
          locked
        )
        values (?, ?, ?, ?, null, ?, 1)
      `).run(payment.id, invoiceNumber, invoiceDate, outputDocxPath, now);

      db.prepare("update payment_records set status = 'invoiced', updated_at = ? where id = ?").run(now, payment.id);
      db.prepare("update settings set last_invoice_number = ? where id = 1").run(invoiceNumber);
      return db.prepare("select * from invoices where id = ?").get(result.lastInsertRowid);
    });

    return res.status(201).json(saveInvoice());
  });

  return router;
}
