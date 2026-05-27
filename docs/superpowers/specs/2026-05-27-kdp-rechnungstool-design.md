# KDP Rechnungstool Design

Datum: 2026-05-27

## Ziel

Das Tool erstellt lokale Rechnungen fuer Amazon-KDP-Tantiemen. Jede KDP-Zahlungszeile wird als eigene Rechnung behandelt, weil je Marketplace eine andere Amazon-Gesellschaft, Anschrift und VAT/Tax-ID gelten kann.

Die App startet mit manueller Datenerfassung und wird so aufgebaut, dass spaeter Screenshots, Amazon-KDP-Daten und Kontoauszuege automatisch eingelesen werden koennen.

## Grundsatzentscheidungen

- Die App wird eine lokale Browser-App.
- Jede Zahlungszeile erzeugt genau eine Rechnung.
- Sammelrechnungen werden nicht unterstuetzt.
- Rechnungen werden immer in EUR erstellt.
- Fremdwaehrungsdaten werden zur Nachvollziehbarkeit gespeichert, aber der finale Rechnungsbetrag ist der EUR-Zahlungseingang laut Kontoauszug.
- Eine finale Rechnung darf erst erzeugt werden, wenn der EUR-Betrag vom Kontoauszug bestaetigt wurde.
- Die Rechnungsnummer wird erst beim finalen Erzeugen vergeben, damit keine Luecken durch Entwuerfe entstehen.
- Erzeugte Rechnungen werden in einer Historie gespeichert und duerfen nicht versehentlich neu nummeriert oder ueberschrieben werden.

## Nutzerworkflow Phase 1

1. Nutzer oeffnet die lokale Browser-App.
2. Nutzer erfasst eine neue KDP-Zahlungszeile manuell.
3. Nutzer waehlt den Marketplace aus, zum Beispiel Amazon.de, Amazon.com, Amazon.ca oder Amazon.co.uk.
4. App fuellt passende Amazon-Kundenstammdaten automatisch.
5. Nutzer traegt Zahlungsnummer, Verkaufszeitraum, Zahlungsdatum, Originalbetrag, Originalwaehrung und EUR-Betrag laut Kontoauszug ein.
6. App prueft, ob der EUR-Betrag vorhanden ist.
7. Nutzer erzeugt die finale Rechnung.
8. App vergibt die naechste fortlaufende Rechnungsnummer.
9. App erzeugt eine DOCX-Rechnung im bestehenden Layout und optional spaeter eine PDF-Version.
10. App speichert den Vorgang in der Historie.

## App-Bereiche

### Dashboard

Das Dashboard zeigt eine kurze Uebersicht:

- vorbereitete Entwuerfe
- Zahlungen mit bestaetigtem EUR-Betrag
- erzeugte Rechnungen
- letzte vergebene Rechnungsnummer

### Zahlung Erfassen

Die Eingabemaske enthaelt:

- Marketplace
- Zahlungsnummer
- Verkaufszeitraum von/bis oder als formatierter Text
- Zahlungsdatum
- Originalbetrag
- Originalwaehrung
- EUR-Betrag laut Kontoauszug
- optional Wechselkurs
- Notizfeld fuer interne Hinweise
- Status

Statuswerte:

- Entwurf
- EUR bestaetigt
- Rechnung erzeugt

### Kundenstammdaten

Die App speichert pro Marketplace:

- Marketplace-Code, zum Beispiel amazon.de
- Anzeigename, zum Beispiel Amazon.de
- Amazon-Firmenname
- Rechnungsanschrift
- VAT- oder Tax-ID
- Standard-Leistungstext, zum Beispiel KDP Buecher-Honorare amazon.de

Die Stammdaten koennen am Anfang fest vorkonfiguriert sein. Eine Bearbeitungsmaske ist sinnvoll, damit Adressen spaeter korrigiert oder neue Marketplaces ergaenzt werden koennen.

### Rechnungserzeugung

Die Rechnungserzeugung verwendet ein DOCX-Template oder eine programmatisch nachgebaute Vorlage auf Basis der vorhandenen Beispielrechnungen.

Beim finalen Erzeugen:

- prueft die App, ob der Datensatz noch keine Rechnungsnummer hat
- prueft die App, ob ein EUR-Betrag bestaetigt ist
- ermittelt die naechste Rechnungsnummer
- erzeugt den Dateinamen, zum Beispiel RE202614.docx
- schreibt die Rechnung in den Exportordner
- speichert Rechnungsnummer, Erzeugungszeitpunkt und Dateipfad
- sperrt die Kerndaten gegen versehentliche Veraenderung

### Historie

Die Historie zeigt alle erzeugten Rechnungen mit:

- Rechnungsnummer
- Rechnungsdatum
- Marketplace
- Amazon-Kunde
- Zahlungsnummer
- Verkaufszeitraum
- EUR-Betrag
- Dateipfad

## Datenmodell

### MarketplaceCustomer

- id
- marketplace
- displayName
- companyName
- addressLines
- taxLabel
- taxId
- serviceDescription
- active

### PaymentRecord

- id
- marketplaceCustomerId
- paymentNumber
- salesPeriodStart
- salesPeriodEnd
- paymentDate
- originalCurrency
- originalAmount
- exchangeRate
- confirmedEurAmount
- status
- notes
- createdAt
- updatedAt

### Invoice

- id
- paymentRecordId
- invoiceNumber
- invoiceDate
- outputDocxPath
- outputPdfPath
- createdAt
- locked

### Settings

- invoicePrefix, zum Beispiel RE
- invoiceYear, zum Beispiel 2026
- lastInvoiceSequence
- exportDirectory

## Rechnungsnummern

Das bestehende Muster ist RE plus Jahr plus laufende Nummer, zum Beispiel RE202613. Diese Nummer wird als RE + 2026 + 13 gelesen. Die naechste Nummer nach RE202613 ist daher RE202614.

Die Sequenz wird fuer einstellige Werte zweistellig geschrieben, zum Beispiel RE202606. Ab 10 laeuft sie ohne Trennzeichen weiter, zum Beispiel RE202613 und RE202614.

Fuer Phase 1 wird die App die letzte bekannte Rechnungsnummer aus den Einstellungen lesen. Beim finalen Erzeugen wird die Sequenz um 1 erhoeht. Die Nummer wird erst gespeichert, nachdem die Rechnung erfolgreich erzeugt wurde.

Wenn die Erzeugung fehlschlaegt, darf keine Rechnungsnummer verbraucht werden.

## Validierung

Pflichtfelder fuer finale Rechnung:

- Marketplace
- Zahlungsnummer
- Verkaufszeitraum
- Zahlungsdatum
- EUR-Betrag laut Kontoauszug
- aktive Kundenstammdaten

Fehlerfaelle:

- kein bestaetigter EUR-Betrag: Rechnungserzeugung blockieren
- doppelte Zahlungsnummer fuer denselben Marketplace: Warnung anzeigen
- Rechnungsnummer bereits vergeben: Erzeugung blockieren
- Exportdatei existiert bereits: nicht automatisch ueberschreiben

## DOCX-Ausgabe

Die erste Version soll das vorhandene Rechnungsbild moeglichst genau nachbilden:

- Amazon-Empfaenger oben links
- eigene Absenderdaten
- Leistungszeitraum
- Zahlungsnummer
- Rechnungsdatum
- Rechnungsnummer
- Positionstabelle mit 1 Stk., Leistungstext, Einzelpreis, Gesamtpreis
- Umsatzsteuer 0,00 EUR
- Gesamtbetrag in EUR
- Hinweis zur Steuerfreiheit durch Uebergang der Steuerschuld
- Zahlungsformulierung

Die genaue Layout-Umsetzung wird anhand der vorhandenen Beispiel-DOCX-Dateien abgeleitet.

## Phase 2 Automatisierung

Spaeter werden Importfunktionen ergaenzt:

- Screenshot-Upload fuer Amazon-KDP-Zahlungsuebersichten
- Erkennung von Marketplace, Zahlungsnummer, Verkaufszeitraum, Zahlungsdatum, Originalbetrag und Originalwaehrung
- Kontoauszug-Import oder manuelle Kontoauszugs-Erfassung
- Abgleich zwischen KDP-Zahlung und EUR-Kontoeingang
- Kontrollansicht vor finaler Rechnungserzeugung

Die manuelle Phase verwendet bereits dasselbe Datenmodell, damit die Automatisierung spaeter nur Daten in bestehende Felder fuellt.

## Technische Richtung

Empfohlener Aufbau:

- lokale Web-App mit React-Frontend
- lokales Node/Express-Backend
- SQLite-Datenbank fuer Zahlungen, Stammdaten, Rechnungen und Einstellungen
- Backend-Endpunkte fuer Daten, Rechnungserzeugung und Dateiexport
- Frontend fuer Dashboard, Eingabe, Stammdaten und Historie
- DOCX-Erzeugung ueber ein Template oder python-docx

Die App soll ohne Cloud-Zwang funktionieren, weil Rechnungen, Kontoauszuege und Steuerunterlagen lokal bleiben sollen.

## Offene Detailpunkte fuer die Umsetzung

- genaue Zieltechnologie fuer die lokale App
- Speicherort fuer App-Datenbank und Exportordner
- ob PDFs bereits in Phase 1 erzeugt werden muessen oder erst nach dem DOCX-Prototyp
- vollstaendige Liste aller Amazon-Marketplace-Adressen und VAT/Tax-IDs
- exakte Startnummer fuer die naechste Rechnung
