import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType
} from "docx";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGO_PATH = path.join(__dirname, "assets", "kattos-logo.png");
export const LOGO_TRANSFORMATION = { width: 150, height: 160 };
const BLUE = "115582";
const BLACK = "000000";

const MONTHS = [
  "Jan.",
  "Feb.",
  "März",
  "Apr.",
  "Mai",
  "Juni",
  "Juli",
  "Aug.",
  "Sept.",
  "Okt.",
  "Nov.",
  "Dez."
];

export function formatEuro(amount) {
  return `${Number(amount).toFixed(2).replace(".", ",")} EUR`;
}

export async function createInvoiceDocx({ outputPath, invoiceNumber, invoiceDate, customer, payment }) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const amount = formatEuro(payment.confirmed_eur_amount);
  const customerLines = [
    customer.company_name,
    ...JSON.parse(customer.address_lines_json),
    customer.tax_id ? `${customer.tax_label}: ${customer.tax_id}` : ""
  ].filter(Boolean);

  const doc = new Document({
    styles: {
      paragraphStyles: [
        {
          id: "Normal",
          name: "Normal",
          run: { font: "Avenir Book", size: 22, color: BLACK },
          paragraph: { spacing: { after: 80 } }
        }
      ]
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 }
          }
        },
        footers: {
          default: footer()
        },
        children: [
          headerBlock(customerLines),
          paragraphGap(560),
          metaTable(formatPeriod(payment.sales_period_start, payment.sales_period_end), payment.payment_number),
          paragraphGap(380),
          rightText(`Bad Erlach, ${formatLongDate(invoiceDate)}`),
          rightText(`Rechnungs-Nr.: ${invoiceNumber}`),
          paragraphGap(420),
          new Paragraph({
            spacing: { after: 240 },
            children: [new TextRun({ text: "Rechnung", bold: true, size: 30, color: BLUE, font: "Avenir Book" })]
          }),
          text("Sehr geehrte Damen und Herren,"),
          text("Wie vereinbart berechne ich Ihnen hiermit:"),
          invoiceTable(customer.service_description, amount),
          paragraphGap(360),
          text("Sofern nicht anders angegeben, entspricht das Liefer-/Leistungsdatum dem Rechnungsdatum."),
          text("*Hinweis gem. UstG: Steuerfrei durch Übergang der Steuerschuld"),
          paragraphGap(260),
          text("Der Betrag wird per Überweisung beglichen.")
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
}

function headerBlock(customerLines) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    borders: noBorders(),
    rows: [
      new TableRow({
        children: [
          noBorderCell({
            width: 4300,
            children: customerLines.flatMap((line, index) => [
              new Paragraph({
                spacing: { after: index === customerLines.length - 2 ? 260 : 60 },
                children: [new TextRun({ text: line, bold: index === 0, font: "Avenir Book", size: 22 })]
              })
            ])
          }),
          noBorderCell({
            width: 5060,
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 520 },
                children: logoRun()
              }),
              ...senderLines().map((line, index) =>
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  spacing: { after: index === 5 ? 260 : 40 },
                  children: [new TextRun({ text: line, font: "Avenir Book", size: 20, color: line.includes("@") ? "0563C1" : BLACK })]
                })
              )
            ]
          })
        ]
      })
    ]
  });
}

function senderLines() {
  return [
    "Christopher-Nicolas Nussbaum",
    "Am Mühlbachdamm 10/1",
    "2822 Bad Erlach",
    "Tel +436703588425",
    "kattospublishing@gmail.com",
    "",
    "UID: ATU81259102"
  ];
}

function logoRun() {
  if (!fs.existsSync(LOGO_PATH)) return [];
  return [
    new ImageRun({
      data: fs.readFileSync(LOGO_PATH),
      transformation: LOGO_TRANSFORMATION
    })
  ];
}

function metaTable(period, paymentNumber) {
  return new Table({
    width: { size: 6200, type: WidthType.DXA },
    borders: noBorders(),
    rows: [
      metaRow("Leistungszeitraum:", period),
      metaRow("Zahlungsnummer:", paymentNumber)
    ]
  });
}

function metaRow(label, value) {
  return new TableRow({
    children: [
      noBorderCell({ width: 2100, children: [text(label, { bold: true })] }),
      noBorderCell({ width: 4100, children: [text(value)] })
    ]
  });
}

function invoiceTable(description, amount) {
  const borders = thinBorders(BLACK);
  const widths = [978, 1115, 3544, 1701, 2003];
  return new Table({
    width: { size: 9341, type: WidthType.DXA },
    borders,
    rows: [
      new TableRow({
        children: [
          cell("Anzahl", widths[0], true, AlignmentType.CENTER, borders),
          cell("Einheit", widths[1], true, AlignmentType.LEFT, borders),
          cell("Bezeichnung", widths[2], true, AlignmentType.LEFT, borders),
          cell("Einzelpreis", widths[3], true, AlignmentType.RIGHT, borders),
          cell("Gesamtpreis", widths[4], true, AlignmentType.RIGHT, borders)
        ]
      }),
      new TableRow({
        children: [
          cell("1", widths[0], false, AlignmentType.CENTER, borders),
          cell("Stk.", widths[1], false, AlignmentType.LEFT, borders),
          cell(description, widths[2], false, AlignmentType.LEFT, borders),
          cell(amount, widths[3], false, AlignmentType.RIGHT, borders),
          cell(amount, widths[4], false, AlignmentType.RIGHT, borders)
        ]
      }),
      new TableRow({
        children: [
          cell("", widths[0], false, AlignmentType.CENTER, borders),
          cell("", widths[1], false, AlignmentType.LEFT, borders),
          cell("Umsatzsteuer", widths[2], false, AlignmentType.LEFT, borders),
          cell("", widths[3], false, AlignmentType.RIGHT, borders),
          cell("0,00€*", widths[4], false, AlignmentType.RIGHT, borders)
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 4,
            verticalAlign: VerticalAlign.CENTER,
            width: { size: widths.slice(0, 4).reduce((sum, width) => sum + width, 0), type: WidthType.DXA },
            borders,
            margins: cellMargins(),
            children: [text("Gesamtbetrag:", { bold: true, color: BLUE })]
          }),
          cell(`${amount} *`, widths[4], true, AlignmentType.RIGHT, borders, BLUE)
        ]
      })
    ]
  });
}

function footer() {
  return new Footer({
    children: [
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        borders: noBorders(),
        rows: [
          new TableRow({
            children: [
              noBorderCell({
                width: 5200,
                children: [
                  text("Bankverbindung:", { color: "8A8A8A", size: 20 }),
                  text("Kontoinhaber: Christopher-Nicolas Nussbaum", { color: "8A8A8A", size: 20 }),
                  text("Institut: Erste Sparkasse", { color: "8A8A8A", size: 20 }),
                  text("IBAN: AT88 2011 1829 6931 6404", { color: "8A8A8A", size: 20 }),
                  text("BIC: GIBAATWWXXX", { color: "8A8A8A", size: 20 })
                ]
              }),
              noBorderCell({
                width: 4160,
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 620 },
                    children: [new TextRun({ text: "Steuernummer: 09 309 / 4803", color: "8A8A8A", font: "Avenir Book", size: 20 })]
                  })
                ]
              })
            ]
          })
        ]
      })
    ]
  });
}

function text(value, options = {}) {
  return new Paragraph({
    spacing: { after: options.after ?? 80 },
    children: [
      new TextRun({
        text: String(value),
        bold: options.bold ?? false,
        color: options.color ?? BLACK,
        font: "Avenir Book",
        size: options.size ?? 22
      })
    ]
  });
}

function rightText(value) {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { after: 70 },
    children: [new TextRun({ text: String(value), font: "Avenir Book", size: 20 })]
  });
}

function paragraphGap(after) {
  return new Paragraph({ text: "", spacing: { after } });
}

function cell(value, width, bold, alignment, borders, color = BLACK) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    borders,
    margins: cellMargins(),
    children: [
      new Paragraph({
        alignment,
        spacing: { after: 0 },
        children: [new TextRun({ text: value, bold, color, font: "Avenir Book", size: 20 })]
      })
    ]
  });
}

function noBorderCell({ width, children }) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: noBorders(),
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    children
  });
}

function thinBorders(color) {
  return {
    top: { style: BorderStyle.SINGLE, size: 2, color },
    bottom: { style: BorderStyle.SINGLE, size: 2, color },
    left: { style: BorderStyle.SINGLE, size: 2, color },
    right: { style: BorderStyle.SINGLE, size: 2, color },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color },
    insideVertical: { style: BorderStyle.SINGLE, size: 2, color }
  };
}

function noBorders() {
  return {
    top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }
  };
}

function cellMargins() {
  return { top: 80, bottom: 80, left: 120, right: 120 };
}

function formatPeriod(start, end) {
  return `${formatShortDate(start)} - ${formatShortDate(end)}`;
}

function formatShortDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return `${String(date.getDate()).padStart(2, "0")}. ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function formatLongDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return `${date.getDate()}. ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}
