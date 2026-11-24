/**
 * Impronta del codice nativo per gli aggiornamenti OTA (runtimeVersion
 * "fingerprint" in app.config.js).
 *
 * Versione e numero di build non sono codice nativo: senza questa esclusione
 * ogni build nuova cambierebbe l'impronta e gli aggiornamenti pubblicati per
 * le build precedenti non arriverebbero piu'.
 */
/** @type {import('expo/fingerprint').Config} */
module.exports = {
  sourceSkips: ['ExpoConfigVersions'],
}
