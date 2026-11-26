/**
 * Quali app di Odoo ha questo server, viste dall'utente collegato.
 *
 * L'elenco dei moduli (ir.module.module) lo legge solo l'amministratore: qui
 * si usano i menu che Odoo da' al suo client web, che ogni utente puo'
 * leggere e che portano l'identificativo di ogni app («calendar.mail_menu_calendar»).
 * Un'app che manca dai menu o non e' installata o l'utente non la puo' usare:
 * in tutti e due i casi deve intervenire l'amministratore del suo Odoo.
 */

import { spesePossibili } from '../../modules/gestable-nativo'
import { t } from '../i18n'
import { leggi, scrivi } from './archivio'
import { ErroreOdoo } from './client'

/** Gli identificativi dei menu che l'app sa usare. */
export const APP = {
  calendario: 'calendar.mail_menu_calendar',
  contatti: 'contacts.menu_contacts',
  messaggi: 'mail.menu_root_discuss',
  spese: 'hr_expense.menu_hr_expense_root',
} as const

/**
 * Le app di Odoo che l'app mostra con schermate sue: nella griglia della
 * scheda Odoo non compaiono (si trovano lo stesso cercandole per nome).
 */
export const APP_NATIVE: readonly string[] = [
  APP.calendario,
  APP.contatti,
  APP.messaggi,
  // Le Spese sono native solo dove c'e' lo scanner (build 1.2+ su iPhone).
  ...(spesePossibili ? [APP.spese] : []),
]

const DURATA_MS = 10 * 60_000
const TIMEOUT_MS = 15_000

type Voce = { at: number; menu: Promise<Set<string> | null> }
const memoria = new Map<string, Voce>()

async function scarica(percorso: string): Promise<Response> {
  const controllo = new AbortController()
  const timer = setTimeout(() => controllo.abort(), TIMEOUT_MS)
  try {
    return await fetch(percorso, { credentials: 'include', headers: { Accept: 'application/json' }, signal: controllo.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Gli xmlid dei menu visibili all'utente, o null se non si sa (rete, Odoo
 * troppo vecchio): in quel caso l'app prova lo stesso invece di bloccare.
 * Lancia ErroreOdoo('sessione') se il server non riconosce l'accesso.
 */
async function leggiMenu(server: string): Promise<Set<string> | null> {
  // Odoo 18 e successivi: /web/webclient/load_menus; Odoo 17: con un valore in fondo.
  let r = await scarica(`${server}/web/webclient/load_menus`)
  if (r.status === 404) {
    r = await scarica(`${server}/web/webclient/load_menus/${Date.now()}`)
  }
  // Senza accesso Odoo rimanda alla pagina di login (HTML, non JSON).
  if (r.url.includes('/web/login') || (r.headers.get('content-type') || '').includes('text/html')) {
    throw new ErroreOdoo('sessione', t('accesso.sessioneScaduta'))
  }
  if (!r.ok) {
    return null
  }
  const menu = (await r.json()) as Record<string, { xmlid?: string }>
  const xmlid = new Set<string>()
  for (const m of Object.values(menu)) {
    if (m?.xmlid) {
      xmlid.add(m.xmlid)
    }
  }
  return xmlid.size ? xmlid : null
}

/**
 * Le app native trovate l'ultima volta su questo server per questo utente,
 * salvate sul telefono: all'avvio Calendario e Contatti si aprono subito, e
 * intanto si ricontrolla con Odoo (il menu completo pesa centinaia di KB).
 */
export function menuSalvato(server: string, uid: number): Set<string> | null {
  const lista = leggi<string[]>(server, uid, 'app-native')
  return lista ? new Set(lista) : null
}

export function menuOdoo(server: string, forza = false, uid?: number): Promise<Set<string> | null> {
  const v = memoria.get(server)
  if (v && !forza && Date.now() - v.at < DURATA_MS) {
    return v.menu
  }
  const letto = leggiMenu(server)
  if (uid) {
    void letto.then((m) => m && scrivi(server, uid, 'app-native', APP_NATIVE.filter((x) => m.has(x)))).catch(() => {})
  }
  const menu = letto.catch((e: unknown) => {
    memoria.delete(server)
    if (e instanceof ErroreOdoo) {
      throw e
    }
    return null
  })
  memoria.set(server, { at: Date.now(), menu })
  return menu
}

/** Dimentica quanto letto (all'uscita o cambiando server). */
export function dimenticaMenu(): void {
  memoria.clear()
}
