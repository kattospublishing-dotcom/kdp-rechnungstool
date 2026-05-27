# KDP Rechnungstool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local browser app that captures Amazon KDP payment rows manually, confirms EUR bank amounts, assigns invoice numbers only on final export, and generates one DOCX invoice per payment.

**Architecture:** A small local Node/Express app serves a React frontend and exposes JSON APIs for settings, customers, payments, invoices, and DOCX export. Data is stored in SQLite so invoice history and numbering survive restarts. DOCX output is generated from code in a backend service using the existing sample invoices as the layout reference.

**Tech Stack:** Node.js, Express, React, Vite, SQLite, better-sqlite3, docx, Vitest or Node test runner, Playwright/browser smoke test if available.

---

## File Structure

- `kdp-rechnungstool/package.json`: scripts and dependencies.
- `kdp-rechnungstool/server/index.js`: starts Express, serves API and production frontend.
- `kdp-rechnungstool/server/db.js`: SQLite connection, schema, seed data, small query helpers.
- `kdp-rechnungstool/server/invoiceNumbers.js`: invoice number parsing and next-number logic.
- `kdp-rechnungstool/server/invoiceDocument.js`: DOCX creation for one finalized invoice.
- `kdp-rechnungstool/server/routes.js`: API endpoints.
- `kdp-rechnungstool/server/data/`: local SQLite database and generated output directories.
- `kdp-rechnungstool/src/App.jsx`: main React app shell.
- `kdp-rechnungstool/src/api.js`: frontend API wrapper.
- `kdp-rechnungstool/src/styles.css`: utilitarian app styling.
- `kdp-rechnungstool/tests/*.test.js`: backend unit and API tests.

## Task 1: Scaffold Local App

**Files:**
- Create: `kdp-rechnungstool/package.json`
- Create: `kdp-rechnungstool/server/index.js`
- Create: `kdp-rechnungstool/server/routes.js`
- Create: `kdp-rechnungstool/src/App.jsx`
- Create: `kdp-rechnungstool/src/main.jsx`
- Create: `kdp-rechnungstool/src/styles.css`
- Create: `kdp-rechnungstool/index.html`

- [ ] **Step 1: Create package scripts**

`package.json` must include:

```json
{
  "name": "kdp-rechnungstool",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "server": "node server/index.js",
    "build": "vite build",
    "test": "node --test tests/*.test.js"
  },
  "dependencies": {
    "@vitejs/plugin-react": "latest",
    "better-sqlite3": "latest",
    "docx": "latest",
    "express": "latest",
    "vite": "latest",
    "react": "latest",
    "react-dom": "latest"
  },
  "devDependencies": {}
}
```

- [ ] **Step 2: Add minimal Express health route**

`server/index.js`:

```js
import express from "express";
import { createRouter } from "./routes.js";

const app = express();
const port = process.env.PORT || 5174;

app.use(express.json());
app.use("/api", createRouter());

app.listen(port, "127.0.0.1", () => {
  console.log(`KDP Rechnungstool API: http://127.0.0.1:${port}`);
});
```

`server/routes.js`:

```js
import { Router } from "express";

export function createRouter() {
  const router = Router();
  router.get("/health", (req, res) => res.json({ ok: true }));
  return router;
}
```

- [ ] **Step 3: Add minimal React shell**

`src/App.jsx`:

```jsx
import "./styles.css";

export default function App() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>KDP Rechnungstool</h1>
          <p>Lokale Rechnungen fuer Amazon-KDP-Zahlungen</p>
        </div>
      </header>
    </main>
  );
}
```

- [ ] **Step 4: Run syntax checks**

Run: `node --check server/index.js`
Expected: no syntax errors.

Run: `node --check server/routes.js`
Expected: no syntax errors.

## Task 2: Implement Invoice Number Logic

**Files:**
- Create: `kdp-rechnungstool/server/invoiceNumbers.js`
- Create: `kdp-rechnungstool/tests/invoiceNumbers.test.js`

- [ ] **Step 1: Write tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { formatInvoiceNumber, parseInvoiceNumber, nextInvoiceNumber } from "../server/invoiceNumbers.js";

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
```

- [ ] **Step 2: Run test to verify it fails before implementation**

Run: `npm test -- tests/invoiceNumbers.test.js`
Expected: FAIL because `server/invoiceNumbers.js` is missing.

- [ ] **Step 3: Implement logic**

```js
export function formatInvoiceNumber({ prefix, year, sequence }) {
  const padded = String(sequence).padStart(2, "0");
  return `${prefix}${year}${padded}`;
}

export function parseInvoiceNumber(invoiceNumber) {
  const match = /^([A-Z]+)(\d{4})(\d{2,})$/.exec(invoiceNumber);
  if (!match) {
    throw new Error(`Invalid invoice number: ${invoiceNumber}`);
  }
  return {
    prefix: match[1],
    year: Number(match[2]),
    sequence: Number(match[3])
  };
}

export function nextInvoiceNumber(invoiceNumber) {
  const parsed = parseInvoiceNumber(invoiceNumber);
  return formatInvoiceNumber({ ...parsed, sequence: parsed.sequence + 1 });
}
```

- [ ] **Step 4: Run test**

Run: `npm test -- tests/invoiceNumbers.test.js`
Expected: PASS.

## Task 3: Add SQLite Schema And Seed Customers

**Files:**
- Create: `kdp-rechnungstool/server/db.js`
- Create: `kdp-rechnungstool/tests/db.test.js`

- [ ] **Step 1: Write database tests**

```js
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
```

- [ ] **Step 2: Implement schema and seed**

`server/db.js` must export `createDatabase(filename)` and create these tables:

```sql
create table if not exists settings (
  id integer primary key check (id = 1),
  invoice_prefix text not null,
  invoice_year integer not null,
  last_invoice_number text not null,
  export_directory text not null
);

create table if not exists marketplace_customers (
  id integer primary key,
  marketplace text not null unique,
  display_name text not null,
  company_name text not null,
  address_lines_json text not null,
  tax_label text not null,
  tax_id text not null,
  service_description text not null,
  active integer not null default 1
);

create table if not exists payment_records (
  id integer primary key,
  marketplace_customer_id integer not null references marketplace_customers(id),
  payment_number text not null,
  sales_period_start text not null,
  sales_period_end text not null,
  payment_date text not null,
  original_currency text not null,
  original_amount real not null,
  exchange_rate real,
  confirmed_eur_amount real,
  status text not null default 'draft',
  notes text not null default '',
  created_at text not null,
  updated_at text not null
);

create table if not exists invoices (
  id integer primary key,
  payment_record_id integer not null unique references payment_records(id),
  invoice_number text not null unique,
  invoice_date text not null,
  output_docx_path text not null,
  output_pdf_path text,
  created_at text not null,
  locked integer not null default 1
);
```

Seed initial customers from the existing examples:

```js
[
  {
    marketplace: "amazon.de",
    displayName: "Amazon.de",
    companyName: "Amazon Media EU S.a r.l. (Societe a responsabilite limitee)",
    addressLines: ["38 avenue John F. Kennedy", "L-1855 Luxembourg"],
    taxLabel: "VAT-No.",
    taxId: "LU 20944528",
    serviceDescription: "KDP Buecher-Honorare amazon.de"
  },
  {
    marketplace: "amazon.com",
    displayName: "Amazon.com",
    companyName: "Amazon Digital Services LLC",
    addressLines: ["410 Terry Avenue North", "Seattle, WA 98109", "United States"],
    taxLabel: "Tax ID",
    taxId: "83-0417755",
    serviceDescription: "KDP Buecher-Honorare amazon.com"
  },
  {
    marketplace: "amazon.ca",
    displayName: "Amazon.ca",
    companyName: "Amazon Digital Services LLC",
    addressLines: ["410 Terry Avenue North", "Seattle, WA 98109", "United States"],
    taxLabel: "Tax ID",
    taxId: "83-0417755",
    serviceDescription: "KDP Buecher-Honorare amazon.ca"
  },
  {
    marketplace: "amazon.co.uk",
    displayName: "Amazon.co.uk",
    companyName: "Amazon Media EU S.a r.l. UK Branch",
    addressLines: ["1 Principal Place", "Worship Street", "London EC2A 2FA", "United Kingdom"],
    taxLabel: "VAT-No.",
    taxId: "",
    serviceDescription: "KDP Buecher-Honorare amazon.co.uk"
  }
]
```

- [ ] **Step 3: Run tests**

Run: `npm test -- tests/db.test.js`
Expected: PASS.

## Task 4: Add Payment And Invoice APIs

**Files:**
- Modify: `kdp-rechnungstool/server/routes.js`
- Modify: `kdp-rechnungstool/server/index.js`
- Create: `kdp-rechnungstool/tests/routes.test.js`

- [ ] **Step 1: Write API tests**

Tests must cover:

```js
// GET /api/customers returns seeded marketplaces.
// POST /api/payments creates a draft or confirmed payment.
// POST /api/payments rejects missing EUR amount when status is "confirmed".
// POST /api/invoices/:paymentId/finalize rejects payments without confirmed EUR amount.
```

- [ ] **Step 2: Export app creation for tests**

Refactor `server/index.js` to export `createApp(db)` and keep the listen call guarded:

```js
export function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use("/api", createRouter(db));
  return app;
}
```

- [ ] **Step 3: Implement endpoints**

`server/routes.js` must expose:

- `GET /customers`
- `GET /payments`
- `POST /payments`
- `POST /invoices/:paymentId/finalize`
- `GET /invoices`
- `GET /settings`

Validation rules:

```js
if (status === "confirmed" && !confirmedEurAmount) {
  return res.status(400).json({ error: "EUR-Betrag laut Kontoauszug fehlt." });
}
```

Finalize rule:

```js
if (!payment.confirmed_eur_amount) {
  return res.status(400).json({ error: "Rechnung erst nach bestaetigtem EUR-Zahlungseingang moeglich." });
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/routes.test.js`
Expected: PASS.

## Task 5: Generate DOCX Invoice

**Files:**
- Create: `kdp-rechnungstool/server/invoiceDocument.js`
- Modify: `kdp-rechnungstool/server/routes.js`
- Create: `kdp-rechnungstool/tests/invoiceDocument.test.js`

- [ ] **Step 1: Write DOCX test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInvoiceDocx } from "../server/invoiceDocument.js";

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
```

- [ ] **Step 2: Implement DOCX generation**

Use `docx` to create:

- Amazon recipient block
- sender block with Christopher-Nicolas Nussbaum data
- Leistungszeitraum
- Zahlungsnummer
- Bad Erlach invoice date
- Rechnungs-Nr.
- position table
- Gesamtbetrag
- reverse-charge note

Currency formatting:

```js
export function formatEuro(amount) {
  return `${Number(amount).toFixed(2).replace(".", ",")} EUR`;
}
```

- [ ] **Step 3: Wire finalize endpoint to DOCX output**

On finalization:

- calculate next number from settings
- create file under `server/data/exports/RE202614.docx`
- insert invoice record
- update payment status to `invoiced`
- update settings last invoice number

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/invoiceDocument.test.js`
Expected: PASS.

## Task 6: Build Browser UI

**Files:**
- Modify: `kdp-rechnungstool/src/App.jsx`
- Create: `kdp-rechnungstool/src/api.js`
- Modify: `kdp-rechnungstool/src/styles.css`

- [ ] **Step 1: Implement API wrapper**

`src/api.js`:

```js
const API_BASE = "/api";

export async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function apiPost(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
```

- [ ] **Step 2: Implement dashboard and form**

`App.jsx` must show:

- last invoice number
- customer dropdown
- payment fields
- confirmed EUR amount field
- save payment button
- finalize invoice button for confirmed payments
- invoice history table

- [ ] **Step 3: Style as a compact business tool**

Use restrained colors, dense but readable layout, no marketing hero. Buttons and form controls must not overlap on narrow screens.

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: Vite build completes.

## Task 7: Manual Smoke Test

**Files:**
- No source files unless defects are found.

- [ ] **Step 1: Start backend**

Run: `npm run server`
Expected: server prints local URL.

- [ ] **Step 2: Start frontend**

Run: `npm run dev`
Expected: Vite prints local URL.

- [ ] **Step 3: Create sample payment**

Use:

```text
Marketplace: Amazon.com
Zahlungsnummer: 100001196439600
Verkaufszeitraum: 2026-03-01 bis 2026-03-31
Zahlungsdatum: 2026-05-29
Originalbetrag: 22.42
Originalwaehrung: USD
EUR-Betrag: 20.12
Status: EUR bestaetigt
```

- [ ] **Step 4: Finalize invoice**

Expected:

- invoice number is next after current setting
- DOCX file exists in export directory
- invoice history shows the generated invoice
- payment cannot generate a second invoice

- [ ] **Step 5: Syntax and tests**

Run:

```bash
npm test
npm run build
```

Expected: both pass.

## Self-Review

- Spec coverage: manual entry, customer master data, EUR confirmation gate, one payment row per invoice, invoice number assignment on final export, DOCX generation, and history are covered.
- Deferred by design for a separate Phase-2 plan: OCR/screenshot import, bank-statement import automation, and PDF export. The schema keeps original currency and exchange rate so those features can be added without replacing Phase 1.
- Placeholder scan: no unresolved placeholder markers are present.
- Type consistency: backend uses snake_case for database rows and camelCase for frontend payloads; route handlers must explicitly map between them.
