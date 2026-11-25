/**
 * Chiamate a Odoo (JSON-RPC).
 *
 * La sessione e' il cookie `session_id` che Odoo imposta al login: lo
 * conservano iOS e Android nel loro archivio dei cookie e lo rimandano da
 * soli (`credentials: 'include'`). Qui non lo si legge e non lo si copia:
 * non serve, e un segreto in meno da tenere in giro.
 */

import { t } from '../i18n'

export type TipoErrore = 'sessione' | 'rete' | 'server' | 'accesso' | 'modulo' | 'codice'

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
        ? t('accesso.erroreNonRisponde')
        : t('accesso.erroreNonRaggiungibile')
    throw new ErroreOdoo('rete', motivo)
  } finally {
    clearTimeout(timer)
  }

  if (risposta.status === 404) {
    throw new ErroreOdoo('modulo', t('accesso.erroreModulo'))
  }
  if (!risposta.ok) {
    throw new ErroreOdoo('server', t('accesso.erroreStato', { stato: risposta.status }))
  }

  let corpo: { result?: T; error?: { message?: string; data?: { name?: string; message?: string } } }
  try {
    corpo = await risposta.json()
  } catch {
    throw new ErroreOdoo('server', t('accesso.erroreRisposta'))
  }

  if (corpo.error) {
    const nome = corpo.error.data?.name || ''
    const messaggio = corpo.error.data?.message || corpo.error.message || t('accesso.erroreServer')
    if (nome.includes('SessionExpired')) {
      throw new ErroreOdoo('sessione', t('accesso.sessioneScaduta'))
    }
    if (nome.includes('AccessDenied')) {
      throw new ErroreOdoo('accesso', t('accesso.credenzialiErrate'))
    }
    throw new ErroreOdoo('server', messaggio)
  }
  return corpo.result as T
}

export type InfoServer = {
  db: string
  company: string
  module_version: string
  /** false: Odoo senza VOIP AI (o troppo vecchio). L'app apre Odoo, senza telefono. */
  voip: boolean
}

/**
 * Il server esiste, se ha VOIP AI e su quale database si entra.
 *
 * Senza VOIP AI l'app serve lo stesso: diventa Odoo in un'app, come quella
 * desktop. Per distinguere "Odoo senza modulo" da "non e' un Odoo" si chiede
 * la versione, che Odoo da' senza login da sempre.
 */
export async function infoServer(base: string): Promise<InfoServer> {
  try {
    const r = await rpc<{ status: string; message?: string } & InfoServer>(base, '/ai_telemarketing/mobile/info')
    if (r.status !== 'success') {
      throw new ErroreOdoo('server', r.message || t('accesso.serverNonValido'))
    }
    return { ...r, voip: true }
  } catch (e) {
    if (!(e instanceof ErroreOdoo) || e.tipo !== 'modulo') {
      throw e
    }
  }
  try {
    await rpc<{ server_version?: string }>(base, '/web/webclient/version_info')
  } catch (e) {
    if (e instanceof ErroreOdoo && e.tipo === 'rete') {
      throw e
    }
    throw new ErroreOdoo('server', t('accesso.nonOdoo'))
  }
  return { db: '', company: '', module_version: '', voip: false }
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
  if (r?.uid) {
    return { uid: r.uid, name: r.name || login, login: r.username || login, company: '' }
  }
  // Password sbagliata = errore AccessDenied (gestito in rpc). Una risposta
  // senza uid e senza errore vuol dire password giusta e verifica in due
  // passaggi attiva: Odoo aspetta il codice. Se il telefono e' gia' fidato
  // (cookie td_id, es. dato dal login nella vista web) basta aprire la pagina
  // del codice.
  await paginaCodice(base)
  const utente = await utenteCollegato(base)
  if (utente) {
    return utente
  }
  throw new ErroreOdoo('codice', t('accesso.serveCodice'))
}

/**
 * Accesso dalla pagina di login di Odoo (/web/login), per gli Odoo senza VOIP
 * AI: non serve sapere il nome del database (lo sceglie il server), e il
 * cookie di sessione resta all'app, che lo passa poi alla vista web.
 * Stessi esiti di accedi(): utente, codice della verifica in due passaggi, o
 * credenziali sbagliate.
 */
export async function accediDallaPagina(base: string, login: string, password: string): Promise<Utente & { db: string }> {
  const controllo = new AbortController()
  const timer = setTimeout(() => controllo.abort(), TIMEOUT_MS * 2)
  let finale = ''
  try {
    const pagina = await fetch(`${base}/web/login`, { credentials: 'include', signal: controllo.signal })
    const html = await pagina.text()
    const token = /name="csrf_token"[^>]*value="([^"]+)"/.exec(html)?.[1] || ''
    if (!token) {
      throw new ErroreOdoo('server', t('accesso.nonPaginaAccesso'))
    }
    const r = await fetch(`${base}/web/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf_token: token, login, password, redirect: '/web' }).toString(),
      signal: controllo.signal,
    })
    finale = r.url || ''
  } catch (e) {
    if (e instanceof ErroreOdoo) {
      throw e
    }
    throw new ErroreOdoo('rete', t('accesso.erroreNonRaggiungibile'))
  } finally {
    clearTimeout(timer)
  }
  const info = await infoSessione(base)
  if (info) {
    return info
  }
  if (/\/web\/login\/totp/.test(finale)) {
    throw new ErroreOdoo('codice', t('accesso.serveCodice'))
  }
  throw new ErroreOdoo('accesso', t('accesso.credenzialiErrate'))
}

/**
 * Odoo che apre la sessione da solo (le istanze demo con tw_demo_odoo entrano
 * come l'utente demo appena si apre /web/login): l'utente collegato, o null
 * per un Odoo normale, che mostra la pagina di accesso.
 */
export async function sessioneAutomatica(base: string): Promise<(Utente & { db: string }) | null> {
  const controllo = new AbortController()
  const timer = setTimeout(() => controllo.abort(), TIMEOUT_MS)
  try {
    // Dopo l'accesso Odoo rimanda a «redirect»: una pagina pubblica, perche'
    // su iOS il cookie appena ricevuto non viaggia con il rinvio e /odoo
    // rimanderebbe di nuovo al login, in un giro senza fine.
    await fetch(`${base}/web/login?redirect=${encodeURIComponent('/web/health')}`, {
      credentials: 'include',
      signal: controllo.signal,
    })
  } catch {
    // Si guarda lo stesso se la sessione c'e'.
  } finally {
    clearTimeout(timer)
  }
  try {
    return await infoSessione(base)
  } catch {
    return null
  }
}

/** Utente e database della sessione aperta, o null se non c'e' (o aspetta il codice). */
export async function infoSessione(base: string): Promise<(Utente & { db: string }) | null> {
  try {
    const r = await rpc<{
      uid?: number | false
      name?: string
      username?: string
      db?: string
      user_companies?: { current_company?: number; allowed_companies?: Record<string, { name?: string }> }
    }>(base, '/web/session/get_session_info')
    if (!r?.uid) {
      return null
    }
    const corrente = r.user_companies?.current_company
    const azienda = corrente ? r.user_companies?.allowed_companies?.[String(corrente)]?.name || '' : ''
    return { uid: r.uid, name: r.name || '', login: r.username || '', company: azienda, db: r.db || '' }
  } catch (e) {
    if (e instanceof ErroreOdoo && e.tipo === 'sessione') {
      return null
    }
    throw e
  }
}

/** Utente della sessione aperta, o null se Odoo aspetta ancora il codice. */
async function utenteCollegato(base: string): Promise<Utente | null> {
  try {
    const r = await rpc<{ uid?: number | false; name?: string; username?: string }>(base, '/web/session/get_session_info')
    return r?.uid ? { uid: r.uid, name: r.name || '', login: r.username || '', company: '' } : null
  } catch (e) {
    if (e instanceof ErroreOdoo && e.tipo === 'sessione') {
      return null
    }
    throw e
  }
}

/**
 * Apre la pagina del codice di Odoo (`/web/login/totp`, Odoo 17 e 19) e ne
 * restituisce il token CSRF del modulo. Con un telefono gia' fidato Odoo
 * chiude qui l'accesso e rimanda a /web: il token allora non c'e'.
 */
async function paginaCodice(base: string): Promise<string> {
  const controllo = new AbortController()
  const timer = setTimeout(() => controllo.abort(), TIMEOUT_MS)
  try {
    const risposta = await fetch(`${base}/web/login/totp`, { credentials: 'include', signal: controllo.signal })
    const html = await risposta.text()
    return /name="csrf_token"[^>]*value="([^"]+)"/.exec(html)?.[1] || ''
  } catch {
    throw new ErroreOdoo('rete', t('accesso.erroreSenzaRete'))
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Secondo passo dell'accesso: il codice dell'app di autenticazione (o quello
 * ricevuto per email). Senza `remember`: con quella casella Odoo 17 e 19
 * danno il nome al dispositivo dal browser dello User-Agent e con quello
 * dell'app (nessun browser) rispondono 500. Il codice serve comunque solo a
 * un nuovo accesso: la sessione dell'app resta aperta.
 */
export async function confermaCodice(base: string, codice: string): Promise<Utente> {
  const token = await paginaCodice(base)
  const gia = await utenteCollegato(base)
  if (gia) {
    return gia
  }
  if (!token) {
    throw new ErroreOdoo('sessione', t('accesso.codiceScaduto'))
  }
  const controllo = new AbortController()
  const timer = setTimeout(() => controllo.abort(), TIMEOUT_MS)
  try {
    await fetch(`${base}/web/login/totp`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf_token: token, totp_token: codice.replace(/\s/g, '') }).toString(),
      signal: controllo.signal,
    })
  } catch {
    throw new ErroreOdoo('rete', t('accesso.erroreSenzaRete'))
  } finally {
    clearTimeout(timer)
  }
  const utente = await utenteCollegato(base)
  if (!utente) {
    throw new ErroreOdoo('accesso', t('accesso.codiceNonValido'))
  }
  return utente
}

export async function esci(base: string): Promise<void> {
  contestoDi.delete(base)
  try {
    await rpc(base, '/web/session/destroy')
  } catch {
    // Uscire deve funzionare anche senza rete: la sessione locale si butta
    // comunque, quella sul server scade da sola.
  }
}

/**
 * Il contesto dell'utente di Odoo (lingua, fuso orario), come lo manda il
 * client web: senza, Odoo risponde in inglese (nomi dei promemoria, scelte dei
 * campi...) quando la sessione non ha la lingua (accesso automatico del server
 * demo, sessione ripresa all'avvio). Letto una volta per server.
 */
const contestoDi = new Map<string, Promise<Record<string, unknown> | null>>()

function contesto(base: string): Promise<Record<string, unknown> | null> {
  let p = contestoDi.get(base)
  if (!p) {
    // Le preferenze dell'utente (lingua, fuso): la sessione dell'accesso
    // automatico puo' avere una lingua diversa da quella dell'utente.
    p = rpc<Record<string, unknown>>(base, '/web/dataset/call_kw/res.users/context_get', {
      model: 'res.users',
      method: 'context_get',
      args: [],
      kwargs: {},
    })
      .then((r) => (r && typeof r === 'object' ? r : null))
      .catch(() => {
        contestoDi.delete(base)
        return null
      })
    contestoDi.set(base, p)
  }
  return p
}

/** Da chiamare cambiando utente o server. */
export function dimenticaContesto(): void {
  contestoDi.clear()
}

export async function callKw<T>(
  base: string,
  model: string,
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {},
): Promise<T> {
  const ctx = await contesto(base)
  const conContesto = ctx ? { ...kwargs, context: { ...ctx, ...((kwargs.context as Record<string, unknown>) || {}) } } : kwargs
  return rpc<T>(base, `/web/dataset/call_kw/${model}/${method}`, { model, method, args, kwargs: conContesto })
}
