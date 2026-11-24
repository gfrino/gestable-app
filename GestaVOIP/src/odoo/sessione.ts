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

export type Sessione = {
  server: string
  db: string
  azienda: string
  utente: Utente
  /**
   * false: Odoo senza VOIP AI, l'app mostra solo Odoo e l'accesso lo fa la
   * pagina di Odoo (db, utente e azienda restano vuoti). Assente nelle
   * sessioni salvate prima che esistesse: erano tutte con il telefono.
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
    return JSON.parse(grezza) as Sessione
  } catch {
    await SecureStore.deleteItemAsync(CHIAVE)
    return null
  }
}

export async function salvaSessione(sessione: Sessione): Promise<void> {
  await SecureStore.setItemAsync(CHIAVE, JSON.stringify(sessione))
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
  await SecureStore.setItemAsync(CHIAVE_DISPOSITIVO, nuovo)
  return nuovo
}
