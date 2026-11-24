/**
 * Chiamate a Odoo (JSON-RPC).
 *
 * La sessione e' il cookie `session_id` che Odoo imposta al login: lo
 * conservano iOS e Android nel loro archivio dei cookie e lo rimandano da
 * soli (`credentials: 'include'`). Qui non lo si legge e non lo si copia:
 * non serve, e un segreto in meno da tenere in giro.
 */

export type TipoErrore = 'sessione' | 'rete' | 'server' | 'accesso' | 'modulo'

export class ErroreOdoo extends Error {
  tipo: TipoErrore

  constructor(tipo: TipoErrore, messaggio: string) {
    super(messaggio)
    this.tipo = tipo
  }
}

const TIMEOUT_MS = 15_000

/** Da quello che l'operatore digita a un indirizzo pulito. */
export function normalizzaIndirizzo(testo: string): string {
  let url = testo.trim()
  if (!url) {
    return ''
  }
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`
  }
  // Chi copia l'indirizzo dal browser si porta dietro /web, /odoo, /web/login...
  url = url.replace(/\/(web|odoo)(\/.*)?$/i, '')
  return url.replace(/\/+$/, '')
}

export async function rpc<T>(
  base: string,
  percorso: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const controllo = new AbortController()
  const timer = setTimeout(() => controllo.abort(), TIMEOUT_MS)
  let risposta: Response
  try {
    risposta = await fetch(`${base}${percorso}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: Date.now(), params }),
      signal: controllo.signal,
    })
  } catch (e: unknown) {
    // Senza risposta non si distingue un indirizzo sbagliato da una rete
    // assente: il messaggio dice all'utente le due cose da controllare.
    const motivo =
      (e as Error)?.name === 'AbortError'
        ? 'Il server non risponde. Riprova fra poco.'
        : 'Server non raggiungibile: controlla l\'indirizzo e la connessione a internet.'
    throw new ErroreOdoo('rete', motivo)
  } finally {
    clearTimeout(timer)
  }

  if (risposta.status === 404) {
    throw new ErroreOdoo('modulo', 'Su questo server manca il modulo VOIP AI aggiornato.')
  }
  if (!risposta.ok) {
    throw new ErroreOdoo('server', `Il server ha risposto ${risposta.status}.`)
  }

  let corpo: { result?: T; error?: { message?: string; data?: { name?: string; message?: string } } }
  try {
    corpo = await risposta.json()
  } catch {
    throw new ErroreOdoo('server', 'Risposta non valida dal server.')
  }

  if (corpo.error) {
    const nome = corpo.error.data?.name || ''
    const messaggio = corpo.error.data?.message || corpo.error.message || 'Errore del server.'
    if (nome.includes('SessionExpired')) {
      throw new ErroreOdoo('sessione', 'La sessione e\' scaduta: accedi di nuovo.')
    }
    if (nome.includes('AccessDenied')) {
      throw new ErroreOdoo('accesso', 'Email o password non corrette.')
    }
    throw new ErroreOdoo('server', messaggio)
  }
  return corpo.result as T
}

export type InfoServer = { db: string; company: string; module_version: string }

/** Il server esiste, ha il modulo, e su quale database si entra. */
export async function infoServer(base: string): Promise<InfoServer> {
  const r = await rpc<{ status: string; message?: string } & InfoServer>(base, '/ai_telemarketing/mobile/info')
  if (r.status !== 'success') {
    throw new ErroreOdoo('server', r.message || 'Server non valido.')
  }
  return r
}

export type Utente = { uid: number; name: string; login: string; company: string }

export async function accedi(
  base: string,
  db: string,
  login: string,
  password: string,
): Promise<Utente> {
  const r = await rpc<{ uid?: number | false; name?: string; username?: string }>(
    base,
    '/web/session/authenticate',
    { db, login, password },
  )
  if (!r?.uid) {
    throw new ErroreOdoo('accesso', 'Email o password non corrette.')
  }
  return { uid: r.uid, name: r.name || login, login: r.username || login, company: '' }
}

export async function esci(base: string): Promise<void> {
  try {
    await rpc(base, '/web/session/destroy')
  } catch {
    // Uscire deve funzionare anche senza rete: la sessione locale si butta
    // comunque, quella sul server scade da sola.
  }
}

export function callKw<T>(
  base: string,
  model: string,
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {},
): Promise<T> {
  return rpc<T>(base, `/web/dataset/call_kw/${model}/${method}`, { model, method, args, kwargs })
}
