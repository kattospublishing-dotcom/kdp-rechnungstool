# KDP Rechnungstool - Projektbeschreibung fuer Claude Code

Stand: 2026-05-28

## Ziel des Tools

Das Tool erstellt lokale Word-Rechnungen fuer Amazon-KDP-Tantiemen. Jede einzelne Zahlungszeile bekommt eine eigene fortlaufende Rechnungsnummer, weil je Marketplace unterschiedliche Rechnungsempfaenger, Anschriften und Steuerdaten verwendet werden.

## Aktueller Funktionsstand

- Browser-App unter `http://127.0.0.1:5174`
- Lokale SQLite-Datenbank unter `server/data/kdp-rechnungstool.sqlite`
- Word-Rechnungserstellung im Layout von Kattos Publishing
- Fortlaufende Rechnungsnummern ab `RE202614`, Baseline nach Loeschungen ist `RE202613`
- Automatische Selbstheilung des Rechnungsnummernzaehlers beim Laden von `/api/settings`
- Marketplace-Rechnungsempfaenger aus `Amazon Rechnungsempfaenger.docx`
- Screenshot-Import fuer Amazon-KDP-Zahlungsuebersichten per OCR
- Manuelle Zahlungserfassung als Fallback
- Pruef-Workflow: Rechnung erscheint erst nach Haken in der Historie
- Konfetti-Animation nach erfolgreicher Pruefung
- Word-Download direkt aus der App
- HTML-Rechnungsvorschau im Tool ueber `/api/invoices/:id/preview`
- Dark Mode mit Icon-Umschalter
- Statistik-API und Dashboard fuer Einnahmen nach Land und Monatsvergleich

## Wichtige Dateien

- `server/index.js` startet Express und serviert API plus gebaute App
- `server/routes.js` enthaelt API-Routen, Preview, Statistik, Loeschlogik und Zaehler-Reparatur
- `server/invoiceDocument.js` erzeugt die Word-Rechnung
- `server/invoicePreview.js` erzeugt die HTML-Vorschau
- `server/screenshotImport.js` liest KDP-Screenshots aus
- `server/db.js` definiert Schema und Rechnungsempfaenger
- `src/App.jsx` ist die React-App
- `src/styles.css` enthaelt Dark Mode, Dashboard, Animationen und Layout
- `tests/routes.test.js` testet API, Nummernlogik, Preview, Statistik und Import
- `tests/darkMode.test.js` testet UI-Struktur und wichtige CSS/React-Signale

## Start

1. In den Projektordner wechseln.
2. Abhaengigkeiten installieren, falls noetig: `npm install`
3. App bauen: `npm run build`
4. Lokalen Server starten: `npm run server`
5. Browser oeffnen: `http://127.0.0.1:5174`

Alternativ kann `start-rechnungstool.bat` verwendet werden.

## Aktuelle offene Ziele des Users

- Optik weiter hochwertiger und dashboard-tauglicher machen
- Rechnungsvorschau noch staerker wie ein echtes Dokument wirken lassen
- Dashboard spaeter in ein groesseres Tool-Center integrieren
- Screenshot-Import robuster machen, falls OCR bei echten Screenshots Fehler macht
- Statistik erweitern:
  - Umsatzsteigerung oder Umsatzverlust zum Vormonat
  - Vergleich zum Vorjahr
  - Laenderentwicklung als Kurvenmodell
  - Monats- und Jahresfilter
- Automatisierung ausbauen:
  - Screenshot hochladen
  - Zahlungszeilen erkennen
  - Rechnungen erzeugen
  - User prueft mit Haken
  - Danach Ablage in Historie
- UI-Feinschliff:
  - ruhigere Informationsarchitektur
  - bessere Buttons und Micro-Animationen
  - optisch mehr Premium-Dashboard statt Formularsammlung

## Kritische Logik

Der Rechnungsnummernzaehler darf nie nur blind dekrementiert werden. Er muss aus den tatsaechlich vorhandenen Rechnungen berechnet werden:

- Wenn Rechnungen vorhanden sind: hoechste vorhandene Rechnungsnummer ist `last_invoice_number`
- Wenn keine Rechnungen vorhanden sind: `last_invoice_number` ist `RE202613`

Diese Logik liegt in `reconcileInvoiceCounter(db)` in `server/routes.js` und wird beim Laden von `/api/settings` ausgefuehrt.

## Tests

Aktuell relevant:

```powershell
npm test
npm run build
```

Letzter bekannter Stand: beide Befehle laufen erfolgreich.

## Hinweis zur lokalen Datenbank

Die Datenbank wird nicht in Git versioniert. Fuer Entwicklung mit Beispieldaten kann die App selbst genutzt werden. Aktuell wurde die lokale Beispiel-Rechnung geloescht und der Zaehler auf `RE202613` gesetzt.
