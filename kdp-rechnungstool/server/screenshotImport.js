import fs from "node:fs";
import path from "node:path";
import Tesseract from "tesseract.js";
import { createInvoiceDocx } from "./invoiceDocument.js";
import { nextInvoiceNumber } from "./invoiceNumbers.js";

const MARKETPLACE_PATTERN = /Amazon\.(?:com\.au|com\.br|com\.mx|co\.uk|com|de|ca|fr|es|nl|it)/gi;

export async function readScreenshotText({ imageBuffer, textOverride }) {
  if (textOverride?.trim()) return textOverride.trim();
  const result = await Tesseract.recognize(imageBuffer, "eng");
  return result.data.text.trim();
}

export function parseKdpScreenshotText(text) {
  const normalized = text.replace(/\r/g, "\n").replace(/[ \t]+/g, " ");
  const period = parseSalesPeriod(normalized);
  const rows = [];
  const matches = [...normalized.matchAll(MARKETPLACE_PATTERN)];

  for (const match of matches) {
    const marketplace = match[0].toLowerCase();
    const start = Math.max(0, match.index - 42);
    const end = Math.min(normalized.length, match.index + 190);
    const windowText = normalized.slice(start, end);
    const rowText = normalized.slice(match.index, end);
    const beforeMarketplace = normalized.slice(start, match.index);
    const paymentDate = firstMatch(rowText, /\b(20\d{2}-\d{2}-\d{2})\b/);
    const paymentNumber = parsePaymentNumber({ beforeMarketplace, rowText, paymentDate });
    const eurAmount = firstNumberAfter(rowText, /\bEUR\s+([0-9]+(?:[.,][0-9]{2})?)\b/g, { last: true });
    const original = parseOriginalAmount(rowText);
    const exchangeRateText = firstMatch(rowText, /\b([0-9]+\.[0-9]{4})\b/);

    if (!paymentNumber || !paymentDate || !eurAmount || !original) continue;
    rows.push({
      marketplace,
      paymentNumber,
      salesPeriodStart: period.start,
      salesPeriodEnd: period.end,
      paymentDate,
      originalCurrency: original.currency,
      originalAmount: original.amount,
      exchangeRate: exchangeRateText ? Number(exchangeRateText) : null,
      confirmedEurAmount: eurAmount,
      notes: "Import aus KDP-Screenshot"
    });
  }

  return dedupeRows(rows);
}

export async function importKdpScreenshot({ db, imageBuffer, textOverride, uploadName }) {
  const text = await readScreenshotText({ imageBuffer, textOverride });
  const parsedRows = parseKdpScreenshotText(text);
  if (parsedRows.length === 0) {
    return { imported: [], skipped: [], text };
  }

  const uploadPath = saveUpload({ db, imageBuffer, uploadName });
  const imported = [];
  const skipped = [];

  for (const row of parsedRows) {
    const result = await createPaymentAndInvoiceFromRow(db, {
      ...row,
      notes: `${row.notes}: ${path.basename(uploadPath)}`
    });
    if (result.skipped) skipped.push(result.skipped);
    if (result.invoice) imported.push(result.invoice);
  }

  return { imported, skipped, parsedRows, text, uploadPath };
}

async function createPaymentAndInvoiceFromRow(db, row) {
  const customer = db.prepare("select * from marketplace_customers where marketplace = ?").get(row.marketplace);
  if (!customer) {
    return { skipped: { paymentNumber: row.paymentNumber, reason: `Marketplace nicht gefunden: ${row.marketplace}` } };
  }

  const existingPayment = db.prepare("select * from payment_records where payment_number = ?").get(row.paymentNumber);
  if (existingPayment) {
    const existingInvoice = db.prepare("select * from invoices where payment_record_id = ?").get(existingPayment.id);
    if (existingInvoice) {
      return { skipped: { paymentNumber: row.paymentNumber, reason: "Zahlung/Rechnung existiert bereits." } };
    }
  }

  const now = new Date().toISOString();
  const paymentId = existingPayment?.id ?? db.prepare(`
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
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)
  `).run(
    customer.id,
    row.paymentNumber,
    row.salesPeriodStart,
    row.salesPeriodEnd,
    row.paymentDate,
    row.originalCurrency,
    row.originalAmount,
    row.exchangeRate,
    row.confirmedEurAmount,
    row.notes,
    now,
    now
  ).lastInsertRowid;

  const payment = db.prepare("select * from payment_records where id = ?").get(paymentId);
  const settings = db.prepare("select * from settings where id = 1").get();
  const invoiceNumber = nextInvoiceNumber(settings.last_invoice_number);
  const outputDirectory = path.resolve(settings.export_directory);
  const outputDocxPath = path.join(outputDirectory, `${invoiceNumber}.docx`);

  await createInvoiceDocx({
    outputPath: outputDocxPath,
    invoiceNumber,
    invoiceDate: payment.payment_date,
    customer,
    payment
  });

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
    `).run(payment.id, invoiceNumber, payment.payment_date, outputDocxPath, now);

    db.prepare("update payment_records set status = 'invoiced', updated_at = ? where id = ?").run(now, payment.id);
    db.prepare("update settings set last_invoice_number = ? where id = 1").run(invoiceNumber);
    return db.prepare("select * from invoices where id = ?").get(result.lastInsertRowid);
  });

  return { invoice: saveInvoice() };
}

function saveUpload({ db, imageBuffer, uploadName }) {
  const settings = db.prepare("select export_directory from settings where id = 1").get();
  const uploadDirectory = path.resolve(settings.export_directory, "..", "uploads");
  fs.mkdirSync(uploadDirectory, { recursive: true });
  const extension = path.extname(uploadName || "").toLowerCase() || ".png";
  const safeName = `kdp-screenshot-${Date.now()}${extension}`;
  const uploadPath = path.join(uploadDirectory, safeName);
  fs.writeFileSync(uploadPath, imageBuffer);
  return uploadPath;
}

function parseOriginalAmount(text) {
  const match = /\b(USD|EUR|CAD|GBP|AUD|BRL|MXN)\s+([0-9]+(?:[.,][0-9]{2})?)\b/.exec(text);
  if (!match) return null;
  return { currency: match[1], amount: toNumber(match[2]) };
}

function firstNumberAfter(text, pattern, options = {}) {
  const matches = [...text.matchAll(pattern)];
  const match = options.last ? matches.at(-1) : matches[0];
  return match ? toNumber(match[1]) : null;
}

function firstMatch(text, pattern) {
  return pattern.exec(text)?.[1] ?? null;
}

function toNumber(value) {
  return Number(String(value).replace(",", "."));
}

function dedupeRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    if (seen.has(row.paymentNumber)) return false;
    seen.add(row.paymentNumber);
    return true;
  });
}

function parsePaymentNumber({ beforeMarketplace, rowText, paymentDate }) {
  const beforeNumbers = beforeMarketplace.match(/\d{6,}/g) ?? [];
  const afterDate = paymentDate ? rowText.indexOf(paymentDate) + paymentDate.length : -1;
  const afterHeaderText = afterDate > -1 ? rowText.slice(afterDate, Math.min(rowText.length, afterDate + 90)) : "";
  const afterNumbers = afterHeaderText.match(/\b\d{5,}\b/g) ?? [];
  return [...beforeNumbers.slice(-2), ...afterNumbers.slice(0, 1)].slice(0, 2).join("") || beforeNumbers.at(-1);
}

function parseSalesPeriod(text) {
  const monthMap = {
    jan: 0,
    feb: 1,
    mar: 2,
    mrz: 2,
    apr: 3,
    may: 4,
    mai: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    okt: 9,
    nov: 10,
    dec: 11,
    dez: 11
  };
  const match = /(\d{1,2})\.\s*(\p{L}{3,})\.?\s*(20\d{2})\s*-\s*(\d{1,2})\.\s*(\p{L}{3,})\.?\s*(20\d{2})/iu.exec(text);
  const fallbackMatch = /(\d{1,2})\.\s*(\p{L}{3,})\.?\s*(20\d{2})\s*-\s*(\d{1,2})\.?/iu.exec(text);
  if (!match) {
    if (!fallbackMatch) {
      throw new Error("Verkaufszeitraum konnte im Screenshot nicht erkannt werden.");
    }
    const month = monthMap[normalizeMonthToken(fallbackMatch[2])];
    if (month === undefined) {
      throw new Error("Monat im Verkaufszeitraum konnte nicht erkannt werden.");
    }
    const year = Number(fallbackMatch[3]);
    return {
      start: formatDate(year, month, Number(fallbackMatch[1])),
      end: formatDate(year, month, Number(fallbackMatch[4]))
    };
  }
  const startMonth = monthMap[normalizeMonthToken(match[2])];
  const endMonth = monthMap[normalizeMonthToken(match[5])];
  if (startMonth === undefined || endMonth === undefined) {
    throw new Error("Monat im Verkaufszeitraum konnte nicht erkannt werden.");
  }
  return {
    start: formatDate(Number(match[3]), startMonth, Number(match[1])),
    end: formatDate(Number(match[6]), endMonth, Number(match[4]))
  };
}

function normalizeMonthToken(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "")
    .slice(0, 3);
}
function formatDate(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
