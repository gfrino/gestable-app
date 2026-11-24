/**
 * Server Odoo autorizzati a usare GestaVOIP.
 *
 * La lista la tiene ticinoWEB nel suo Odoo (modulo tw_app_allowlist, menu
 * «App GestABLE › Server autorizzati») e la pubblica firmata con Ed25519.
 * Qui c'e' solo la chiave pubblica: la firma garantisce che la lista viene da
 * li' e non e' stata cambiata per strada.
 *
 * L'ultima lista valida resta nel portachiavi: se ticinoweb.online non
 * risponde si usa quella, fino alla scadenza scritta dentro (30 giorni).
 */

import { ed25519 } from '@noble/curves/ed25519'
import * as SecureStore from 'expo-secure-store'

const URL_LISTA = 'https://ticinoweb.online/tw_app/allowlist'
const CHIAVE_PUBBLICA = 'KJ4KGo4Gyb+817IWRbirytpVoYoiT4/JaPwPjTtHUZo='
const APP = 'gestavoip'
const CACHE = 'gestavoip.server_autorizzati'
const TIMEOUT_MS = 8_000

type Documento = { payload: string; signature: string }
type Lista = { v: number; issued: number; expires: number; servers: { origin: string; apps: string[] }[] }

export type Esito = 'autorizzato' | 'non-autorizzato' | 'non-verificabile'

function byte(base64: string): Uint8Array {
  const testo = atob(base64)
  const out = new Uint8Array(testo.length)
  for (let i = 0; i < testo.length; i += 1) {
    out[i] = testo.charCodeAt(i)
  }
  return out
}

/** L'origine come la scrive la lista: schema e host minuscoli, senza porta standard. */
export function origineDi(indirizzo: string): string {
  const m = /^(https?):\/\/([^/?#:]+)(?::(\d+))?/i.exec(indirizzo.trim())
  if (!m) {
    return ''
  }
  const schema = m[1].toLowerCase()
  const host = m[2].toLowerCase().replace(/\.$/, '')
  const porta = m[3] && !((schema === 'https' && m[3] === '443') || (schema === 'http' && m[3] === '80')) ? `:${m[3]}` : ''
  return `${schema}://${host}${porta}`
}

/** La lista, solo se la firma e' giusta e non e' scaduta. */
function leggi(doc: Documento | null): Lista | null {
  if (!doc?.payload || !doc.signature) {
    return null
  }
  try {
    const dati = byte(doc.payload)
    if (!ed25519.verify(byte(doc.signature), dati, byte(CHIAVE_PUBBLICA))) {
      return null
    }
    // UTF-8 senza TextDecoder, che il motore JavaScript del telefono puo' non avere.
    const testo = decodeURIComponent(Array.from(dati, (b) => `%${b.toString(16).padStart(2, '0')}`).join(''))
    const lista = JSON.parse(testo) as Lista
    if (lista.v !== 1 || !Array.isArray(lista.servers) || lista.expires * 1000 < Date.now()) {
      return null
    }
    return lista
  } catch {
    return null
  }
}

async function scarica(): Promise<Documento | null> {
  const controllo = new AbortController()
  const timer = setTimeout(() => controllo.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(URL_LISTA, { signal: controllo.signal, headers: { Accept: 'application/json' } })
    return r.ok ? ((await r.json()) as Documento) : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function listaValida(): Promise<Lista | null> {
  const nuovo = await scarica()
  const fresca = leggi(nuovo)
  if (fresca && nuovo) {
    await SecureStore.setItemAsync(CACHE, JSON.stringify(nuovo)).catch(() => undefined)
    return fresca
  }
  // ticinoweb.online non risponde (o risposta non valida): l'ultima buona.
  try {
    return leggi(JSON.parse((await SecureStore.getItemAsync(CACHE)) || 'null') as Documento | null)
  } catch {
    return null
  }
}

/**
 * Questo server puo' usare GestaVOIP?
 *
 * «non-verificabile» solo se non c'e' ne' una lista scaricabile ne' una
 * valida in memoria (primo avvio senza internet, o piu' di 30 giorni senza
 * raggiungere ticinoweb.online).
 */
export async function verificaServer(server: string): Promise<Esito> {
  const origine = origineDi(server)
  // Nelle build di sviluppo i server di prova sul Mac (Docker) passano.
  if (__DEV__ && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origine)) {
    return 'autorizzato'
  }
  const lista = await listaValida()
  if (!lista) {
    return 'non-verificabile'
  }
  return lista.servers.some((s) => s.origin === origine && s.apps.includes(APP)) ? 'autorizzato' : 'non-autorizzato'
}

export const MESSAGGIO_NON_AUTORIZZATO =
  'Questo Odoo non è abilitato per GestaVOIP. Per attivarlo contatta ticinoWEB.'
export const MESSAGGIO_NON_VERIFICABILE =
  'Non riesco a verificare il server: controlla la connessione a internet e riprova.'
