/**
 * Chiamate a Odoo (JSON-RPC).
 *
 * La sessione e' il cookie `session_id` che Odoo imposta al login: lo
 * conservano iOS e Android nel loro archivio dei cookie e lo rimandano da
 * soli (`credentials: 'include'`). Qui non lo si legge e non lo si copia:
 * non serve, e un segreto in meno da tenere in giro.
 */

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
        ? 'Il server non risponde. Riprova fra poco.'
        : 'Server non raggiungibile: controlla l\'indirizzo e la connessione a internet.'
    throw new ErroreOdoo('rete', motivo)
  } finally {
    clearTimeout(timer)
  }

  if (risposta.status === 404) {
    throw new ErroreOdoo('modulo', "Questo Odoo non ha il modulo VOIP AI aggiornato (serve la versione 2.36 o successiva).")
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
      throw new ErroreOdoo('server', r.message || 'Server non valido.')
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
    throw new ErroreOdoo('server', "A questo indirizzo non risponde un Odoo: controlla l'indirizzo.")
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
  throw new ErroreOdoo('codice', 'Serve il codice della verifica in due passaggi.')
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
      throw new ErroreOdoo('server', "A questo indirizzo non risponde la pagina di accesso di Odoo.")
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
    throw new ErroreOdoo('rete', "Server non raggiungibile: controlla l'indirizzo e la connessione a internet.")
  } finally {
    clearTimeout(timer)
  }
  const info = await infoSessione(base)
  if (info) {
    return info
  }
  if (/\/web\/login\/totp/.test(finale)) {
    throw new ErroreOdoo('codice', 'Serve il codice della verifica in due passaggi.')
  }
  throw new ErroreOdoo('accesso', 'Email o password non corrette.')
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
    throw new ErroreOdoo('rete', "Server non raggiungibile: controlla la connessione a internet.")
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
    throw new ErroreOdoo('sessione', 'Il tempo per il codice e\' scaduto: accedi di nuovo.')
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
    throw new ErroreOdoo('rete', "Server non raggiungibile: controlla la connessione a internet.")
  } finally {
    clearTimeout(timer)
  }
  const utente = await utenteCollegato(base)
  if (!utente) {
    throw new ErroreOdoo('accesso', 'Codice non valido o scaduto: riprova con quello nuovo.')
  }
  return utente
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
