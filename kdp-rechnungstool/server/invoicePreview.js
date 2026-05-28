export function createInvoicePreviewHtml({ invoice, payment, customer }) {
  const amount = formatEuro(payment.confirmed_eur_amount);
  const addressLines = JSON.parse(customer.address_lines_json);
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html, body { width: 794px; height: 1123px; margin: 0; overflow: hidden; background: #fff; font-family: "Avenir Book", "Segoe UI", Arial, sans-serif; }
    .page { width: 794px; height: 1123px; margin: 0; overflow: hidden; background: #fff; color: #050b16; padding: 72px; box-sizing: border-box; }
    .top { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
    .customer, .sender { line-height: 1.45; font-size: 15px; }
    .customer strong { font-weight: 800; }
    .sender { text-align: right; }
    .logo { width: 150px; height: 150px; object-fit: contain; margin-left: auto; display: block; }
    .email { color: #0563c1; }
    .meta { margin-top: 54px; display: grid; grid-template-columns: 170px 1fr; row-gap: 6px; font-size: 15px; }
    .meta strong { font-weight: 800; }
    .date-block { margin-top: 52px; text-align: right; font-size: 15px; line-height: 1.55; }
    h1 { margin: 62px 0 20px; font-size: 24px; color: #115582; }
    p { font-size: 15px; margin: 0 0 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 14px; }
    th, td { border: 1px solid #111; padding: 8px 10px; }
    th { text-align: left; font-weight: 800; }
    .right { text-align: right; }
    .center { text-align: center; }
    .sum-label, .sum-value { color: #115582; font-weight: 800; }
    .notes { margin-top: 44px; }
    .footer { margin-top: 106px; display: grid; grid-template-columns: 1.2fr 1fr; gap: 30px; color: #b9b9b9; font-size: 14px; line-height: 1.4; }
    .tax { align-self: end; text-align: center; }
  </style>
</head>
<body>
  <main class="page">
    <section class="top">
      <div class="customer">
        <strong>${escapeHtml(customer.company_name)}</strong><br />
        ${addressLines.map(escapeHtml).join("<br />")}<br /><br />
        ${escapeHtml(customer.tax_label)}: ${escapeHtml(customer.tax_id)}
      </div>
      <div class="sender">
        <img class="logo" src="/kattos-logo.png" alt="Kattos Publishing" />
        Christopher-Nicolas Nussbaum<br />
        Am Mühlbachdamm 10/1<br />
        2822 Bad Erlach<br />
        Tel +436703588425<br />
        <span class="email">kattospublishing@gmail.com</span><br />
        UID: ATU81259102
      </div>
    </section>
    <section class="meta">
      <strong>Leistungszeitraum:</strong><span>${formatDate(payment.sales_period_start)} - ${formatDate(payment.sales_period_end)}</span>
      <strong>Zahlungsnummer:</strong><span>${escapeHtml(payment.payment_number)}</span>
    </section>
    <section class="date-block">
      Bad Erlach, ${formatLongDate(invoice.invoice_date)}<br />
      Rechnungs-Nr.: ${escapeHtml(invoice.invoice_number)}
    </section>
    <h1>Rechnung</h1>
    <p>Sehr geehrte Damen und Herren,</p>
    <p>Wie vereinbart berechne ich Ihnen hiermit:</p>
    <table>
      <thead><tr><th>Anzahl</th><th>Einheit</th><th>Bezeichnung</th><th class="right">Einzelpreis</th><th class="right">Gesamtpreis</th></tr></thead>
      <tbody>
        <tr><td class="center">1</td><td>Stk.</td><td>${escapeHtml(customer.service_description)}</td><td class="right">${amount}</td><td class="right">${amount}</td></tr>
        <tr><td></td><td></td><td>Umsatzsteuer</td><td></td><td class="right">0,00€*</td></tr>
        <tr><td class="sum-label" colspan="4">Gesamtbetrag:</td><td class="right sum-value">${amount} *</td></tr>
      </tbody>
    </table>
    <section class="notes">
      <p>Sofern nicht anders angegeben, entspricht das Liefer-/Leistungsdatum dem Rechnungsdatum.</p>
      <p>*Hinweis gem. UstG: Steuerfrei durch Übergang der Steuerschuld</p>
      <p style="margin-top: 36px;">Der Betrag wird per Überweisung beglichen.</p>
    </section>
    <section class="footer">
      <div>Bankverbindung:<br />Kontoinhaber: Christopher-Nicolas Nussbaum<br />Institut: Erste Sparkasse<br />IBAN: AT88 2011 1829 6931 6404<br />BIC: GIBAATWWXXX</div>
      <div class="tax">Steuernummer: 09 309 / 4803</div>
    </section>
  </main>
</body>
</html>`;
}

function formatEuro(amount) {
  return `${Number(amount).toFixed(2).replace(".", ",")} EUR`;
}

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);
  const months = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."];
  return `${String(date.getDate()).padStart(2, "0")}. ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatLongDate(value) {
  const date = new Date(`${value}T00:00:00`);
  const months = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."];
  return `${date.getDate()}. ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
