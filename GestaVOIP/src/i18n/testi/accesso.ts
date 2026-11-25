/** Testi: area «accesso» (vedi src/i18n/index.ts). Chiavi «accesso.nome». */

export const it = {
  // Schermata di accesso
  'accesso.sottotitolo': "Il telefono dell'ufficio, collegato al tuo Odoo.",
  'accesso.indirizzoOdoo': 'Indirizzo di Odoo',
  'accesso.indirizzoEsempio': 'es. odoo.miaazienda.ch',
  'accesso.scriviIndirizzo': "Scrivi l'indirizzo del tuo Odoo.",
  'accesso.scriviEmailPassword': 'Scrivi email e password.',
  'accesso.scriviCodice': 'Scrivi il codice.',
  'accesso.continua': 'Continua',
  'accesso.cambiaServer': 'Cambia server',
  'accesso.indirizzoCambia': '{indirizzo} · cambia',
  'accesso.cambiaIndirizzo': 'Cambia indirizzo',
  'accesso.dueFattori': 'Verifica in due passaggi',
  'accesso.dueFattoriTesto':
    "Scrivi il codice dell'app di autenticazione (o quello arrivato per email). Serve solo a questo accesso: poi l'app resta collegata.",
  'accesso.codice': 'Codice',
  'accesso.conferma': 'Conferma',
  'accesso.tornaPassword': 'Torna alla password',
  'accesso.senzaTelefono': 'Questo Odoo non ha il telefono',
  'accesso.senzaTelefonoTesto':
    "Manca il modulo VOIP AI: l'app funziona lo stesso, con contatti, calendario, messaggi, attività e Odoo, senza telefonate.",
  'accesso.email': 'Email',
  'accesso.password': 'Password',
  'accesso.accedi': 'Accedi',
  'accesso.accediGoogle': 'Accedi con Google o Microsoft',

  // Menu laterale
  'accesso.menu': 'Menu',
  'accesso.menuDaVedere_uno': 'Menu, {n} cosa da vedere',
  'accesso.menuDaVedere_piu': 'Menu, {n} cose da vedere',
  'accesso.chiudiMenu': 'Chiudi il menu',
  'accesso.presenze': 'Presenze',
  'accesso.alLavoroDalle': 'Al lavoro dalle {ora}',
  'accesso.nonAlLavoro': 'Non al lavoro',
  'accesso.oggi': 'Oggi {ore}',
  'accesso.registraUscita': 'Registra uscita',
  'accesso.registraEntrata': 'Registra entrata',
  'accesso.timbraUscita': 'Esci',
  'accesso.timbraEntrata': 'Entra',
  'accesso.messaggi': 'Messaggi',
  'accesso.attivita': 'Attività',
  'accesso.uscireTitolo': 'Uscire?',
  'accesso.uscireTelefono': 'Esci da Odoo su questo telefono: il telefono smette di squillare finché non rientri.',
  'accesso.uscireSenzaTelefono': 'Esci da Odoo su questo telefono.',

  // Schermate che richiedono un'app di Odoo
  'accesso.appNonAttiva': '{app} non è attivo',
  'accesso.appNonAttivaTesto': "In questo Odoo ({indirizzo}) l'app {app} non è installata, oppure il tuo utente non la può usare.",
  'accesso.chiediAmministratore':
    "Chiedi all'amministratore del tuo Odoo di installare l'app {app} e di darti l'accesso. Poi torna qui: la scheda si attiva da sola.",
  'accesso.apriOdoo': 'Apri Odoo',
  'accesso.serveEmail': "Serve l'accesso con email",
  'accesso.serveEmailTesto':
    "Sei entrato dalla pagina di Odoo (per esempio con Google o Microsoft). {titolo} nell'app funziona con l'accesso con email e password di Odoo.",
  'accesso.accediEmail': 'Accedi con email',

  // Vista Odoo
  'accesso.link': 'Link',
  'accesso.linkNonApribile': 'Nessuna app sa aprire questo link.',
  'accesso.ricaricaOdoo': 'Ricarica Odoo',
  'accesso.menuOdoo': 'Menu di Odoo',
  'accesso.odooNonSiApre': 'Odoo non si apre: controlla la connessione a internet.',
  'accesso.cercaApp': "Cerca un'app",
  'accesso.nessunaApp': 'Nessuna app con questo nome.',

  // Errori di collegamento a Odoo
  'accesso.erroreNonRisponde': 'Il server non risponde. Riprova fra poco.',
  'accesso.erroreNonRaggiungibile': "Server non raggiungibile: controlla l'indirizzo e la connessione a internet.",
  'accesso.erroreSenzaRete': 'Server non raggiungibile: controlla la connessione a internet.',
  'accesso.erroreModulo': 'Questo Odoo non ha il modulo VOIP AI aggiornato (serve la versione 2.36 o successiva).',
  'accesso.erroreStato': 'Il server ha risposto {stato}.',
  'accesso.erroreRisposta': 'Risposta non valida dal server.',
  'accesso.erroreServer': 'Errore del server.',
  'accesso.sessioneScaduta': "La sessione e' scaduta: accedi di nuovo.",
  'accesso.credenzialiErrate': 'Email o password non corrette.',
  'accesso.serverNonValido': 'Server non valido.',
  'accesso.nonOdoo': "A questo indirizzo non risponde un Odoo: controlla l'indirizzo.",
  'accesso.nonPaginaAccesso': 'A questo indirizzo non risponde la pagina di accesso di Odoo.',
  'accesso.serveCodice': 'Serve il codice della verifica in due passaggi.',
  'accesso.codiceScaduto': "Il tempo per il codice e' scaduto: accedi di nuovo.",
  'accesso.codiceNonValido': 'Codice non valido o scaduto: riprova con quello nuovo.',

  // Server autorizzati
  'accesso.serverNonAbilitato': 'Server non abilitato',
  'accesso.nonAutorizzato': 'Questo Odoo non è abilitato per GestaVOIP. Per attivarlo contatta ticinoWEB.',
  'accesso.nonVerificabile': 'Non riesco a verificare il server: controlla la connessione a internet e riprova.',
}

export const en: Record<keyof typeof it, string> = {
  // Schermata di accesso
  'accesso.sottotitolo': 'Your office phone, connected to your Odoo.',
  'accesso.indirizzoOdoo': 'Odoo address',
  'accesso.indirizzoEsempio': 'e.g. odoo.mycompany.com',
  'accesso.scriviIndirizzo': 'Enter your Odoo address.',
  'accesso.scriviEmailPassword': 'Enter your email and password.',
  'accesso.scriviCodice': 'Enter the code.',
  'accesso.continua': 'Continue',
  'accesso.cambiaServer': 'Change server',
  'accesso.indirizzoCambia': '{indirizzo} · change',
  'accesso.cambiaIndirizzo': 'Change address',
  'accesso.dueFattori': 'Two-step verification',
  'accesso.dueFattoriTesto':
    'Enter the code from your authenticator app (or the one sent by email). You only need it this once: the app then stays signed in.',
  'accesso.codice': 'Code',
  'accesso.conferma': 'Confirm',
  'accesso.tornaPassword': 'Back to password',
  'accesso.senzaTelefono': 'This Odoo has no phone system',
  'accesso.senzaTelefonoTesto':
    'The VOIP AI module is missing. The app still works, with contacts, calendar, messages, activities and Odoo, just without calls.',
  'accesso.email': 'Email',
  'accesso.password': 'Password',
  'accesso.accedi': 'Sign in',
  'accesso.accediGoogle': 'Sign in with Google or Microsoft',

  // Menu laterale
  'accesso.menu': 'Menu',
  'accesso.menuDaVedere_uno': 'Menu, {n} new item',
  'accesso.menuDaVedere_piu': 'Menu, {n} new items',
  'accesso.chiudiMenu': 'Close menu',
  'accesso.presenze': 'Attendance',
  'accesso.alLavoroDalle': 'Clocked in since {ora}',
  'accesso.nonAlLavoro': 'Clocked out',
  'accesso.oggi': 'Today {ore}',
  'accesso.registraUscita': 'Clock out',
  'accesso.registraEntrata': 'Clock in',
  'accesso.timbraUscita': 'Clock out',
  'accesso.timbraEntrata': 'Clock in',
  'accesso.messaggi': 'Messages',
  'accesso.attivita': 'Activities',
  'accesso.uscireTitolo': 'Sign out?',
  'accesso.uscireTelefono': 'You will be signed out of Odoo on this phone, and it stops ringing until you sign in again.',
  'accesso.uscireSenzaTelefono': 'You will be signed out of Odoo on this phone.',

  // Schermate che richiedono un'app di Odoo
  'accesso.appNonAttiva': '{app} is not available',
  'accesso.appNonAttivaTesto': "On this Odoo ({indirizzo}) the {app} app is not installed, or your user can't use it.",
  'accesso.chiediAmministratore':
    'Ask your Odoo administrator to install the {app} app and give you access. Then come back here: this tab turns on by itself.',
  'accesso.apriOdoo': 'Open Odoo',
  'accesso.serveEmail': 'Email sign-in required',
  'accesso.serveEmailTesto':
    'You signed in from the Odoo page (for example with Google or Microsoft). {titolo} in the app needs your Odoo email and password.',
  'accesso.accediEmail': 'Sign in with email',

  // Vista Odoo
  'accesso.link': 'Link',
  'accesso.linkNonApribile': 'No app can open this link.',
  'accesso.ricaricaOdoo': 'Reload Odoo',
  'accesso.menuOdoo': 'Odoo menu',
  'accesso.odooNonSiApre': "Odoo won't open. Check your internet connection.",
  'accesso.cercaApp': 'Search apps',
  'accesso.nessunaApp': 'No apps with this name.',

  // Errori di collegamento a Odoo
  'accesso.erroreNonRisponde': 'The server is not responding. Try again in a moment.',
  'accesso.erroreNonRaggiungibile': "Can't reach the server. Check the address and your internet connection.",
  'accesso.erroreSenzaRete': "Can't reach the server. Check your internet connection.",
  'accesso.erroreModulo': "This Odoo doesn't have an up-to-date VOIP AI module (version 2.36 or later is required).",
  'accesso.erroreStato': 'The server responded with error {stato}.',
  'accesso.erroreRisposta': 'Invalid response from the server.',
  'accesso.erroreServer': 'Server error.',
  'accesso.sessioneScaduta': 'Your session has expired. Please sign in again.',
  'accesso.credenzialiErrate': 'Incorrect email or password.',
  'accesso.serverNonValido': 'Invalid server.',
  'accesso.nonOdoo': "There's no Odoo at this address. Check the address.",
  'accesso.nonPaginaAccesso': "There's no Odoo sign-in page at this address.",
  'accesso.serveCodice': 'Two-step verification code required.',
  'accesso.codiceScaduto': 'The code timed out. Please sign in again.',
  'accesso.codiceNonValido': 'Invalid or expired code. Try again with a new one.',

  // Server autorizzati
  'accesso.serverNonAbilitato': 'Server not enabled',
  'accesso.nonAutorizzato': 'This Odoo is not enabled for GestaVOIP. Contact ticinoWEB to activate it.',
  'accesso.nonVerificabile': "Can't verify the server. Check your internet connection and try again.",
}
