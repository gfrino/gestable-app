# GestABLE

Softphone VOIP per iPhone e Android: una cornice nativa attorno a Odoo, che
aggiunge le sole cose che una pagina web sul telefono non puo' fare — squillare
a schermo spento, tenere vivo l'audio in secondo piano, comparire come una
telefonata di sistema.

L'interfaccia e' Odoo. Il modulo `ai_telemarketing_twilio` disegna tutto quello
che l'operatore vede; l'app si occupa della voce e dei permessi.

Fratello mobile di [Odoo AI Desktop](https://github.com/gfrino/odoo-ai-desktop-app),
con cui condivide l'impostazione ma non il codice.

**Stato: impalcatura.** Configurazione, permessi e logica di registrazione ci
sono. Non e' mai stata costruita ne' ha mai squillato: servono credenziali che
stanno dietro gli account Apple, Google e Twilio.

## Cosa serve prima di poterla costruire

Nessuna di queste cose e' facoltativa: senza, le chiamate in arrivo non
arrivano proprio.

1. **Certificato VoIP Push di Apple** (APNs, tipo *VoIP Services*), caricato su
   Twilio come Push Credential. E' il canale che sveglia l'app quando e'
   chiusa: senza, iOS non la avvisa mai.
2. **Progetto Firebase** per Android: `google-services.json` nella radice di
   ``, e la chiave FCM caricata su Twilio come Push Credential.
3. **TwiML App** su Twilio, con la Voice Request URL che punta a Odoo, e una
   **API Key** con relativo Secret.
4. **Una rotta su Odoo** che emette access token per l'utente collegato. E' la
   stessa del rinnovo token del softphone web: se e' gia' stata fatta li',
   qui si riusa.
5. **Un profilo di distribuzione**: TestFlight per quattro persone e' la strada
   piu' semplice, e non passa dalla revisione App Store.

## Perche' i permessi non si rifanno a ogni aggiornamento

Era la preoccupazione esplicita, e la risposta e' nella struttura.

Permessi e capacita' native sono dichiarati in `app.config.js`, non nei
progetti Xcode e Android Studio: quelli li rigenera `expo prebuild` a ogni
giro, e qualunque modifica fatta a mano andrebbe persa. Dichiarandoli nella
configurazione, ogni build parte dalle stesse premesse.

iOS e Android ricordano i permessi concessi finche' **non cambia il bundle
identifier** e **non si aggiunge un permesso nuovo**. Il bundle e'
`com.ticinoweb.odooaiphone` e non va cambiato mai: e' l'identita' con cui il
sistema ricorda microfono, notifiche e installazione. Un permesso aggiunto in
futuro fara' comparire una richiesta, e non c'e' modo di evitarlo — e' il
sistema operativo a volerlo.

## Come e' costruita l'affidabilita'

La differenza fra un softphone che funziona e uno di cui ci si fida non sta
nelle chiamate riuscite, ma in cosa succede quando qualcosa non va. Tre casi,
gestiti esplicitamente in `src/voip/`:

- **Il token scade.** Si rinnova cinque minuti prima della scadenza, non alla
  scadenza: in mezzo c'e' il tempo per accorgersi che il rinnovo e' fallito e
  riprovare.
- **La rete cade.** Si riprova con attese crescenti — 2, 5, 15, 30, 60 secondi
  — e non ci si arrende. L'unico caso in cui ci si ferma e' la sessione Odoo
  scaduta, dove insistere e' inutile e serve che l'operatore rientri.
- **Il telefono si risveglia.** E' il caso piu' comune e quello che quasi
  nessuno gestisce: il telefono e' stato in tasca tutta la notte, il timer di
  rinnovo non e' scattato perche' il sistema l'ha sospeso, e al risveglio la
  registrazione e' morta da ore. Al ritorno in primo piano si ri-registra
  sempre, senza dare per scontato niente.

Squillo, schermata di chiamata e notifiche **non** sono reimplementati:
su iOS li fa CallKit, su Android il servizio dell'SDK. Rifarli darebbe due
schermate di chiamata sovrapposte, ed e' il motivo per cui diversi softphone
di mercato si comportano male quando il telefono e' bloccato.

## Struttura

```

  app.config.js      permessi, capacita' native, plugin
  src/voip/token.ts     access token: richiesta, rinnovo, insistenza
  src/voip/telefono.ts  registrazione, chiamate, ripresa dai guasti
```

## Costruirla

Expo Go **non** funziona: l'SDK Twilio contiene codice nativo e serve una
development build.

```bash
npm install
npx expo prebuild --clean
npx expo run:ios      # oppure run:android
```
