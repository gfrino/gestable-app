# GestaVOIP

Softphone per iPhone e Android collegato a Odoo: il telefono dell'ufficio in tasca.

Usa il modulo Odoo **VOIP AI** (`ai_telemarketing_twilio`, repo
`gfrino/tw-ai-marketing-automation`, dalla versione 17.0.2.36.0 / 19.0.2.36.0) e
Twilio Voice. E' lo stesso softphone che gira dentro Odoo e nell'app desktop:
stesso centralino, stesso interno, stesse note sul contatto a fine chiamata.

## Cosa fa

L'app ha due modi, scelti dal server al primo passo dell'accesso:

- **Con VOIP AI** (2.36 o successiva): telefono e Odoo. Le schede sono
  Tastierino, Recenti, **Odoo** e Impostazioni.
- **Senza VOIP AI** (modulo assente o troppo vecchio): l'app e' Odoo a tutto
  schermo, come l'app desktop, senza telefono. L'accesso lo fa la pagina di
  login di Odoo (scelta del database, doppio fattore, accesso con Google).

In tutti e due i casi Odoo e' una vista web (`src/ui/VistaOdoo.tsx`) che usa la
stessa sessione dell'app. I numeri cliccati in Odoo partono dal softphone se
c'e', altrimenti dal telefono del sistema; i link verso altri siti si aprono
nel browser.

Il menu ☰ (in alto a sinistra in ogni scheda) prende il posto della barra in
alto di Odoo:

- **Presenze**: entrata e uscita (il pallino rosso/verde di Odoo), con le ore di oggi.
- **Messaggi**: le chat e i canali di Discuss (bolle, invio, segnate lette
  all'apertura) e le **Notifiche** (la posta in arrivo di Odoo); toccarne una
  apre il record in Odoo.
- **Attività**: in ritardo, oggi, prossime; un tocco apre il record, la spunta
  la segna fatta.
- **Impostazioni** del telefono, ed **Esci**.

I numeri accanto a Messaggi e Attività si contano come in Odoo (notifiche più
chat con qualcosa da leggere; attività di oggi e in ritardo).

La scheda **Contatti** (dopo Recenti) cerca nei contatti di Odoo per nome,
azienda, email o numero, con i filtri Tutti / Aziende / Persone e la lista a
pagine con le lettere; senza ricerca nasconde i nomi che iniziano con simboli
(numeri «+41…» creati dalle chiamate, «"Nome" <email>» creati dalle email).
La scheda del contatto ha Chiama (dal telefono dell'app), Messaggio, Email,
Mappa, i recapiti, le etichette, le note e, per le aziende, le persone; **+**
crea una persona o un'azienda. Odoo 19 non ha il campo cellulare: i campi si
leggono dal server.

La scheda **Calendario** (fra Contatti e Odoo) mostra i miei appuntamenti di
Odoo una settimana alla volta: giorni da scorrere di lato con un pallino dove
c'è qualcosa, l'agenda del giorno (in corso evidenziato), il dettaglio con
luogo, videochiamata, partecipanti e risposta all'invito (Ci sono / Forse / No),
e **+** per un appuntamento nuovo (titolo, giorno, ora, durata, luogo, note).
Toccato di nuovo, il tasto Calendario torna a oggi.

Nella scheda **Odoo** la barra in alto di Odoo è nascosta: il pulsante a destra
apre il pannello di Odoo (sottomenu dell'app e utente), e il tasto Odoo in
basso porta sempre alla **home**, la griglia delle app con ricerca, presa dal
menu di Odoo (`src/ui/odooIniettato.ts`, Odoo 17 e 19). Il softphone web di VOIP
AI dentro l'app non si collega a Twilio: il telefono è l'app.

Con il telefono:

- **Accesso** con l'indirizzo di Odoo, email e password. Il server viene
  verificato prima della password e mostra il nome dell'azienda. Con la
  verifica in due passaggi attiva in Odoo l'app chiede poi il codice (app di
  autenticazione o email) e lo passa alla pagina `/web/login/totp` di Odoo,
  senza la casella «ricorda il dispositivo»: con lo User-Agent dell'app Odoo
  17 e 19 rispondono 500.
- **Tastierino** sempre utilizzabile: dalla terza cifra mostra fino a due
  contatti di Odoo sopra i tasti (solo quelli con un nome), e il pulsante
  **Nome** apre la ricerca per nome o azienda con la tastiera del telefono.
- **Chiamate in arrivo** dal centralino o sul numero diretto, anche con l'app
  chiusa e il telefono bloccato: squillo e schermata li fa il sistema
  (CallKit su iPhone, notifica a tutto schermo su Android).
- **In chiamata**: muto, tastierino (toni), vivavoce e Bluetooth, attesa,
  trasferimento a un collega.
- **Recenti**: le proprie chiamate dal registro di Odoo, un tocco richiama.
- **Impostazioni**: disponibile / non disponibile, ricezione delle chiamate del
  centralino, interno e numero diretto, uscita.

## Solo server autorizzati da ticinoWEB

L'app funziona solo con gli Odoo che ticinoWEB ha messo nella lista, nell'Odoo
interno (modulo `tw_app_allowlist`, repo `gfrino/extra-addons-tw-internal-ticinoweb-only`,
menu **App GestABLE › Server autorizzati**). La lista si scarica da
`https://ticinoweb.online/tw_app/allowlist`, firmata Ed25519: nell'app c'e'
solo la chiave pubblica (`src/odoo/autorizzati.ts`).

- All'accesso: un server fuori lista e' rifiutato prima della password.
- All'avvio: chi era dentro un server tolto dalla lista viene fatto uscire.
- Senza rete vale l'ultima lista valida, fino a 30 giorni; senza nessuna lista
  valida un nuovo accesso non parte (chi e' gia' dentro resta).

Il controllo protegge l'app pubblicata sugli store: chi ricompila il codice
(repo pubblico) puo' toglierlo.

## Come funziona

| Pezzo | Dove |
|---|---|
| Login | `/ai_telemarketing/mobile/info` (nome del database), poi il login standard `/web/session/authenticate`. La sessione e' il cookie di Odoo, gestito dal sistema. |
| Token Twilio | `/ai_telemarketing/voice/token` con `platform` = `ios`/`android`: il server aggiunge la Push Credential |
| Presenza | `/voice/availability` con `push: true`: il centralino fa squillare il telefono anche senza battito |
| Fine chiamata, contatti, colleghi, trasferimento | le stesse route del softphone in Odoo |

Codice: `src/odoo/` (Odoo), `src/voip/` (telefono e API), `src/app/` (schermate,
Expo Router), `src/ui/` (tema e componenti).

Icone, splash e logo in `assets/` vengono dal logo GestABLE (originale in
`DEVELOPMENT/GestABLE/Grafiche`, fuori da questo repo); i colori del tema in
`src/ui/tema.ts` sono quelli del logo.

Il telefono gestisce esplicitamente i tre guasti che fanno perdere chiamate:
token che scade (rinnovo 5 minuti prima), rete che cade (si riprova con attese
crescenti, senza arrendersi), telefono che si risveglia dopo ore (si
ri-registra a ogni ritorno in primo piano).

## Stack

Expo SDK 57 (React Native 0.86, New Architecture), Expo Router, TypeScript,
`@twilio/voice-react-native-sdk` 1.8.1 (con il suo plugin Expo), React Native
Firebase 27 (le push Android passano da Firebase Cloud Messaging; Crashlytics per
i crash).

SDK 57 e non 58: il SDK Twilio Voice 1.8.1 e' verificato fino alla 57.

## Cosa serve prima di poter ricevere chiamate

Nessuna di queste cose e' facoltativa per le chiamate in arrivo. Quelle in
uscita funzionano anche senza.

1. **Certificato VoIP Services di Apple** per `com.ticinoweb.gestavoip`, caricato
   su Twilio come Push Credential di tipo APN.
2. **Progetto Firebase** con le app iOS e Android `com.ticinoweb.gestavoip`:
   `google-services.json` e `GoogleService-Info.plist` in questa cartella (sono
   nel `.gitignore`), e la chiave dell'account di servizio FCM caricata su
   Twilio come Push Credential di tipo FCM.
3. In Odoo, menu **VOIP AI > Impostazioni**, scheda **Twilio**, riquadro **App GestaVOIP (telefono)**: i due
   SID delle Push Credential (iniziano con `CR`).
4. Il softphone abilitato sull'utente che accede.

Senza i file di Firebase l'app si compila lo stesso: mancano le push Android e
i report dei crash.

## Costruirla

Expo Go non basta: il SDK Twilio ha codice nativo e serve una development build.

```bash
npm install
npx expo run:ios        # serve un iPhone vero per le chiamate: il simulatore non ha CallKit e PushKit
npx expo run:android
```

Due trappole della build locale:

- **Non da iCloud Drive.** Il percorso `Mobile Documents` ha uno spazio e lo
  script di Xcode che impacchetta il JavaScript (generato da React Native) non lo
  regge; iCloud inoltre scarica dal disco pezzi di `node_modules`. Si compila da
  una copia fuori da iCloud, con un `npm install` fatto li':

  ```bash
  rsync -a --exclude node_modules --exclude ios --exclude android --exclude .expo ./ ~/.cache/gestavoip-build/
  cd ~/.cache/gestavoip-build && npm install
  LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 GESTAVOIP_APS_ENV=development npx expo run:ios
  ```

  `LANG` serve a CocoaPods, che senza UTF-8 si ferma con un errore di codifica.
- **iOS 27 vuole le scene.** Un'app compilata con l'SDK di iOS 27 che non adotta
  `UIScene` viene chiusa all'avvio. Il modello nativo di Expo 57 non lo fa
  ancora: ci pensa `plugins/ciclo-scene-ios.js` (lo stesso `SceneDelegate` del
  modello di Expo 58). Con il passaggio a SDK 58 il plugin non fa piu' nulla e
  si puo' togliere.

Per le build da distribuire si usa EAS (`npx eas-cli@latest build`): va prima
collegato il progetto EAS dell'organizzazione `ticinoweb` (`eas init`).
Le build di sviluppo che devono ricevere push dalla sandbox di Apple si fanno con
`GESTAVOIP_APS_ENV=development`; TestFlight e App Store vogliono `production`
(il default).

## Aggiornamenti senza build (OTA)

Dalla 0.1.3 (build 4) l'app riceve gli aggiornamenti di EAS Update sul canale
`production` (le build di sviluppo su `development`). Schermate, testi e logica
in JavaScript si pubblicano senza build e senza TestFlight:

```bash
npx eas-cli@latest update --channel production --message "cosa cambia"
```

L'app scarica l'aggiornamento all'avvio e lo usa subito se arriva entro 3
secondi, altrimenti dall'avvio successivo.

Un aggiornamento arriva solo alle build con lo stesso codice nativo: la
`runtimeVersion` e' l'impronta del nativo (`policy: 'fingerprint'`), senza
versione e numero di build (`fingerprint.config.js`). Librerie native, permessi,
`infoPlist`, plugin, icona e SDK cambiano l'impronta: serve una build nuova, e
l'aggiornamento pubblicato prima non la raggiunge (ne' danneggia le vecchie).

## Controlli

```bash
npx tsc --noEmit
npx expo lint
npx expo-doctor
```
