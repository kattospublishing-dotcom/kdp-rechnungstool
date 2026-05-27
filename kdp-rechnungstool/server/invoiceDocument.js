import fs from "node:fs";
import path from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from "docx";

const MONTHS = [
  "Jan.",
  "Feb.",
  "Maerz",
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
          run: { font: "Avenir Book", size: 20 },
          paragraph: { spacing: { after: 120 } }
        }
      ]
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 900, right: 900, bottom: 900, left: 900 }
          }
        },
        children: [
          ...customerLines.map((line) => text(line)),
          spacer(),
          text("Christopher-Nicolas Nussbaum"),
          text("Am Muehlbachdamm 10/1"),
          text("2822 Bad Erlach"),
          text("Tel +436703588425"),
          text("kattospublishing@gmail.com"),
          text("UID: ATU81259102"),
          spacer(),
          keyValue("Leistungszeitraum:", formatPeriod(payment.sales_period_start, payment.sales_period_end)),
          keyValue("Zahlungsnummer:", payment.payment_number),
          rightText(`Bad Erlach, ${formatLongDate(invoiceDate)}`),
          rightText(`Rechnungs-Nr.: ${invoiceNumber}`),
          heading("Rechnung"),
          text("Sehr geehrte Damen und Herren,"),
          text("Wie vereinbart berechne ich Ihnen hiermit:"),
          invoiceTable(customer.service_description, amount),
          spacer(),
          text("Sofern nicht anders angegeben, entspricht das Liefer-/Leistungsdatum dem Rechnungsdatum."),
          text("* Hinweis gem. UstG: Steuerfrei durch Uebergang der Steuerschuld"),
          text("Der Betrag wird per Ueberweisung beglichen.")
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
}

function text(value) {
  return new Paragraph({ children: [new TextRun(String(value))] });
}

function rightText(value) {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [new TextRun(String(value))]
  });
}

function heading(value) {
  return new Paragraph({
    spacing: { before: 300, after: 180 },
    children: [new TextRun({ text: value, bold: true, size: 32 })]
  });
}

function spacer() {
  return new Paragraph({ text: "", spacing: { after: 180 } });
}

function keyValue(label, value) {
  return new Paragraph({
    children: [new TextRun({ text: `${label} `, bold: true }), new TextRun(value)]
  });
}

function invoiceTable(description, amount) {
  const borders = {
    top: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
    left: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
    right: { style: BorderStyle.SINGLE, size: 1, color: "999999" }
  };
  const widths = [900, 1000, 3700, 1700, 2000];

  return new Table({
    width: { size: 9300, type: WidthType.DXA },
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
          cell("0,00 EUR *", widths[4], false, AlignmentType.RIGHT, borders)
        ]
      }),
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 4,
            width: { size: widths.slice(0, 4).reduce((sum, width) => sum + width, 0), type: WidthType.DXA },
            borders,
            children: [new Paragraph({ children: [new TextRun({ text: "Gesamtbetrag:", bold: true, color: "115582" })] })]
          }),
          cell(`${amount} *`, widths[4], true, AlignmentType.RIGHT, borders, "115582")
        ]
      })
    ]
  });
}

function cell(value, width, bold, alignment, borders, color = "000000") {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders,
    margins: { top: 120, bottom: 120, left: 120, right: 120 },
    children: [
      new Paragraph({
        alignment,
        children: [new TextRun({ text: value, bold, color })]
      })
    ]
  });
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
