# KDP Rechnungstool

Lokale Browser-App fuer Amazon-KDP-Rechnungen.

## Starten

Am einfachsten:

1. `start-rechnungstool.bat` doppelklicken.
2. Die App oeffnet sich automatisch im Browser unter `http://127.0.0.1:5174`.
3. Das Server-Fenster offen lassen, solange du die App benutzt.

## Manuell starten

```powershell
npm install
npm run build
npm run server
```

Dann im Browser oeffnen:

```text
http://127.0.0.1:5174
```

## Wichtige Regeln

- Jede KDP-Zahlungszeile wird eine eigene Rechnung.
- Rechnungen werden immer in EUR erstellt.
- Eine Rechnung kann erst erzeugt werden, wenn der EUR-Betrag laut Kontoauszug erfasst ist.
- Die Rechnungsnummer wird erst beim finalen Erzeugen vergeben.
- Lokale Datenbank und erzeugte Rechnungen liegen unter `server/data` und werden nicht zu GitHub hochgeladen.

## Tests

```powershell
npm test
npm run build
```
