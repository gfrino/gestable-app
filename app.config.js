/**
 * Configurazione dell'app mobile.
 *
 * I permessi e le capacita' native si dichiarano QUI, non nei progetti Xcode e
 * Android Studio: quelli vengono rigenerati a ogni `expo prebuild` e qualunque
 * modifica fatta a mano andrebbe persa al primo aggiornamento. E' anche la
 * risposta alla preoccupazione sui permessi da rifare ogni volta: finche'
 * bundle identifier e insieme dei permessi non cambiano, iOS e Android li
 * ricordano attraverso gli aggiornamenti e non richiedono nulla all'utente.
 */

// Non cambiare mai: e' l'identita' con cui iOS e Android ricordano i
// permessi concessi, e con cui il certificato push viene emesso.
const IDENTIFICATIVO = 'com.ticinoweb.gestable'

module.exports = {
  expo: {
    name: 'GestABLE',
    slug: 'gestable',
    version: '0.1.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    scheme: 'gestable',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,

    ios: {
      // Non cambiare mai: e' l'identita' con cui iOS ricorda i permessi
      // concessi, le notifiche autorizzate e gli aggiornamenti in TestFlight.
      bundleIdentifier: IDENTIFICATIVO,
      supportsTablet: false,
      infoPlist: {
        NSMicrophoneUsageDescription:
          'GestABLE usa il microfono per le telefonate.',
        // Senza queste modalita' la chiamata si interrompe appena l'app va in
        // secondo piano o lo schermo si spegne.
        UIBackgroundModes: ['audio', 'voip', 'remote-notification'],
      },
      entitlements: {
        // PushKit: e' il canale che sveglia l'app quando e' chiusa. Senza,
        // le chiamate in arrivo semplicemente non arrivano.
        'aps-environment': 'production',
      },
    },

    android: {
      package: IDENTIFICATIVO,
      // Generato dal progetto Firebase: l'SDK Twilio lo pretende in prebuild.
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#5B4A8A',
      },
      // Generato dal progetto Firebase del cliente: l'SDK Twilio lo pretende
      // in prebuild, altrimenti su Android non si compila proprio.
      googleServicesFile: './google-services.json',
      permissions: [
        'android.permission.RECORD_AUDIO',
        'android.permission.MODIFY_AUDIO_SETTINGS',
        'android.permission.INTERNET',
        'android.permission.ACCESS_NETWORK_STATE',
        // Android 13+: senza questo le notifiche di chiamata non compaiono.
        'android.permission.POST_NOTIFICATIONS',
        // Android 12+: necessarie per gli auricolari durante la chiamata.
        'android.permission.BLUETOOTH_CONNECT',
        // Tiene viva la chiamata quando lo schermo si spegne.
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_MICROPHONE',
        'android.permission.WAKE_LOCK',
        'android.permission.USE_FULL_SCREEN_INTENT',
      ],
    },

    plugins: [
      'expo-router',
      'expo-secure-store',
      [
        'expo-notifications',
        { icon: './assets/icon.png', color: '#5B4A8A' },
      ],
      // Il plugin dell'SDK cuce PushKit, CallKit e il servizio Android in
      // fase di prebuild. E' la parte che rende inutile toccare Xcode.
      '@twilio/voice-react-native-sdk',
    ],

    extra: {
      // L'indirizzo di Odoo, sovrascrivibile senza ricostruire l'app.
      odooUrl: process.env.EXPO_PUBLIC_ODOO_URL || '',
      eas: { projectId: '' },
    },
  },
}
