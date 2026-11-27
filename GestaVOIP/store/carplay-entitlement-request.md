# Richiesta CarPlay ad Apple (app di comunicazione / VoIP)

Modulo: https://developer.apple.com/contact/carplay/ (accesso con l'Apple ID del team ticinoWEB).

- **Categoria:** Communication (VoIP calling)
- **App:** GestABLE (prima GestaVOIP), bundle id `com.ticinoweb.gestavoip`, Apple ID 6838846263
- **App Store:** pubblicata (1.0.0, approvata il 25.11.2026)

## Descrizione (in inglese, da incollare nel modulo)

GestABLE is the business phone of companies that use Odoo: employees make and receive calls with the company's own office number (VoIP through the company's Twilio account, configured in their Odoo server), and see their Odoo contacts, recent calls and calendar.

Calls already use CallKit, so incoming and outgoing calls appear on the CarPlay call screen. With CarPlay we want to offer the standard communication templates so drivers can start a call safely without touching the iPhone: a tab bar with "Recents" (the company call log, with a call button per entry) and "Favorites/Contacts" (contacts from the company's Odoo). Selecting an entry starts the VoIP call through CallKit; Siri ("Call Mario with GestABLE") uses INStartCallIntent. There is no text to read while driving, no messages composition and no video.

## Dopo l'approvazione

1. Apple abilita l'entitlement `com.apple.developer.carplay-communication` per l'App ID.
2. In `eas.json`, profilo `production`: `"env": { "CARPLAY_ENTITLED": "1" }`. Senza l'approvazione la firma della build fallirebbe, per questo l'entitlement e' disattivato di default (vedi `plugins/carplay-siri.js`).
3. Nuova build per lo store.

## Stato

- 27.11.2026: Apple ha concesso l'entitlement (mail a dev@ticinoweb.net); l'utente ha attivato «CarPlay Communication App» sull'App ID.
- 1.4.0 (13): prima build con `CARPLAY_ENTITLED=1` (eas.json, profilo production). Gli OTA per la 1.3.0 restano senza la variabile (runtime 58a8d55d).
