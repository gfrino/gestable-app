/** Testi: area «telefono» (vedi src/i18n/index.ts). Chiavi «telefono.nome». */

export const it = {
  // Schermata della chiamata: a che punto e' la chiamata
  'telefono.fase.composizione': 'Chiamata in corso...',
  'telefono.fase.squillo': 'Squilla...',
  'telefono.fase.inArrivo': 'Chiamata in arrivo',
  'telefono.fase.riconnessione': 'Rete debole, riconnessione...',
  'telefono.fase.finita': 'Chiamata terminata',
  'telefono.inArrivo': 'In arrivo',
  'telefono.inUscita': 'In uscita',
  'telefono.sconosciuto': 'Sconosciuto',
  'telefono.inAttesa': ' · in attesa',
  // Avvisi durante la chiamata, dall'SDK
  'telefono.avvisoRete': 'Connessione debole: potrebbero sentirti a tratti. Prova il Wi‑Fi.',
  'telefono.avvisoMicrofono': 'Il microfono non prende la tua voce: controlla che non sia coperto.',

  // Tasti della chiamata (una riga sola)
  'telefono.muto': 'Muto',
  'telefono.tastierino': 'Tastierino',
  'telefono.attesa': 'Attesa',
  'telefono.trasferisci': 'Trasferisci',
  'telefono.nascondi': 'Nascondi',
  'telefono.riaggancia': 'Riaggancia',

  // Uscita dell'audio
  'telefono.audio': 'Audio',
  'telefono.vivavoce': 'Vivavoce',
  'telefono.auricolare': 'Telefono',
  'telefono.bluetooth': 'Bluetooth',

  // Trasferimento
  'telefono.passaA': 'Passa la chiamata a',
  'telefono.trasferimento': 'Trasferimento',
  'telefono.passataTitolo': 'Chiamata passata',
  'telefono.passataTesto': 'La chiamata ora squilla a {nome}.',
  'telefono.trasferimentoErrore': 'Trasferimento non riuscito',
  'telefono.nessunaChiamata': 'Nessuna chiamata in corso',

  // Chiamare da qualsiasi schermata
  'telefono.nonPartita': 'Chiamata non partita',

  // Riga dello stato della linea
  'telefono.linea.pronto': 'Pronto: ricevi e fai chiamate',
  'telefono.linea.nonDisponibile': 'Non disponibile: le chiamate non squillano qui',
  'telefono.linea.collegamento': 'Collegamento al centralino...',
  'telefono.linea.senzaPush': 'Solo chiamate in uscita: push non configurate sul server',
  'telefono.linea.guasto': 'Non collegato: {motivo}',
  'telefono.linea.guastoRiprovo': 'Non collegato: riprovo da solo',
  'telefono.linea.tentativo': '{motivo} (tentativo {n})',
  'telefono.linea.serverOccupato': 'Server Odoo in riavvio: riprovo da solo',
  'telefono.erroreSconosciuto': 'errore sconosciuto',

  // Risposte del centralino senza messaggio
  'telefono.operazioneNonRiuscita': 'Operazione non riuscita.',
}

export const en: Record<keyof typeof it, string> = {
  'telefono.fase.composizione': 'Calling...',
  'telefono.fase.squillo': 'Ringing...',
  'telefono.fase.inArrivo': 'Incoming call',
  'telefono.fase.riconnessione': 'Weak network, reconnecting...',
  'telefono.fase.finita': 'Call ended',
  'telefono.inArrivo': 'Incoming',
  'telefono.inUscita': 'Outgoing',
  'telefono.sconosciuto': 'Unknown',
  'telefono.inAttesa': ' · on hold',
  'telefono.avvisoRete': 'Weak connection: you may be breaking up. Try Wi‑Fi.',
  'telefono.avvisoMicrofono': 'Your microphone isn’t picking up your voice: check it isn’t covered.',

  'telefono.muto': 'Mute',
  'telefono.tastierino': 'Keypad',
  'telefono.attesa': 'Hold',
  'telefono.trasferisci': 'Transfer',
  'telefono.nascondi': 'Hide',
  'telefono.riaggancia': 'Hang up',

  'telefono.audio': 'Audio',
  'telefono.vivavoce': 'Speaker',
  'telefono.auricolare': 'Phone',
  'telefono.bluetooth': 'Bluetooth',

  'telefono.passaA': 'Transfer call to',
  'telefono.trasferimento': 'Transfer',
  'telefono.passataTitolo': 'Call transferred',
  'telefono.passataTesto': 'The call is now ringing for {nome}.',
  'telefono.trasferimentoErrore': 'Transfer failed',
  'telefono.nessunaChiamata': 'No call in progress',

  'telefono.nonPartita': "Couldn't place the call",

  'telefono.linea.pronto': 'Ready: make and receive calls',
  'telefono.linea.nonDisponibile': "Unavailable: calls won't ring here",
  'telefono.linea.collegamento': 'Connecting to the phone system...',
  'telefono.linea.senzaPush': 'Outgoing calls only: push not set up on the server',
  'telefono.linea.guasto': 'Not connected: {motivo}',
  'telefono.linea.guastoRiprovo': 'Not connected: retrying automatically',
  'telefono.linea.tentativo': '{motivo} (attempt {n})',
  'telefono.linea.serverOccupato': 'Odoo server restarting: retrying automatically',
  'telefono.erroreSconosciuto': 'unknown error',

  'telefono.operazioneNonRiuscita': 'The operation failed.',
}
