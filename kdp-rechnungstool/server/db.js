import Database from "better-sqlite3";
import path from "node:path";

const DEFAULT_CUSTOMERS = [
  {
    marketplace: "amazon.de",
    displayName: "Amazon.de",
    companyName: "Amazon Media EU S.àr.l. (Société à responsabilité limitée)",
    addressLines: ["38 avenue John F. Kennedy", "L-1855 Luxembourg"],
    taxLabel: "VAT-No.",
    taxId: "LU 20944528",
    serviceDescription: "KDP Bücher-Honorare amazon.de"
  },
  {
    marketplace: "amazon.fr",
    displayName: "Amazon.fr",
    companyName: "Amazon Media EU S.àr.l. (Société à responsabilité limitée)",
    addressLines: ["38 avenue John F. Kennedy", "L-1855 Luxembourg"],
    taxLabel: "VAT-No.",
    taxId: "LU 20944528",
    serviceDescription: "KDP Bücher-Honorare amazon.fr"
  },
  {
    marketplace: "amazon.es",
    displayName: "Amazon.es",
    companyName: "Amazon Media EU S.àr.l. (Société à responsabilité limitée)",
    addressLines: ["38 avenue John F. Kennedy", "L-1855 Luxembourg"],
    taxLabel: "VAT-No.",
    taxId: "LU 20944528",
    serviceDescription: "KDP Bücher-Honorare amazon.es"
  },
  {
    marketplace: "amazon.co.uk",
    displayName: "Amazon.co.uk",
    companyName: "Amazon Media EU S.àr.l. (Société à responsabilité limitée)",
    addressLines: ["38 avenue John F. Kennedy", "L-1855 Luxembourg"],
    taxLabel: "VAT-No.",
    taxId: "LU 20944528",
    serviceDescription: "KDP Bücher-Honorare amazon.co.uk"
  },
  {
    marketplace: "amazon.nl",
    displayName: "Amazon.nl",
    companyName: "Amazon Media EU S.àr.l. (Société à responsabilité limitée)",
    addressLines: ["38 avenue John F. Kennedy", "L-1855 Luxembourg"],
    taxLabel: "VAT-No.",
    taxId: "LU 20944528",
    serviceDescription: "KDP Bücher-Honorare amazon.nl"
  },
  {
    marketplace: "amazon.it",
    displayName: "Amazon.it",
    companyName: "Amazon Media EU S.àr.l. (Société à responsabilité limitée)",
    addressLines: ["38 avenue John F. Kennedy", "L-1855 Luxembourg"],
    taxLabel: "VAT-No.",
    taxId: "LU 20944528",
    serviceDescription: "KDP Bücher-Honorare amazon.it"
  },
  {
    marketplace: "amazon.com",
    displayName: "Amazon.com",
    companyName: "Amazon Digital Services LLC",
    addressLines: ["410 Terry Avenue North", "Seattle, WA 98109", "United States"],
    taxLabel: "Tax ID",
    taxId: "83-0417755",
    serviceDescription: "KDP Bücher-Honorare amazon.com"
  },
  {
    marketplace: "amazon.ca",
    displayName: "Amazon.ca",
    companyName: "Amazon Digital Services LLC",
    addressLines: ["410 Terry Avenue North", "Seattle, WA 98109", "United States"],
    taxLabel: "Tax ID",
    taxId: "83-0417755",
    serviceDescription: "KDP Bücher-Honorare amazon.ca"
  },
  {
    marketplace: "amazon.com.au",
    displayName: "Amazon.com.au",
    companyName: "Amazon Australia Services, Inc.",
    addressLines: ["410 Terry Avenue North", "Seattle, WA 98109", "United States"],
    taxLabel: "Tax ID",
    taxId: "46-2971461",
    serviceDescription: "KDP Bücher-Honorare amazon.com.au"
  },
  {
    marketplace: "amazon.com.br",
    displayName: "Amazon.com.br",
    companyName: "Amazon Serviços de Varejo do Brasil Ltda.",
    addressLines: [
      "Av. Presidente JuscelinoKubitscheck, 2041 – Torre E – 18º andar",
      "São Paulo – SP",
      "CEP: 04543-000",
      "Brazil"
    ],
    taxLabel: "Tax ID",
    taxId: "98-1204075",
    serviceDescription: "KDP Bücher-Honorare amazon.com.br"
  },
  {
    marketplace: "amazon.com.mx",
    displayName: "Amazon.com.mx",
    companyName: "Amazon Mexico Services, Inc.",
    addressLines: ["410 Terry Avenue North", "Seattle, WA 98109-5210", "United States"],
    taxLabel: "Tax ID",
    taxId: "46-2796183",
    serviceDescription: "KDP Bücher-Honorare amazon.com.mx"
  }
];

export function createDatabase(filename = path.join("server", "data", "kdp-rechnungstool.sqlite")) {
  const db = new Database(filename);
  db.pragma("foreign_keys = ON");
  applySchema(db);
  seedDefaults(db);
  return db;
}

function applySchema(db) {
  db.exec(`
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
      reviewed_at text,
      locked integer not null default 1
    );
  `);

  const invoiceColumns = db.prepare("pragma table_info(invoices)").all().map((column) => column.name);
  if (!invoiceColumns.includes("reviewed_at")) {
    db.exec("alter table invoices add column reviewed_at text");
    db.exec("update invoices set reviewed_at = created_at where reviewed_at is null");
  }
}

function seedDefaults(db) {
  const existingSettings = db.prepare("select id from settings where id = 1").get();
  if (!existingSettings) {
    db.prepare(`
      insert into settings (id, invoice_prefix, invoice_year, last_invoice_number, export_directory)
      values (1, 'RE', 2026, 'RE202613', 'server/data/exports')
    `).run();
  }

  const insertCustomer = db.prepare(`
    insert into marketplace_customers (
      marketplace,
      display_name,
      company_name,
      address_lines_json,
      tax_label,
      tax_id,
      service_description,
      active
    )
    values (@marketplace, @displayName, @companyName, @addressLinesJson, @taxLabel, @taxId, @serviceDescription, 1)
    on conflict(marketplace) do update set
      display_name = excluded.display_name,
      company_name = excluded.company_name,
      address_lines_json = excluded.address_lines_json,
      tax_label = excluded.tax_label,
      tax_id = excluded.tax_id,
      service_description = excluded.service_description,
      active = excluded.active
  `);

  for (const customer of DEFAULT_CUSTOMERS) {
    insertCustomer.run({
      ...customer,
      addressLinesJson: JSON.stringify(customer.addressLines)
    });
  }
}
