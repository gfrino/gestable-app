/**
 * Cosa l'app ricorda fra un avvio e l'altro.
 *
 * Tutto nel portachiavi del telefono (SecureStore), non in AsyncStorage:
 * l'indirizzo del server e l'utente non sono segreti, ma l'identificativo del
 * dispositivo decide quale telefono squilla, e non deve finire in un backup
 * leggibile.
 */

import * as Crypto from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'
import type { Utente } from './client'

const CHIAVE = 'gestavoip.sessione'
const CHIAVE_DISPOSITIVO = 'gestavoip.dispositivo'
const CHIAVE_VERSIONE = 'gestavoip.portachiavi'

/**
 * Leggibili anche a telefono bloccato (dopo il primo sblocco dall'accensione):
 * CarPlay e le chiamate in arrivo partono con l'iPhone in tasca. Restano solo
 * su questo telefono e fuori dai backup leggibili, come prima.
 */
const OPZIONI: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }

/** Scrive da capo: aggiornare una voce esistente non ne cambia l'accessibilita'. */
async function salva(chiave: string, valore: string): Promise<void> {
  await SecureStore.deleteItemAsync(chiave).catch(() => undefined)
  await SecureStore.setItemAsync(chiave, valore, OPZIONI)
}

let migrata = false

/**
 * Fino alla 1.4.0 le voci erano leggibili solo a telefono sbloccato: in auto,
 * con l'iPhone bloccato, CarPlay chiedeva l'accesso. Alla prima lettura con il
 * telefono sbloccato si riscrivono con la nuova accessibilita'.
 */
async function migra(grezza: string): Promise<void> {
  if (migrata) {
    return
  }
  migrata = true
  try {
    if ((await SecureStore.getItemAsync(CHIAVE_VERSIONE)) === '2') {
      return
    }
    const dispositivo = await SecureStore.getItemAsync(CHIAVE_DISPOSITIVO)
    await salva(CHIAVE, grezza)
    if (dispositivo) {
      await salva(CHIAVE_DISPOSITIVO, dispositivo)
    }
    await salva(CHIAVE_VERSIONE, '2')
  } catch {
    migrata = false
  }
}

export type Sessione = {
  server: string
  db: string
  azienda: string
  utente: Utente
  /**
   * false: Odoo senza VOIP AI, l'app ha tutto tranne il telefono. Assente
   * nelle sessioni salvate prima che esistesse: erano tutte con il telefono.
   * utente.uid 0: accesso fatto dalla pagina di Odoo (Google, Microsoft):
   * la sessione vive solo nella vista Odoo, le schermate native chiedono
   * l'accesso con email e password.
   */
  voip?: boolean
}

/** Vero se la sessione ha il telefono (VOIP AI sul server). */
export function conTelefono(sessione: Sessione | null): boolean {
  return !!sessione && sessione.voip !== false
}

export async function leggiSessione(): Promise<Sessione | null> {
  const grezza = await SecureStore.getItemAsync(CHIAVE)
  if (!grezza) {
    return null
  }
  try {
    const sessione = JSON.parse(grezza) as Sessione
    void migra(grezza)
    return sessione
  } catch {
    await SecureStore.deleteItemAsync(CHIAVE)
    return null
  }
}

export async function salvaSessione(sessione: Sessione): Promise<void> {
  await salva(CHIAVE, JSON.stringify(sessione))
}

export async function dimenticaSessione(): Promise<void> {
  await SecureStore.deleteItemAsync(CHIAVE)
}

/**
 * Identificativo di questo telefono per il centralino.
 *
 * Una persona puo' avere il softphone sul Mac e sul telefono: ognuno ha la sua
 * identity Twilio, e squillano entrambi. Lo stesso valore va conservato fra
 * un avvio e l'altro, altrimenti a ogni apertura il centralino vedrebbe un
 * telefono nuovo. Il server tiene solo lettere minuscole e cifre, massimo 24.
 */
export async function idDispositivo(): Promise<string> {
  const esistente = await SecureStore.getItemAsync(CHIAVE_DISPOSITIVO)
  if (esistente) {
    return esistente
  }
  const nuovo = `m${Crypto.randomUUID().replace(/[^a-f0-9]/g, '').slice(0, 20)}`
  await salva(CHIAVE_DISPOSITIVO, nuovo)
  return nuovo
}
