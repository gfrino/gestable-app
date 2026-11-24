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
const esiste = (file) => fs.existsSync(path.join(__dirname, file))
const firebaseAndroid = esiste('google-services.json')
const firebaseIos = esiste('GoogleService-Info.plist')
const firebase = firebaseAndroid || firebaseIos

// "production" per TestFlight e App Store: con "development" il token VoIP
// finisce nella sandbox di Apple e le chiamate in arrivo non arrivano, senza
// nessun errore da nessuna parte. Le build di sviluppo lo sovrascrivono.
const APS = process.env.GESTAVOIP_APS_ENV || 'production'

const MICROFONO = 'GestaVOIP usa il microfono per le telefonate.'

module.exports = {
  expo: {
    name: 'GestaVOIP',
    slug: 'gestavoip',
    owner: 'ticinoweb',
    scheme: 'gestavoip',
    version: '0.1.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',

    ios: {
      bundleIdentifier: IDENTIFICATIVO,
      buildNumber: '1',
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
      versionCode: 1,
      ...(firebaseAndroid ? { googleServicesFile: './google-services.json' } : {}),
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
      ...(firebase ? ['@react-native-firebase/app', '@react-native-firebase/crashlytics'] : []),
      // iOS 27 vuole le scene: senza, l'app si chiude all'avvio.
      './plugins/ciclo-scene-ios',
    ],

    experiments: { typedRoutes: true },

    extra: {
      firebase,
      // Progetto EAS @ticinoweb/gestavoip (organizzazione ticinoweb, login @gfrino).
      eas: { projectId: '50258e2e-5fcb-4605-8ca9-20e39875236d' },
    },
  },
}
