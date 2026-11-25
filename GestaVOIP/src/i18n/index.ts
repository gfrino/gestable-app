/**
 * Lingue dell'app: italiano e inglese.
 *
 * Alla prima apertura vale la lingua del telefono (italiano se il telefono e'
 * in italiano, altrimenti inglese); in Impostazioni si puo' scegliere a mano.
 * La lingua del telefono si legge dai moduli di React Native (iOS: elenco
 * delle lingue preferite; Android: locale del sistema): nessun modulo nativo
 * in piu', l'app resta aggiornabile senza passare dagli store.
 *
 * I testi stanno in src/i18n/testi/<gruppo>.ts, uno per area dell'app, con le
 * chiavi «gruppo.nome». L'inglese ha per forza le stesse chiavi
 * dell'italiano (lo controlla TypeScript).
 *
 * Uso: t('calendario.nuovo'), t('calendario.partecipanti', { n: 3 }),
 * tn('calendario.volte', 4) per singolare/plurale (chiavi «_uno» e «_piu»),
 * loc() per date e ore (toLocaleDateString(loc(), ...)).
 */

import * as SecureStore from 'expo-secure-store'
import { I18nManager, Platform, Settings } from 'react-native'
import { TESTI } from './testi'

export type Lingua = 'it' | 'en'
/** «auto» = quella del telefono. */
export type SceltaLingua = 'auto' | Lingua

export const LINGUE: { valore: Lingua; nome: string }[] = [
  { valore: 'it', nome: 'Italiano' },
  { valore: 'en', nome: 'English' },
]

const CHIAVE = 'gestavoip.lingua'

function codiceTelefono(): string {
  try {
    if (Platform.OS === 'ios') {
      const lingue = Settings.get('AppleLanguages') as string[] | undefined
      if (lingue?.length) {
        return lingue[0]
      }
    } else {
      const id = (I18nManager.getConstants() as { localeIdentifier?: string }).localeIdentifier
      if (id) {
        return id
      }
    }
  } catch {
    // si prova con Intl
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale
  } catch {
    return 'en'
  }
}

/** La lingua del telefono, ridotta a quelle dell'app (inglese per tutte le altre). */
export function linguaTelefono(): Lingua {
  return codiceTelefono().toLowerCase().startsWith('it') ? 'it' : 'en'
}

let scelta: SceltaLingua = 'auto'
let corrente: Lingua = linguaTelefono()

export function lingua(): Lingua {
  return corrente
}

export function sceltaLingua(): SceltaLingua {
  return scelta
}

/** Locale per date, ore e numeri. */
export function loc(): string {
  return corrente === 'it' ? 'it-CH' : 'en-US'
}

/** Legge la scelta salvata (all'avvio, prima di mostrare l'app). */
export async function caricaLingua(): Promise<Lingua> {
  try {
    const v = await SecureStore.getItemAsync(CHIAVE)
    scelta = v === 'it' || v === 'en' ? v : 'auto'
  } catch {
    scelta = 'auto'
  }
  corrente = scelta === 'auto' ? linguaTelefono() : scelta
  return corrente
}

/** Cambia e salva la scelta; restituisce la lingua che vale ora. */
export async function salvaLingua(nuova: SceltaLingua): Promise<Lingua> {
  scelta = nuova
  corrente = nuova === 'auto' ? linguaTelefono() : nuova
  try {
    if (nuova === 'auto') {
      await SecureStore.deleteItemAsync(CHIAVE)
    } else {
      await SecureStore.setItemAsync(CHIAVE, nuova)
    }
  } catch {
    // resta per questa sessione
  }
  return corrente
}

type Valori = Record<string, string | number>

function riempi(testo: string, valori?: Valori): string {
  if (!valori) {
    return testo
  }
  return testo.replace(/\{(\w+)\}/g, (tutto, nome: string) => (nome in valori ? String(valori[nome]) : tutto))
}

/** Il testo nella lingua dell'app; {nome} viene sostituito dai valori. */
export function t(chiave: string, valori?: Valori): string {
  const testo = TESTI[corrente][chiave] ?? TESTI.it[chiave]
  if (testo === undefined) {
    if (__DEV__) {
      console.warn(`[i18n] testo mancante: ${chiave}`)
    }
    return chiave
  }
  return riempi(testo, valori)
}

/** Singolare o plurale: chiavi «<chiave>_uno» e «<chiave>_piu»; {n} e' il numero. */
export function tn(chiave: string, n: number, valori?: Valori): string {
  return t(`${chiave}_${n === 1 ? 'uno' : 'piu'}`, { n, ...valori })
}
