/**
 * Report dei crash con Firebase Crashlytics, se il progetto Firebase c'e'.
 *
 * Senza i file di Firebase (google-services.json, GoogleService-Info.plist)
 * l'app si compila lo stesso e qui si scrive solo nella console: un report
 * che manca non deve mai far cadere una telefonata.
 */

import Constants from 'expo-constants'

type ModuloCrashlytics = typeof import('@react-native-firebase/crashlytics')
type Istanza = ReturnType<ModuloCrashlytics['getCrashlytics']>

let modulo: ModuloCrashlytics | null | undefined
let istanza: Istanza | null = null

function crashlytics(): { m: ModuloCrashlytics; c: Istanza } | null {
  if (modulo === undefined) {
    modulo = null
    if (Constants.expoConfig?.extra?.firebase) {
      try {
        // Caricato solo se Firebase e' configurato: senza il file di
        // configurazione l'app nativa non ha il modulo inizializzato.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        modulo = require('@react-native-firebase/crashlytics') as ModuloCrashlytics
        istanza = modulo.getCrashlytics()
      } catch {
        modulo = null
      }
    }
  }
  return modulo && istanza ? { m: modulo, c: istanza } : null
}

export function segnalaErrore(e: unknown, dove: string) {
  const errore = e instanceof Error ? e : new Error(String(e))
  console.warn(`[GestABLE] ${dove}:`, errore.message)
  try {
    const fb = crashlytics()
    if (fb) {
      fb.m.log(fb.c, dove)
      fb.m.recordError(fb.c, errore, dove)
    }
  } catch {
    // niente: il report e' un accessorio
  }
}

export function utenteCrash(id: string) {
  try {
    const fb = crashlytics()
    if (fb) {
      void fb.m.setUserId(fb.c, id)
    }
  } catch {
    // niente
  }
}
