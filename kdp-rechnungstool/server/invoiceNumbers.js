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
