import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "./api.js";
import "./styles.css";

const initialForm = {
  marketplaceCustomerId: "",
  paymentNumber: "",
  salesPeriodStart: "",
  salesPeriodEnd: "",
  paymentDate: "",
  originalCurrency: "EUR",
  originalAmount: "",
  exchangeRate: "",
  confirmedEurAmount: "",
  status: "draft",
  notes: ""
};

export default function App() {
  const [settings, setSettings] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [theme, setTheme] = useState(() => localStorage.getItem("kdp-theme") || "light");
  const selectedCustomer = useMemo(
    () => customers.find((customer) => String(customer.id) === String(form.marketplaceCustomerId)),
    [customers, form.marketplaceCustomerId]
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("kdp-theme", theme);
  }, [theme]);

  useEffect(() => {
    refreshData();
  }, []);

  async function refreshData() {
    const [settingsData, customersData, paymentsData, invoicesData] = await Promise.all([
      apiGet("/settings"),
      apiGet("/customers"),
      apiGet("/payments"),
      apiGet("/invoices")
    ]);
    setSettings(settingsData);
    setCustomers(customersData);
    setPayments(paymentsData);
    setInvoices(invoicesData);
    if (!form.marketplaceCustomerId && customersData[0]) {
      setForm((current) => ({ ...current, marketplaceCustomerId: String(customersData[0].id) }));
    }
  }

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function savePayment(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await apiPost("/payments", {
        ...form,
        marketplaceCustomerId: Number(form.marketplaceCustomerId),
        originalAmount: Number(form.originalAmount),
        exchangeRate: form.exchangeRate ? Number(form.exchangeRate) : null,
        confirmedEurAmount: form.confirmedEurAmount ? Number(form.confirmedEurAmount) : null
      });
      setForm((current) => ({
        ...initialForm,
        marketplaceCustomerId: current.marketplaceCustomerId
      }));
      setMessage("Zahlung gespeichert.");
      await refreshData();
    } catch (err) {
      setError(readError(err));
    }
  }

  async function finalizePayment(paymentId) {
    setError("");
    setMessage("");
    try {
      const invoice = await apiPost(`/invoices/${paymentId}/finalize`, {});
      setMessage(`Rechnung ${invoice.invoice_number} wurde erzeugt.`);
      await refreshData();
    } catch (err) {
      setError(readError(err));
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>KDP Rechnungstool</h1>
          <p>Lokale Rechnungen fuer Amazon-KDP-Zahlungen</p>
        </div>
        <div className="topbar-actions">
          <button
            className="theme-toggle"
            type="button"
            aria-pressed={theme === "dark"}
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
          <div className="number-chip">
            <span>Letzte Rechnung</span>
            <strong>{settings?.last_invoice_number ?? "..."}</strong>
          </div>
        </div>
      </header>

      <section className="summary-grid" aria-label="Uebersicht">
        <Metric label="Entwuerfe" value={payments.filter((payment) => payment.status === "draft").length} />
        <Metric label="EUR bestaetigt" value={payments.filter((payment) => payment.status === "confirmed").length} />
        <Metric label="Rechnungen" value={invoices.length} />
      </section>

      {(message || error) && (
        <section className={error ? "notice notice-error" : "notice"}>
          {error || message}
        </section>
      )}

      <section className="work-grid">
        <form className="panel form-panel" onSubmit={savePayment}>
          <div className="panel-title">
            <h2>Neue Zahlung erfassen</h2>
            <p>Eine Zahlungszeile ergibt eine Rechnung.</p>
          </div>

          <label>
            Marketplace
            <select name="marketplaceCustomerId" value={form.marketplaceCustomerId} onChange={updateField} required>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.display_name}
                </option>
              ))}
            </select>
          </label>

          {selectedCustomer && (
            <div className="customer-preview">
              <strong>{selectedCustomer.company_name}</strong>
              <span>{selectedCustomer.service_description}</span>
            </div>
          )}

          <div className="field-grid">
            <label>
              Zahlungsnummer
              <input name="paymentNumber" value={form.paymentNumber} onChange={updateField} required />
            </label>
            <label>
              Zahlungsdatum
              <input type="date" name="paymentDate" value={form.paymentDate} onChange={updateField} required />
            </label>
            <label>
              Zeitraum von
              <input type="date" name="salesPeriodStart" value={form.salesPeriodStart} onChange={updateField} required />
            </label>
            <label>
              Zeitraum bis
              <input type="date" name="salesPeriodEnd" value={form.salesPeriodEnd} onChange={updateField} required />
            </label>
            <label>
              Originalbetrag
              <input type="number" step="0.01" name="originalAmount" value={form.originalAmount} onChange={updateField} required />
            </label>
            <label>
              Originalwaehrung
              <select name="originalCurrency" value={form.originalCurrency} onChange={updateField} required>
                <option>EUR</option>
                <option>USD</option>
                <option>CAD</option>
                <option>GBP</option>
              </select>
            </label>
            <label>
              Wechselkurs optional
              <input type="number" step="0.0001" name="exchangeRate" value={form.exchangeRate} onChange={updateField} />
            </label>
            <label>
              EUR laut Kontoauszug
              <input type="number" step="0.01" name="confirmedEurAmount" value={form.confirmedEurAmount} onChange={updateField} />
            </label>
          </div>

          <label>
            Status
            <select name="status" value={form.status} onChange={updateField}>
              <option value="draft">Entwurf</option>
              <option value="confirmed">EUR bestaetigt</option>
            </select>
          </label>

          <label>
            Notiz
            <textarea name="notes" rows="3" value={form.notes} onChange={updateField} />
          </label>

          <button className="primary-button" type="submit">Zahlung speichern</button>
        </form>

        <section className="panel">
          <div className="panel-title">
            <h2>Zahlungen</h2>
            <p>Finalisieren erst nach Konto-Bestaetigung.</p>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Marketplace</th>
                  <th>Zahlungsnummer</th>
                  <th>Status</th>
                  <th>EUR</th>
                  <th>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.display_name}</td>
                    <td>{payment.payment_number}</td>
                    <td><StatusBadge status={payment.status} /></td>
                    <td>{formatAmount(payment.confirmed_eur_amount)}</td>
                    <td>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={payment.status !== "confirmed"}
                        onClick={() => finalizePayment(payment.id)}
                      >
                        Rechnung erzeugen
                      </button>
                    </td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr>
                    <td colSpan="5" className="empty-cell">Noch keine Zahlungen erfasst.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section className="panel history-panel">
        <div className="panel-title">
          <h2>Rechnungshistorie</h2>
          <p>Erzeugte Rechnungen bleiben nachvollziehbar gespeichert.</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rechnung</th>
                <th>Datum</th>
                <th>Marketplace</th>
                <th>Zahlungsnummer</th>
                <th>EUR</th>
                <th>Datei</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{invoice.invoice_number}</td>
                  <td>{invoice.invoice_date}</td>
                  <td>{invoice.display_name}</td>
                  <td>{invoice.payment_number}</td>
                  <td>{formatAmount(invoice.confirmed_eur_amount)}</td>
                  <td>
                    <a className="file-link" href={`/api/invoices/${invoice.id}/docx`}>
                      Word-Datei
                    </a>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan="6" className="empty-cell">Noch keine Rechnungen erzeugt.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusBadge({ status }) {
  const labels = {
    draft: "Entwurf",
    confirmed: "EUR bestaetigt",
    invoiced: "Rechnung erzeugt"
  };
  return <span className={`status-badge status-${status}`}>{labels[status] ?? status}</span>;
}

function formatAmount(value) {
  if (value === null || value === undefined || value === "") return "-";
  return `${Number(value).toFixed(2).replace(".", ",")} EUR`;
}

function readError(err) {
  try {
    return JSON.parse(err.message).error ?? err.message;
  } catch {
    return err.message;
  }
}
