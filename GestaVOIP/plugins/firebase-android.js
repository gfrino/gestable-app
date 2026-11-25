/**
 * Firebase solo per Android: le push FCM che fanno squillare l'app chiusa
 * (Twilio Voice) e i report dei crash (Crashlytics).
 *
 * I plugin di @react-native-firebase configurano anche iOS e, senza
 * GoogleService-Info.plist, fanno fallire la build iOS: su iOS le chiamate in
 * arrivo passano da PushKit di Apple e Firebase non serve. Qui ci sono solo
 * le loro modifiche Android (stesse righe dei plugin originali):
 * - build.gradle del progetto: classpath google-services e crashlytics;
 * - app/build.gradle: apply plugin google-services e crashlytics (senza il
 *   plugin crashlytics l'app si chiude all'avvio: «build ID missing»);
 * - copia di google-services.json in android/app.
 *
 * Nessun require dei pacchetti Firebase (le versioni si leggono dal loro
 * package.json con fs): cosi' l'impronta OTA di iOS non cambia (vedi
 * fingerprint.config.js).
 */

const fs = require('fs')
const path = require('path')
const { withAppBuildGradle, withDangerousMod, withPlugins, withProjectBuildGradle } = require('@expo/config-plugins')

const GOOGLE_SERVICES = 'com.google.gms:google-services'
const CRASHLYTICS = 'com.google.firebase:firebase-crashlytics-gradle'

function versioni(progetto) {
  const pkg = JSON.parse(fs.readFileSync(path.join(progetto, 'node_modules/@react-native-firebase/app/package.json'), 'utf8'))
  return { gms: pkg.sdkVersions.android.gmsGoogleServicesGradle, crashlytics: pkg.sdkVersions.android.firebaseCrashlyticsGradle }
}

function aggiungiClasspath(testo, classe, versione) {
  return testo.includes(classe) ? testo : testo.replace(/dependencies\s?{/, `dependencies {\n        classpath '${classe}:${versione}'`)
}

function applica(testo, plugin) {
  return new RegExp(`apply\\s+plugin:\\s+['"]${plugin.replace(/\./g, '\\.')}['"]`).test(testo) ? testo : `${testo}\napply plugin: '${plugin}'`
}

const conClasspath = (config) =>
  withProjectBuildGradle(config, (c) => {
    const v = versioni(c.modRequest.projectRoot)
    c.modResults.contents = aggiungiClasspath(aggiungiClasspath(c.modResults.contents, GOOGLE_SERVICES, v.gms), CRASHLYTICS, v.crashlytics)
    return c
  })

const conPluginGradle = (config) =>
  withAppBuildGradle(config, (c) => {
    c.modResults.contents = applica(applica(c.modResults.contents, 'com.google.gms.google-services'), 'com.google.firebase.crashlytics')
    return c
  })

const conFileGoogle = (config) =>
  withDangerousMod(config, [
    'android',
    async (c) => {
      const da = path.resolve(c.modRequest.projectRoot, c.android?.googleServicesFile || '')
      if (!c.android?.googleServicesFile || !fs.existsSync(da)) {
        throw new Error(`google-services.json non trovato (${da})`)
      }
      await fs.promises.copyFile(da, path.resolve(c.modRequest.platformProjectRoot, 'app/google-services.json'))
      return c
    },
  ])

module.exports = function conFirebaseAndroid(config) {
  return withPlugins(config, [conClasspath, conPluginGradle, conFileGoogle])
}
