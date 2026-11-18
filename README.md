# PaymentTracker

App desktop (macOS + Windows 11) per la gestione delle spese mensili, ispirata
al tuo foglio Excel "50-30-20". Costruita con **Tauri 2 + React 19 + TypeScript +
Tailwind CSS v4 + Motion**. I dati restano in locale sul tuo computer in un file
JSON; tutti gli importi sono salvati in **centesimi interi** per evitare errori
di arrotondamento.

## Cosa fa

- **Mese corrente** — tabelle di spesa per categoria (Bisogni / Sfizi /
  Risparmi, o categorie tue). Ogni tabella si **allunga da sola**: appena
  compili l'ultima riga ne compare un'altra. C'è anche la tabella **Entrate
  della casa**. In alto vedi Entrate, Spese e il **Rimanente**: verde se sei in
  surplus, rosso se in deficit.
- **Chiudi mese** — quando il mese (da stipendio a stipendio) è finito, premi
  "Chiudi mese": l'app calcola il surplus/deficit, tu lo **confermi o lo
  modifichi**, e la cifra viene aggiunta al saldo del conto. Parte
  automaticamente un nuovo mese con le stesse categorie.
- **Riepilogo mesi** — tutti i mesi con entrate, spese e risultato.
- **Conto** — lo storico di tutti i movimenti (chiusure mese + cifre
  straordinarie aggiunte a mano), con data, importo, **saldo progressivo** e
  nota. Puoi aggiungere/modificare/eliminare i movimenti.

## Sviluppo

```bash
npm install
npm run tauri dev      # avvia l'app in modalità sviluppo
```

## Build dell'app installabile

```bash
npm run tauri build    # genera il bundle in src-tauri/target/release/bundle/
```

Su macOS produce `.app` / `.dmg`; su Windows 11 (eseguendo lo stesso comando là)
produce `.msi` / `.exe`.

## Dove sono i dati

Il file `paymenttracker.json` viene salvato nella cartella dati dell'app:

- macOS: `~/Library/Application Support/com.daniel1804.paymenttracker/`
- Windows: `%APPDATA%\com.daniel1804.paymenttracker\`

## Struttura

```
src/
  types.ts            modello dati (importi in centesimi)
  money.ts            formattazione/parsing EUR (it-IT)
  storage.ts          persistenza JSON (Tauri store, fallback localStorage)
  store.ts            stato + logica (Zustand) e totali derivati
  components/         AmountInput, CategoryTable, Modal, Sidebar, icone…
  views/              CurrentMonth, Summary, Account
```
