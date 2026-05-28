import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { createInvoiceDocx } from "./invoiceDocument.js";
import { createInvoicePreviewHtml } from "./invoicePreview.js";
import { nextInvoiceNumber, parseInvoiceNumber } from "./invoiceNumbers.js";
import { importKdpScreenshot } from "./screenshotImport.js";

const BASE_INVOICE_SEQUENCE = 13;

export function createRouter(db) {
  const router = Router();
  router.get("/health", (req, res) => res.json({ ok: true }));

  router.get("/settings", (req, res) => {
    const settings = reconcileInvoiceCounter(db);
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

  router.get("/stats", (req, res) => {
    const rows = db.prepare(`
      select
        c.display_name,
        strftime('%Y-%m', p.sales_period_start) as month,
        sum(p.confirmed_eur_amount) as total_eur
      from payment_records p
      join marketplace_customers c on c.id = p.marketplace_customer_id
      where p.confirmed_eur_amount is not null
      group by c.display_name, month
      order by month asc, c.display_name asc
    `).all();

    const marketplaceTotals = new Map();
    const monthTotals = new Map();
    for (const row of rows) {
      marketplaceTotals.set(row.display_name, roundMoney((marketplaceTotals.get(row.display_name) ?? 0) + row.total_eur));
      monthTotals.set(row.month, roundMoney((monthTotals.get(row.month) ?? 0) + row.total_eur));
    }

    const byMarketplace = [...marketplaceTotals.entries()]
      .map(([marketplace, totalEur]) => ({ marketplace, totalEur }))
      .sort((a, b) => b.totalEur - a.totalEur || a.marketplace.localeCompare(b.marketplace));

    const months = [...monthTotals.entries()]
      .map(([month, totalEur]) => ({ month, totalEur }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const latest = months.at(-1) ?? null;
    const previous = months.at(-2) ?? null;
    const latestMonth = latest
      ? {
          ...latest,
          previousMonthEur: previous?.totalEur ?? 0,
          changeFromPreviousMonthPercent: percentageChange(previous?.totalEur ?? 0, latest.totalEur)
        }
      : null;

    res.json({
      byMarketplace,
      months,
      latestMonth,
      yearTotalEur: roundMoney(months.reduce((sum, row) => sum + row.totalEur, 0))
    });
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

  router.post("/screenshot-imports", async (req, res) => {
    const { dataUrl, fileName, textOverride = "" } = req.body;
    if (!dataUrl && !textOverride) {
      return res.status(400).json({ error: "Bitte Screenshot hochladen." });
    }

    try {
      const imageBuffer = dataUrl ? imageBufferFromDataUrl(dataUrl) : Buffer.from("");
      const result = await importKdpScreenshot({
        db,
        imageBuffer,
        uploadName: fileName,
        textOverride
      });
      if (result.imported.length === 0 && result.skipped.length === 0) {
        return res.status(422).json({ error: "Im Screenshot konnten keine KDP-Zahlungszeilen erkannt werden.", text: result.text });
      }
      return res.status(201).json(result);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
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
      where i.reviewed_at is not null
      order by i.invoice_number desc
    `).all();
    res.json(invoices);
  });

  router.get("/invoice-reviews", (req, res) => {
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
      where i.reviewed_at is null
      order by i.invoice_number asc
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

  router.get("/invoices/:invoiceId/preview", (req, res) => {
    const data = db.prepare(`
      select
        i.*,
        p.*,
        c.company_name,
        c.address_lines_json,
        c.tax_label,
        c.tax_id,
        c.service_description
      from invoices i
      join payment_records p on p.id = i.payment_record_id
      join marketplace_customers c on c.id = p.marketplace_customer_id
      where i.id = ?
    `).get(req.params.invoiceId);
    if (!data) {
      return res.status(404).send("Rechnung nicht gefunden.");
    }
    const html = createInvoicePreviewHtml({
      invoice: data,
      payment: data,
      customer: data
    });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  });

  router.delete("/invoices/:invoiceId", (req, res) => {
    const invoice = db.prepare("select * from invoices where id = ?").get(req.params.invoiceId);
    if (!invoice) {
      return res.status(404).json({ error: "Rechnung nicht gefunden." });
    }

    const settings = db.prepare("select * from settings where id = 1").get();
    const remainingInvoices = db.prepare("select invoice_number from invoices where id <> ?").all(invoice.id);
    const highestRemainingInvoiceNumber = highestInvoiceNumber(remainingInvoices.map((row) => row.invoice_number), settings);
    const lastInvoiceNumber = highestRemainingInvoiceNumber ?? baselineInvoiceNumber(settings);

    const deleteInvoice = db.transaction(() => {
      db.prepare("delete from invoices where id = ?").run(invoice.id);
      db.prepare("update payment_records set status = 'confirmed', updated_at = ? where id = ?")
        .run(new Date().toISOString(), invoice.payment_record_id);
      db.prepare("update settings set last_invoice_number = ? where id = 1").run(lastInvoiceNumber);
    });

    deleteInvoice();
    if (invoice.output_docx_path && fs.existsSync(invoice.output_docx_path)) {
      fs.unlinkSync(invoice.output_docx_path);
    }
    if (invoice.output_pdf_path && fs.existsSync(invoice.output_pdf_path)) {
      fs.unlinkSync(invoice.output_pdf_path);
    }

    return res.json({
      deletedInvoiceNumber: invoice.invoice_number,
      lastInvoiceNumber
    });
  });

  router.post("/invoices/:invoiceId/review", (req, res) => {
    const invoice = db.prepare("select * from invoices where id = ?").get(req.params.invoiceId);
    if (!invoice) {
      return res.status(404).json({ error: "Rechnung nicht gefunden." });
    }

    const reviewedAt = new Date().toISOString();
    db.prepare("update invoices set reviewed_at = ? where id = ?").run(reviewedAt, invoice.id);
    return res.json(db.prepare("select * from invoices where id = ?").get(invoice.id));
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
          reviewed_at,
          locked
        )
        values (?, ?, ?, ?, null, ?, null, 1)
      `).run(payment.id, invoiceNumber, invoiceDate, outputDocxPath, now);

      db.prepare("update payment_records set status = 'invoiced', updated_at = ? where id = ?").run(now, payment.id);
      db.prepare("update settings set last_invoice_number = ? where id = 1").run(invoiceNumber);
      return db.prepare("select * from invoices where id = ?").get(result.lastInsertRowid);
    });

    return res.status(201).json(saveInvoice());
  });

  return router;
}

export function reconcileInvoiceCounter(db) {
  const settings = db.prepare("select * from settings where id = 1").get();
  const invoiceNumbers = db.prepare("select invoice_number from invoices").all().map((row) => row.invoice_number);
  const lastInvoiceNumber = highestInvoiceNumber(invoiceNumbers, settings) ?? baselineInvoiceNumber(settings);
  if (lastInvoiceNumber !== settings.last_invoice_number) {
    db.prepare("update settings set last_invoice_number = ? where id = 1").run(lastInvoiceNumber);
    return { ...settings, last_invoice_number: lastInvoiceNumber };
  }
  return settings;
}

function imageBufferFromDataUrl(dataUrl) {
  const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error("Screenshot-Format konnte nicht gelesen werden.");
  }
  return Buffer.from(match[1], "base64");
}

function highestInvoiceNumber(invoiceNumbers, settings) {
  const candidates = invoiceNumbers
    .map((invoiceNumber) => {
      try {
        return parseInvoiceNumber(invoiceNumber);
      } catch {
        return null;
      }
    })
    .filter((invoiceNumber) =>
      invoiceNumber &&
      invoiceNumber.prefix === settings.invoice_prefix &&
      invoiceNumber.year === settings.invoice_year
    )
    .sort((a, b) => b.sequence - a.sequence);

  if (!candidates[0]) return null;
  return `${candidates[0].prefix}${candidates[0].year}${String(candidates[0].sequence).padStart(2, "0")}`;
}

function baselineInvoiceNumber(settings) {
  return `${settings.invoice_prefix}${settings.invoice_year}${String(BASE_INVOICE_SEQUENCE).padStart(2, "0")}`;
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function percentageChange(previousValue, currentValue) {
  if (!previousValue) return currentValue ? 100 : 0;
  return Math.round(((currentValue - previousValue) / previousValue) * 10000) / 100;
}
