# Privacy – App GestaVOIP

*Ultimo aggiornamento: 25 novembre 2026*

GestaVOIP è l'app di ticinoWEB di Giovanni Frino (Via Serafino Balestra 6, 6600 Locarno, Svizzera) che collega il telefono al
gestionale Odoo della tua azienda: telefonate, contatti, calendario, messaggi,
attività e Odoo in un'unica app.

## Chi tratta i tuoi dati

I dati che vedi e modifichi nell'app (contatti, appuntamenti, messaggi,
attività, registro delle chiamate) stanno nel **server Odoo della tua azienda**,
non presso ticinoWEB. Titolare del trattamento è la tua azienda, che gestisce
quel server. L'app li legge e li scrive direttamente su quel server, con il tuo
utente e i tuoi permessi di Odoo.

ticinoWEB non riceve, non raccoglie e non vende i dati che passano dall'app.

## Cosa resta sul telefono

- l'indirizzo del server Odoo, il tuo nome utente e la sessione di accesso,
  salvati nel portachiavi protetto del telefono (Keychain su iPhone, Keystore
  su Android);
- un identificativo casuale del telefono, che serve al centralino per far
  squillare il dispositivo giusto.

La password non viene salvata. Uscendo dall'app (menu → Esci) la sessione
viene chiusa e cancellata dal telefono.

## Microfono e telefonate

Il microfono si usa solo durante una telefonata. Le chiamate passano dal
centralino della tua azienda (modulo VOIP AI di Odoo e Twilio, il fornitore
telefonico scelto dalla tua azienda). Per far squillare l'app quando è chiusa
si usano le notifiche di Apple (PushKit) e di Google (Firebase Cloud
Messaging), che ricevono solo un avviso tecnico di chiamata in arrivo.

## Report degli errori (Android)

Sui telefoni Android, quando l'app incontra un errore (anche senza chiudersi),
invia a ticinoWEB un report tecnico tramite Firebase Crashlytics (Google): tipo
di errore, modello del telefono e versione di Android, un identificativo casuale
dell'installazione e un codice interno del tuo utente (database e numero utente
di Odoo, senza nome né email). Il report serve solo a correggere gli errori e
viene cancellato automaticamente dopo 90 giorni. Su iPhone questi report non
vengono inviati.

## Cosa non facciamo

- nessuna pubblicità e nessun tracciamento;
- nessun dato di analisi o profilazione inviato a ticinoWEB o a terzi, a parte
  i report degli errori descritti sopra;
- nessuna lettura della rubrica, delle foto o della posizione del telefono.

## Server autorizzati

Al primo accesso l'app controlla su ticinoweb.online che l'indirizzo del tuo
Odoo sia tra i server abilitati a GestaVOIP. Il controllo invia solo
l'indirizzo del server, non dati personali.

## I tuoi diritti

Per accedere, correggere o cancellare i tuoi dati rivolgiti all'amministratore
del tuo Odoo, che ne è il titolare. Per domande su questa app scrivi a
ticinoWEB: info@ticinoweb.net, +41 91 225 37 15.

Informativa generale di ticinoWEB: https://ticinoweb.com/privacy-policy-2/
