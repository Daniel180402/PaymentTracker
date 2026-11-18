# PaymentTracker

Un'app per tenere sotto controllo le spese di casa, mese per mese, da uno stipendio al successivo.

Carichi l'estratto conto della banca, l'app trova lo stipendio e ti mette davanti tutte le spese arrivate dopo. Tu dici cos'è ogni spesa e in quale categoria va, e a fine mese vedi subito se hai risparmiato o sforato. I dati restano a casa tua: niente cloud, niente account, niente pubblicità.

Puoi usarla in due modi:

- **come sito in casa**, con Docker, raggiungibile da PC, tablet e telefono collegati alla stessa rete;
- **come app desktop** per macOS e Windows, con i dati salvati sul computer.

## Cosa sa fare

**Il mese, da stipendio a stipendio.** Ogni mese ha le sue entrate e le sue categorie di spesa (per partire: Bisogni, Sfizi, Risparmi, ma puoi rinominarle e aggiungerne). In alto vedi entrate, spese e il risultato del mese, verde se sei in attivo e rosso se sei in passivo.

**Import dell'estratto conto.** Carichi il PDF "Lista movimenti" di Intesa Sanpaolo e l'app:

- trova l'accredito di stipendio più recente e lo mette nelle entrate;
- porta tutti i movimenti successivi nella lista **Da classificare**, dove per ognuno scrivi cos'è e scegli la categoria;
- si ricorda le tue scelte, così al prossimo import gli esercenti abituali (il supermercato, il distributore, l'affitto) arrivano già compilati;
- non crea doppioni se carichi lo stesso estratto più volte, e aggiorna da solo i pagamenti che la banca segnava "in attesa".

**Entrate extra.** Quando arriva un bonifico, l'app ti chiede che entrata è: contributo per le spese di casa, tredicesima o quattordicesima, rimborso, regalo. Uno storno può invece ridurre la spesa di una categoria, così un reso non gonfia le entrate.

**Chiusura del mese.** Se carichi un estratto che contiene già il nuovo stipendio, l'app ti chiede se è l'import di chiusura: le spese fino al nuovo stipendio completano il mese corrente e quelle dopo vanno nel mese nuovo. Se invece quell'accredito era una tredicesima, glielo dici e resta tutto nel mese in corso.

**Il conto.** Quando chiudi un mese, il suo risultato finisce nel conto con il saldo progressivo. Puoi inserire a mano i mesi precedenti all'app e un saldo di partenza, così il saldo corrisponde a quello reale, e aggiungere movimenti straordinari.

**Riepilogo.** Tutti i mesi in una pagina, con entrate, spese e risultato di ciascuno.

## Usarla in casa con Docker

È il modo consigliato se vuoi aprirla da più dispositivi. Ti serve un computer sempre acceso in casa con Docker: un mini PC, un NAS, un Raspberry Pi o anche il computer di tutti i giorni.

```bash
git clone https://github.com/Daniel180402/PaymentTracker.git
cd PaymentTracker
docker compose up -d
```

Dopo pochi secondi l'app risponde su `http://localhost:8080`. Dagli altri dispositivi apri `http://INDIRIZZO-DEL-COMPUTER:8080`, dove l'indirizzo è quello del computer nella rete di casa (per esempio `192.168.1.20`). Lo trovi nelle impostazioni di rete del computer oppure nella pagina del router.

Tutti i dispositivi vedono gli stessi dati. Se due persone modificano qualcosa nello stesso momento, l'app non sovrascrive il lavoro dell'altro: carica la versione più recente e avvisa che l'ultima modifica va rifatta. Se il server è spento, le modifiche restano sul dispositivo e vengono salvate appena torna raggiungibile.

### Password

Di base l'app è aperta a chiunque sia collegato alla tua rete. Per chiedere nome utente e password togli il commento a queste righe in `docker-compose.yml` e scegli i tuoi valori:

```yaml
PT_USER: casa
PT_PASSWORD: cambiami
```

Poi riavvia con `docker compose up -d`. La password viaggia in chiaro sulla rete di casa, quindi non esporre l'app su internet aprendo porte sul router. Se vuoi raggiungerla da fuori casa usa una VPN come Tailscale o WireGuard.

### Dove sono i dati e i backup

I dati stanno nel volume Docker `paymenttracker-data`, in un unico file `paymenttracker.json`. Ogni giorno, alla prima modifica, l'app ne salva una copia nella cartella `backups` dello stesso volume e tiene le ultime 30 (il numero si cambia con `PT_BACKUPS`).

Per copiare i dati sul tuo computer:

```bash
docker compose cp paymenttracker:/data ./paymenttracker-backup
```

### Aggiornare

```bash
git pull
docker compose up -d --build
```

I dati restano nel volume e non vengono toccati.

### Raspberry Pi e NAS

L'immagine si costruisce per l'architettura del computer su cui lanci il comando, quindi su un Raspberry Pi basta `docker compose up -d`. Per costruirla su un computer e usarla su un altro:

```bash
docker buildx build --platform linux/arm64 -t paymenttracker:latest --load .
```

### Portare i dati dall'app desktop

L'app desktop salva i dati nello stesso formato del server. Su macOS si trovano in `~/Library/Application Support/com.daniel1804.paymenttracker/paymenttracker.json`, su Windows in `%APPDATA%\com.daniel1804.paymenttracker\`. Per copiarli nel server (esempio per macOS):

```bash
docker compose stop
docker run --rm \
  -v paymenttracker_paymenttracker-data:/data \
  -v "$HOME/Library/Application Support/com.daniel1804.paymenttracker":/src:ro \
  alpine sh -c 'cp /src/paymenttracker.json /data/ && chown 65534:65534 /data/paymenttracker.json'
docker compose start
```

### Perché è leggera

L'immagine pesa circa 9 MB e a riposo usa circa 7 MB di RAM, quindi gira tranquillamente anche su un Raspberry Pi accanto ad altri servizi.

- Il server è un unico programma in Go, senza dipendenze esterne, con l'app web incorporata.
- L'immagine parte da `scratch`: dentro non c'è un sistema operativo, nemmeno una shell, e il programma non gira come root.
- I file dell'app sono compressi una volta sola durante la build (brotli e gzip, da 1,8 MB a circa 440 KB) e serviti dalla memoria.
- I file con l'hash nel nome restano nella cache del browser per sempre, quindi dalla seconda apertura in poi si scarica quasi nulla.
- Il salvataggio scrive su un file temporaneo e poi lo sostituisce, così un'interruzione di corrente non lascia mai un file a metà.
- In `docker-compose.yml` il container è in sola lettura, senza privilegi aggiuntivi e con limiti di memoria e CPU.

## L'app desktop

È costruita con Tauri, quindi è un'app nativa leggera per macOS e Windows. Ti servono Node.js e Rust.

```bash
npm install
npm run tauri build
```

Il pacchetto installabile viene creato in `src-tauri/target/release/bundle/` (`.app` e `.dmg` su macOS, `.msi` ed `.exe` su Windows, lanciando il comando su Windows). L'app desktop salva i dati sul computer e non si collega al server di casa.

## Sviluppo

```bash
npm install
npm run dev          # app nel browser su http://localhost:1420 (dati nel browser)
npm run tauri dev    # app desktop in modalità sviluppo
npm test             # test del frontend
```

Per controllare il parser su un estratto conto vero, senza aggiungerlo al repository:

```bash
STATEMENT_PDF=~/Downloads/lista_operazioni.pdf npm test
```

I test del server Go si possono lanciare anche senza Go installato:

```bash
docker run --rm -v "$PWD/server":/src -w /src golang:1.25-alpine go test ./...
```

Tutti gli importi sono salvati in centesimi interi, per evitare errori di arrotondamento.

### Come è fatto

```
src/                 app React + TypeScript + Tailwind
  import/            lettura del PDF della banca e unione dei movimenti nel mese
  components/        tabelle, finestre di dialogo, pannello "Da classificare"
  views/             Mese corrente, Riepilogo mesi, Conto
  store.ts           stato dell'app e calcoli
  storage.ts         salvataggio: file (desktop), server di casa o browser
server/              server Go per la versione Docker
src-tauri/           guscio dell'app desktop
Dockerfile           build in tre fasi: app web, server, immagine finale
docker-compose.yml   configurazione pronta per casa
```

## Altre banche

Per ora l'import legge l'esportazione "Lista movimenti" in PDF di Intesa Sanpaolo. Il resto dell'app funziona con qualsiasi banca, inserendo le voci a mano. Il parser è in `src/import/intesa.ts` e il formato dei movimenti in `src/import/types.ts`: aggiungere un'altra banca vuol dire scrivere un parser che produca la stessa lista di movimenti.
