/**
 * Configurazione di GestaVOIP.
 *
 * Permessi e capacita' native si dichiarano QUI: `ios/` e `android/` vengono
 * rigenerati da `expo prebuild` e ogni modifica fatta a mano andrebbe persa.
 * Finche' l'identificativo e l'insieme dei permessi non cambiano, iOS e
 * Android ricordano i permessi concessi attraverso gli aggiornamenti.
 */

const fs = require('fs')
const path = require('path')

// Non cambiare mai: e' l'identita' con cui iOS e Android ricordano i
// permessi, e con cui sono emessi il certificato VoIP e il progetto Firebase.
const IDENTIFICATIVO = 'com.ticinoweb.gestavoip'

// I file di Firebase arrivano dal progetto Firebase e non stanno nel repo
// (che e' pubblico). Senza, l'app si compila lo stesso: le chiamate in uscita
// funzionano, mancano solo le push Android e i report dei crash.
// google-services.json sta in questa cartella (fuori da git, copia in
// ~/.config/gestavoip/) e arriva su EAS grazie a ../.easignore (radice del repository): stesso file in
// locale e nella build, quindi la stessa impronta OTA.
const esiste = (file) => fs.existsSync(path.join(__dirname, file))
// Una build iOS su EAS lo ignora: su iOS Firebase non c'e' (vedi plugins/firebase-android.js).
const buildIos = process.env.EAS_BUILD_PLATFORM === 'ios'
const fileAndroid = !buildIos && esiste('google-services.json') ? './google-services.json' : ''
const firebaseAndroid = !!fileAndroid
const firebaseIos = esiste('GoogleService-Info.plist')
const firebase = firebaseAndroid || firebaseIos

// "production" per TestFlight e App Store: con "development" il token VoIP
// finisce nella sandbox di Apple e le chiamate in arrivo non arrivano, senza
// nessun errore da nessuna parte. Le build di sviluppo lo sovrascrivono.
const APS = process.env.GESTAVOIP_APS_ENV || 'production'

// Progetto EAS @ticinoweb/gestavoip: build, invio agli store e aggiornamenti OTA.
const PROGETTO_EAS = '50258e2e-5fcb-4605-8ca9-20e39875236d'

const MICROFONO = 'GestaVOIP usa il microfono per le telefonate.'

module.exports = {
  expo: {
    name: 'GestaVOIP',
    slug: 'gestavoip',
    owner: 'ticinoweb',
    scheme: 'gestavoip',
    version: '1.0.0',
    orientation: 'portrait',

    // Aggiornamenti OTA (EAS Update): il JavaScript nuovo arriva senza una
    // build. La versione del runtime e' l'impronta del codice nativo: un
    // aggiornamento va solo alle build con lo stesso nativo, e ogni modifica
    // nativa (librerie, permessi, plugin, SDK) chiede una build nuova.
    runtimeVersion: { policy: 'fingerprint' },
    updates: {
      url: `https://u.expo.dev/${PROGETTO_EAS}`,
      // All'avvio si aspetta al massimo 3 secondi un aggiornamento appena
      // pubblicato; oltre, parte la versione gia' scaricata e quella nuova
      // vale dall'avvio successivo.
      fallbackToCacheTimeout: 3000,
    },
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',

    ios: {
      bundleIdentifier: IDENTIFICATIVO,
      buildNumber: '7',
      supportsTablet: false,
      ...(firebaseIos ? { googleServicesFile: './GoogleService-Info.plist' } : {}),
      infoPlist: {
        NSMicrophoneUsageDescription: MICROFONO,
        // Senza queste modalita' la chiamata si interrompe appena l'app va in
        // secondo piano o lo schermo si spegne.
        UIBackgroundModes: ['audio', 'voip', 'remote-notification'],
        ITSAppUsesNonExemptEncryption: false,
      },
      entitlements: {
        // PushKit: il canale che sveglia l'app chiusa per una chiamata.
        'aps-environment': APS,
      },
    },

    android: {
      package: IDENTIFICATIVO,
      versionCode: 5,
      ...(firebaseAndroid ? { googleServicesFile: fileAndroid } : {}),
      adaptiveIcon: {
        backgroundColor: '#FFFFFF',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      permissions: [
        'android.permission.RECORD_AUDIO',
        'android.permission.MODIFY_AUDIO_SETTINGS',
        // Android 13+: senza, la notifica della chiamata in arrivo non compare.
        'android.permission.POST_NOTIFICATIONS',
        // Android 12+: auricolari e vivavoce Bluetooth durante la chiamata.
        'android.permission.BLUETOOTH_CONNECT',
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_MICROPHONE',
        'android.permission.FOREGROUND_SERVICE_PHONE_CALL',
        'android.permission.WAKE_LOCK',
        // Schermata di chiamata a tutto schermo con il telefono bloccato.
        'android.permission.USE_FULL_SCREEN_INTENT',
      ],
      predictiveBackGestureEnabled: false,
    },

    plugins: [
      'expo-router',
      'expo-secure-store',
      [
        '@twilio/voice-react-native-sdk',
        { microphoneUsageDescription: MICROFONO, apsEnvironment: APS },
      ],
      [
        'expo-build-properties',
        {
          // React Native Firebase 27 vuole i framework dinamici: "static" fa
          // fallire pod install. Le versioni minime di iOS (16.4) e Android
          // le decide la SDK 57 di Expo.
          ios: { useFrameworks: 'dynamic' },
        },
      ],
      // Firebase: su Android per le chiamate in arrivo (FCM) e i crash; su iOS
      // solo se un giorno ci sara' anche GoogleService-Info.plist.
      ...(firebaseIos ? ['@react-native-firebase/app'] : []),
      ...(firebaseAndroid ? ['./plugins/firebase-android'] : []),
      // iOS 27 vuole le scene: senza, l'app si chiude all'avvio.
      './plugins/ciclo-scene-ios',
    ],

    experiments: { typedRoutes: true },

    extra: {
      firebase,
      // Progetto EAS @ticinoweb/gestavoip (organizzazione ticinoweb, login @gfrino).
      eas: { projectId: PROGETTO_EAS },
    },
  },
}
