import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost } from "./api.js";
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
  const [invoiceReviews, setInvoiceReviews] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [stats, setStats] = useState(null);
  const [confettiBurst, setConfettiBurst] = useState(0);
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [screenshotImporting, setScreenshotImporting] = useState(false);
  const [screenshotResult, setScreenshotResult] = useState(null);
  const [previewInvoiceId, setPreviewInvoiceId] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [theme, setTheme] = useState(() => localStorage.getItem("kdp-theme") || "light");
  const selectedCustomer = useMemo(
    () => customers.find((customer) => String(customer.id) === String(form.marketplaceCustomerId)),
    [customers, form.marketplaceCustomerId]
  );
  const previewInvoices = useMemo(() => [...invoiceReviews, ...invoices], [invoiceReviews, invoices]);
  const previewInvoice = useMemo(
    () => previewInvoices.find((invoice) => invoice.id === previewInvoiceId) ?? previewInvoices[0] ?? null,
    [previewInvoiceId, previewInvoices]
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("kdp-theme", theme);
  }, [theme]);

  useEffect(() => {
    refreshData();
  }, []);

  async function refreshData() {
    const [settingsData, customersData, paymentsData, reviewData, invoicesData, statsData] = await Promise.all([
      apiGet("/settings"),
      apiGet("/customers"),
      apiGet("/payments"),
      apiGet("/invoice-reviews"),
      apiGet("/invoices"),
      apiGet("/stats")
    ]);
    setSettings(settingsData);
    setCustomers(customersData);
    setPayments(paymentsData);
    setInvoiceReviews(reviewData);
    setInvoices(invoicesData);
    setStats(statsData);
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
      setMessage(`Rechnung ${invoice.invoice_number} wurde erzeugt und liegt zur Pruefung bereit.`);
      await refreshData();
    } catch (err) {
      setError(readError(err));
    }
  }

  async function reviewInvoice(invoice) {
    setError("");
    setMessage("");
    try {
      await apiPost(`/invoices/${invoice.id}/review`, {});
      setMessage(`Rechnung ${invoice.invoice_number} wurde geprueft und in die History uebernommen.`);
      setConfettiBurst((current) => current + 1);
      await refreshData();
    } catch (err) {
      setError(readError(err));
    }
  }

  async function deleteInvoice(invoice) {
    const confirmed = window.confirm(
      `Rechnung ${invoice.invoice_number} wirklich loeschen? Die Zahlung wird wieder auf EUR bestaetigt gesetzt.`
    );
    if (!confirmed) return;

    setError("");
    setMessage("");
    try {
      const result = await apiDelete(`/invoices/${invoice.id}`);
      setMessage(`Rechnung ${result.deletedInvoiceNumber} wurde geloescht. Letzte Rechnung: ${result.lastInvoiceNumber}.`);
      await refreshData();
    } catch (err) {
      setError(readError(err));
    }
  }

  async function importScreenshot(event) {
    event.preventDefault();
    if (!screenshotFile) {
      setError("Bitte zuerst einen Screenshot auswaehlen.");
      return;
    }

    setError("");
    setMessage("");
    setScreenshotResult(null);
    setScreenshotImporting(true);
    try {
      const dataUrl = await readFileAsDataUrl(screenshotFile);
      const result = await apiPost("/screenshot-imports", {
        fileName: screenshotFile.name,
        dataUrl
      });
      setScreenshotResult(result);
      setMessage(`${result.imported.length} Rechnung(en) aus dem Screenshot erzeugt und zur Pruefung abgelegt.`);
      setScreenshotFile(null);
      await refreshData();
    } catch (err) {
      setError(readError(err));
    } finally {
      setScreenshotImporting(false);
    }
  }

  return (
    <main className="app-shell">
      {confettiBurst > 0 && <Confetti key={confettiBurst} />}
      <header className="topbar">
        <div>
          <h1>KDP Rechnungstool</h1>
          <p>Lokale Rechnungen fuer Amazon-KDP-Zahlungen</p>
        </div>
        <div className="topbar-actions">
          <button
            className="theme-toggle"
            type="button"
            aria-label={theme === "dark" ? "Light Mode aktivieren" : "Dark Mode aktivieren"}
            aria-pressed={theme === "dark"}
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          >
            <ThemeIcon mode={theme} />
          </button>
          <div className="number-chip">
            <span>Letzte Rechnung</span>
            <strong>{settings?.last_invoice_number ?? "..."}</strong>
          </div>
        </div>
      </header>

      <section className="workspace-grid">
        <div className="main-flow">
          <section className="summary-grid" aria-label="Uebersicht">
            <Metric label="Entwuerfe" value={payments.filter((payment) => payment.status === "draft").length} />
            <Metric label="EUR bestaetigt" value={payments.filter((payment) => payment.status === "confirmed").length} />
            <Metric label="Zu pruefen" value={invoiceReviews.length} />
            <Metric label="Rechnungen" value={invoices.length} />
          </section>

          {(message || error) && (
            <section className={error ? "notice notice-error" : "notice"}>
              {error || message}
            </section>
          )}

          <AnalyticsPanel stats={stats} />

          <section className="dashboard-grid">
            <div className="left-stack">
          <section className="panel command-panel">
            <div className="panel-title">
              <h2>Automatisch importieren</h2>
              <p>Screenshot hochladen und Rechnungen direkt zur Pruefung erzeugen.</p>
            </div>
            <form className="upload-row" onSubmit={importScreenshot}>
              <label className="upload-box">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => setScreenshotFile(event.target.files?.[0] ?? null)}
                />
                <span>{screenshotFile ? screenshotFile.name : "Screenshot auswaehlen"}</span>
              </label>
              <button className="primary-button" type="submit" disabled={screenshotImporting}>
                {screenshotImporting ? "Wird gelesen..." : "Automatisch erstellen"}
              </button>
            </form>
            {screenshotResult && (
              <div className="import-result">
                <strong>{screenshotResult.imported.length} neue Rechnung(en)</strong>
                <span>{screenshotResult.skipped.length} vorhandene Zeile(n) uebersprungen</span>
              </div>
            )}
          </section>

          <details className="panel manual-panel">
            <summary>Manuell erfassen</summary>
            <form className="form-panel" onSubmit={savePayment}>
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

              <div className="field-grid compact-fields">
                <label>Zahlungsnummer<input name="paymentNumber" value={form.paymentNumber} onChange={updateField} required /></label>
                <label>Zahlungsdatum<input type="date" name="paymentDate" value={form.paymentDate} onChange={updateField} required /></label>
                <label>Zeitraum von<input type="date" name="salesPeriodStart" value={form.salesPeriodStart} onChange={updateField} required /></label>
                <label>Zeitraum bis<input type="date" name="salesPeriodEnd" value={form.salesPeriodEnd} onChange={updateField} required /></label>
                <label>Originalbetrag<input type="number" step="0.01" name="originalAmount" value={form.originalAmount} onChange={updateField} required /></label>
                <label>
                  Originalwaehrung
                  <select name="originalCurrency" value={form.originalCurrency} onChange={updateField} required>
                    <option>EUR</option><option>USD</option><option>CAD</option><option>GBP</option><option>AUD</option><option>BRL</option><option>MXN</option>
                  </select>
                </label>
                <label>Wechselkurs optional<input type="number" step="0.0001" name="exchangeRate" value={form.exchangeRate} onChange={updateField} /></label>
                <label>EUR laut Kontoauszug<input type="number" step="0.01" name="confirmedEurAmount" value={form.confirmedEurAmount} onChange={updateField} /></label>
              </div>

              <label>
                Status
                <select name="status" value={form.status} onChange={updateField}>
                  <option value="draft">Entwurf</option>
                  <option value="confirmed">EUR bestaetigt</option>
                </select>
              </label>
              <label>Notiz<textarea name="notes" rows="2" value={form.notes} onChange={updateField} /></label>
              <button className="primary-button" type="submit">Zahlung speichern</button>
            </form>
          </details>

          <section className="panel">
            <div className="panel-title">
              <h2>Zahlungen</h2>
              <p>Finalisieren erst nach Konto-Bestaetigung.</p>
            </div>
            <div className="table-wrap">
              <table className="payments-table">
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
            </div>
          </section>
        </div>

        <aside className="panel preview-panel">
          <div className="panel-title">
            <h2>Rechnungsvorschau</h2>
            <p>{previewInvoice ? `${previewInvoice.invoice_number} direkt im Tool pruefen.` : "Noch keine Rechnung ausgewaehlt."}</p>
          </div>
          {previewInvoice ? (
            <iframe className="invoice-preview" title={`Vorschau ${previewInvoice.invoice_number}`} src={`/api/invoices/${previewInvoice.id}/preview`} />
          ) : (
            <div className="preview-empty">Sobald eine Rechnung erzeugt wurde, erscheint hier die Vorschau.</div>
          )}
        </aside>
      </section>

      <section className="panel history-panel">
        <div className="panel-title">
          <h2>Rechnungen pruefen</h2>
          <p>Erzeugte Rechnungen erscheinen erst nach deinem Haken in der History.</p>
        </div>
        <div className="table-wrap">
          <table className="review-table">
            <thead>
              <tr>
                <th>Geprueft</th>
                <th>Rechnung</th>
                <th>Marketplace</th>
                <th>Zahlungsnummer</th>
                <th>EUR</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {invoiceReviews.map((invoice) => (
                <tr key={invoice.id}>
                  <td>
                    <label className="review-check">
                      <input type="checkbox" onChange={() => reviewInvoice(invoice)} />
                      <span>OK</span>
                    </label>
                  </td>
                  <td>{invoice.invoice_number}</td>
                  <td>{invoice.display_name}</td>
                  <td>{invoice.payment_number}</td>
                  <td>{formatAmount(invoice.confirmed_eur_amount)}</td>
                  <td className="invoice-actions">
                    <button className="file-link" type="button" onClick={() => setPreviewInvoiceId(invoice.id)}>Vorschau</button>
                    <a className="file-link" href={`/api/invoices/${invoice.id}/docx`}>Word</a>
                    <button className="danger-button" type="button" onClick={() => deleteInvoice(invoice)}>
                      Loeschen
                    </button>
                  </td>
                </tr>
              ))}
              {invoiceReviews.length === 0 && (
                <tr>
                  <td colSpan="6" className="empty-cell">Keine Rechnungen zur Pruefung.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel history-panel">
        <div className="panel-title">
          <h2>Rechnungshistorie</h2>
          <p>Erzeugte Rechnungen bleiben nachvollziehbar gespeichert.</p>
        </div>
        <div className="table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>Rechnung</th>
                <th>Datum</th>
                <th>Marketplace</th>
                <th>Zahlungsnummer</th>
                <th>EUR</th>
                <th>Aktion</th>
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
                  <td className="invoice-actions">
                    <button className="file-link" type="button" onClick={() => setPreviewInvoiceId(invoice.id)}>Vorschau</button>
                    <a className="file-link" href={`/api/invoices/${invoice.id}/docx`}>Word</a>
                    <button className="danger-button" type="button" onClick={() => deleteInvoice(invoice)}>
                      Loeschen
                    </button>
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

function AnalyticsPanel({ stats }) {
  const countries = stats?.byMarketplace ?? [];
  const maxTotal = Math.max(1, ...countries.map((row) => row.totalEur));
  const monthChange = stats?.latestMonth?.changeFromPreviousMonthPercent ?? 0;
  const changeClass = monthChange >= 0 ? "trend-positive" : "trend-negative";

  return (
    <section className="panel analytics-panel">
      <div className="panel-title">
        <h2>Statistik</h2>
        <p>Einnahmen nach Laendern mit Entwicklung zum Vormonat.</p>
      </div>
      <div className="analytics-grid">
        <div className="analytics-card">
          <span>Gesamtumsatz</span>
          <strong>{formatAmount(stats?.yearTotalEur ?? 0)}</strong>
        </div>
        <div className="analytics-card">
          <span>Umsatz zum Vormonat</span>
          <strong className={changeClass}>{formatPercent(monthChange)}</strong>
        </div>
        <div className="analytics-card">
          <span>Aktueller Monat</span>
          <strong>{stats?.latestMonth?.month ?? "-"}</strong>
        </div>
      </div>
      <div className="country-chart" aria-label="Einnahmen nach Laendern">
        <h3>Einnahmen nach Laendern</h3>
        {countries.length > 0 ? (
          countries.map((row) => (
            <div className="country-bar" key={row.marketplace}>
              <span>{row.marketplace}</span>
              <div><i style={{ width: `${Math.max(8, (row.totalEur / maxTotal) * 100)}%` }} /></div>
              <strong>{formatAmount(row.totalEur)}</strong>
            </div>
          ))
        ) : (
          <p className="muted-text">Noch keine bestaetigten EUR-Zahlungen fuer die Statistik.</p>
        )}
      </div>
    </section>
  );
}

function ThemeIcon({ mode }) {
  const isDark = mode === "dark";
  return (
    <svg className="theme-icon" viewBox="0 0 24 24" aria-hidden="true">
      {isDark ? (
        <path d="M12 3.5a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Zm0 14a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11Zm0 3a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1ZM3.5 12a1 1 0 0 1 1-1h1a1 1 0 1 1 0 2h-1a1 1 0 0 1-1-1Zm14 0a1 1 0 0 1 1-1h1a1 1 0 1 1 0 2h-1a1 1 0 0 1-1-1ZM5.64 5.64a1 1 0 0 1 1.41 0l.71.71a1 1 0 1 1-1.41 1.41l-.71-.71a1 1 0 0 1 0-1.41Zm10.6 10.6a1 1 0 0 1 1.41 0l.71.71a1 1 0 0 1-1.41 1.41l-.71-.71a1 1 0 0 1 0-1.41Zm2.12-10.6a1 1 0 0 1 0 1.41l-.71.71a1 1 0 0 1-1.41-1.41l.71-.71a1 1 0 0 1 1.41 0ZM7.76 16.24a1 1 0 0 1 0 1.41l-.71.71a1 1 0 0 1-1.41-1.41l.71-.71a1 1 0 0 1 1.41 0Z" />
      ) : (
        <path d="M20.2 14.6A8.2 8.2 0 0 1 9.4 3.8a.8.8 0 0 0-.86-1.21 10 10 0 1 0 12.87 12.87.8.8 0 0 0-1.21-.86Z" />
      )}
    </svg>
  );
}

function Confetti() {
  return (
    <div className="confetti-layer" aria-hidden="true">
      {Array.from({ length: 28 }, (_, index) => (
        <span key={index} style={{ "--i": index, "--x": `${(index * 37) % 100}%` }} />
      ))}
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

function formatPercent(value) {
  const sign = Number(value) > 0 ? "+" : "";
  return `${sign}${Number(value).toFixed(2).replace(".", ",")} %`;
}

function readError(err) {
  try {
    return JSON.parse(err.message).error ?? err.message;
  } catch {
    return err.message;
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
