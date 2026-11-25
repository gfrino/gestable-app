/**
 * Impronta del codice nativo per gli aggiornamenti OTA (runtimeVersion
 * "fingerprint" in app.config.js).
 *
 * Versione e numero di build non sono codice nativo: senza questa esclusione
 * ogni build nuova cambierebbe l'impronta e gli aggiornamenti pubblicati per
 * le build precedenti non arriverebbero piu'.
 *
 * Firebase per Android (google-services.json e plugins/firebase-android) c'e' solo dove c'e' il file: su EAS dalla variabile
 * GOOGLE_SERVICES_JSON, in locale se il file e' nella cartella. Non tocca
 * iOS, quindi resta fuori dall'impronta: altrimenti gli aggiornamenti iOS
 * pubblicati con il file presente non arriverebbero alle build iOS (fatte
 * senza). Le build Android si fanno sempre con Firebase.
 */

const PLUGIN_SOLO_ANDROID = ['./plugins/firebase-android']

function senzaFirebaseAndroid(testo) {
  const config = JSON.parse(testo)
  if (config.android) {
    delete config.android.googleServicesFile
  }
  // extra.firebase dice all'app se Firebase c'e': per l'impronta conta solo iOS.
  if (config.extra && 'firebase' in config.extra) {
    config.extra.firebase = !!(config.ios && config.ios.googleServicesFile)
  }
  if (Array.isArray(config.plugins)) {
    config.plugins = config.plugins.filter((p) => !PLUGIN_SOLO_ANDROID.includes(Array.isArray(p) ? p[0] : p))
  }
  // L'originale e' gia' ordinato: JSON.parse conserva l'ordine delle chiavi.
  return JSON.stringify(config)
}

/** @type {import('expo/fingerprint').Config} */
module.exports = {
  sourceSkips: ['ExpoConfigVersions'],
  ignorePaths: ['plugins/firebase-android.js'],
  fileHookTransform: (source, chunk) => {
    if (source.type === 'contents' && source.id === 'expoConfig' && typeof chunk === 'string') {
      return senzaFirebaseAndroid(chunk)
    }
    return chunk
  },
}
