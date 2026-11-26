/**
 * Spese (app Spese di Odoo, modulo hr_expense): le mie note spese, nuova spesa
 * da uno scontrino, modifica e invio per l'approvazione.
 *
 * Odoo 17 raggruppa le spese in «note spese» (hr.expense.sheet): si invia la
 * nota. Dalla 18 le note non ci sono piu' e si invia la singola spesa. Lo
 * scontrino diventa una spesa con create_expense_from_attachments, come quando
 * lo si carica in Odoo: e' l'allegato principale e, dove c'e' la lettura
 * automatica degli scontrini, Odoo la fa partire da solo.
 */

import { File } from 'expo-file-system'
import { t } from '../i18n'
import { callKw, ErroreOdoo } from './client'

type M2o = [number, string] | false

/** Come la vede l'utente: lo stato di Odoo cambia nome e passaggi tra le versioni. */
export type StatoSpesa = 'bozza' | 'inviata' | 'approvata' | 'pagata' | 'rifiutata'

export type Spesa = {
  id: number
  nome: string
  /** AAAA-MM-GG, come in Odoo. */
  data: string
  importo: number
  quantita: number
  valuta: string
  categoriaId: number | null
  categoria: string
  stato: StatoSpesa
  modificabile: boolean
  pagataDa: 'own_account' | 'company_account'
  note: string
  ricevutaId: number | null
  /** Odoo 17: la nota spese in cui e' la spesa. */
  notaId: number | null
}

export type Categoria = { id: number; nome: string; costo: number }

type Riga = {
  id: number
  name: string | false
  date: string | false
  total_amount_currency: number
  quantity: number
  currency_id: M2o
  product_id: M2o
  state: string
  is_editable?: boolean
  payment_mode: 'own_account' | 'company_account'
  description: string | false
  message_main_attachment_id?: M2o
  sheet_id?: M2o
}

const STATI: Record<string, StatoSpesa> = {
  draft: 'bozza',
  reported: 'bozza', // Odoo 17: in una nota spese non ancora inviata
  submitted: 'inviata',
  approved: 'approvata',
  posted: 'approvata',
  in_payment: 'approvata',
  done: 'pagata',
  paid: 'pagata',
  refused: 'rifiutata',
}

/** Campi che esistono su questo server (Odoo 17 ha le note spese, 18+ no). */
const campiDi = new Map<string, Promise<Set<string>>>()

function campi(server: string): Promise<Set<string>> {
  let p = campiDi.get(server)
  if (!p) {
    p = callKw<Record<string, unknown>>(server, 'hr.expense', 'fields_get', [], { attributes: ['type'] }).then(
      (f) => new Set(Object.keys(f)),
    )
    p.catch(() => campiDi.delete(server))
    campiDi.set(server, p)
  }
  return p
}

/** Odoo 17-19 ricevono il file in `datas`, Odoo 20 in `raw` (sempre in base64). */
const campoFileDi = new Map<string, Promise<'datas' | 'raw'>>()

function campoFile(server: string): Promise<'datas' | 'raw'> {
  let p = campoFileDi.get(server)
  if (!p) {
    p = callKw<Record<string, unknown>>(server, 'ir.attachment', 'fields_get', [], { attributes: ['type'] }).then((f) =>
      'datas' in f ? 'datas' : 'raw',
    )
    p.catch(() => campoFileDi.delete(server))
    campoFileDi.set(server, p)
  }
  return p
}

function daRiga(r: Riga): Spesa {
  return {
    id: r.id,
    nome: r.name || '',
    data: r.date || '',
    importo: r.total_amount_currency || 0,
    quantita: r.quantity || 1,
    valuta: r.currency_id ? r.currency_id[1] : '',
    categoriaId: r.product_id ? r.product_id[0] : null,
    // Odoo mostra il codice interno davanti («[FOOD] Pasti»): all'utente basta il nome.
    categoria: r.product_id ? r.product_id[1].replace(/^\[[^\]]*\]\s*/, '') : '',
    stato: STATI[r.state] || 'bozza',
    modificabile: r.is_editable !== false && (r.state === 'draft' || r.state === 'reported'),
    pagataDa: r.payment_mode,
    note: r.description || '',
    ricevutaId: r.message_main_attachment_id ? r.message_main_attachment_id[0] : null,
    notaId: r.sheet_id ? r.sheet_id[0] : null,
  }
}

async function leggiCampi(server: string): Promise<string[]> {
  const f = await campi(server)
  const base = ['name', 'date', 'total_amount_currency', 'quantity', 'currency_id', 'product_id', 'state', 'payment_mode', 'description']
  return [...base, ...['is_editable', 'message_main_attachment_id', 'sheet_id'].filter((x) => f.has(x))]
}

/** Le mie spese, le piu' recenti prima. */
export async function mieSpese(server: string, uid: number): Promise<Spesa[]> {
  const righe = await callKw<Riga[]>(server, 'hr.expense', 'search_read', [], {
    domain: [['employee_id.user_id', '=', uid]],
    fields: await leggiCampi(server),
    order: 'date desc, id desc',
    limit: 200,
  })
  return righe.map(daRiga)
}

export async function spesa(server: string, id: number): Promise<Spesa | null> {
  const righe = await callKw<Riga[]>(server, 'hr.expense', 'read', [[id], await leggiCampi(server)])
  return righe[0] ? daRiga(righe[0]) : null
}

/** Le categorie che si possono usare nelle spese. `costo` > 0: si indica la quantita' (es. km). */
export async function categorie(server: string): Promise<Categoria[]> {
  const r = await callKw<{ id: number; name: string; standard_price: number }[]>(server, 'product.product', 'search_read', [], {
    domain: [['can_be_expensed', '=', true]],
    fields: ['name', 'standard_price'],
    order: 'name',
    limit: 200,
  })
  return r.map((x) => ({ id: x.id, nome: x.name, costo: x.standard_price || 0 }))
}

/**
 * Nuova spesa dalle pagine di uno scontrino (file:// dello scanner). La prima
 * pagina diventa la spesa, le altre si allegano. Restituisce l'id della spesa.
 */
export async function spesaDaScontrino(server: string, pagine: string[]): Promise<number> {
  const giorno = new Date().toISOString().slice(0, 10)
  const campoDati = await campoFile(server)
  const allegati: number[] = []
  for (const [i, uri] of pagine.entries()) {
    const file = new File(uri)
    const dati = await file.base64()
    const id = await callKw<number>(server, 'ir.attachment', 'create', [
      {
        name: pagine.length > 1 ? `Scontrino ${giorno} (${i + 1}).jpg` : `Scontrino ${giorno}.jpg`,
        [campoDati]: dati,
        res_model: 'hr.expense',
        res_id: 0,
      },
    ])
    allegati.push(id)
    try {
      file.delete()
    } catch {
      // Il file temporaneo lo pulisce comunque iOS.
    }
  }
  // Dalla 18 e' un metodo del modello, in Odoo 17 dei record (si chiama su nessun
  // record). La risposta cambia (azione o id): la spesa si ritrova dall'allegato.
  try {
    await callKw(server, 'hr.expense', 'create_expense_from_attachments', [], { attachment_ids: [allegati[0]] })
  } catch (e) {
    if (e instanceof ErroreOdoo && (e.tipo === 'sessione' || e.tipo === 'rete' || e.tipo === 'occupato')) {
      throw e
    }
    const [gia] = await callKw<{ res_id: number }[]>(server, 'ir.attachment', 'read', [[allegati[0]], ['res_id']])
    if (gia?.res_id) {
      throw e
    }
    await callKw(server, 'hr.expense', 'create_expense_from_attachments', [[]], { attachment_ids: [allegati[0]] })
  }
  const [principale] = await callKw<{ res_id: number }[]>(server, 'ir.attachment', 'read', [[allegati[0]], ['res_id']])
  const id = principale?.res_id
  if (!id) {
    throw new Error(t('spese.erroreScontrino'))
  }
  if (allegati.length > 1) {
    await callKw(server, 'ir.attachment', 'write', [allegati.slice(1), { res_model: 'hr.expense', res_id: id }])
  }
  return id
}

export type Modifiche = {
  nome: string
  data: string
  categoriaId: number | null
  /** Importo totale, o quantita' per le categorie con un costo fisso. */
  valore: number
  conCosto: boolean
  pagataDa: 'own_account' | 'company_account'
  note: string
}

export async function salvaSpesa(server: string, id: number, m: Modifiche): Promise<void> {
  const valori: Record<string, unknown> = {
    name: m.nome.trim(),
    date: m.data,
    payment_mode: m.pagataDa,
    description: m.note.trim() || false,
  }
  if (m.categoriaId) {
    valori.product_id = m.categoriaId
  }
  if (m.conCosto) {
    valori.quantity = m.valore
  } else {
    valori.total_amount_currency = m.valore
  }
  await callKw(server, 'hr.expense', 'write', [[id], valori])
}

/** Invia la spesa per l'approvazione (Odoo 17: crea e invia la nota spese). */
export async function inviaSpesa(server: string, id: number): Promise<void> {
  const f = await campi(server)
  if (!f.has('sheet_id')) {
    await callKw(server, 'hr.expense', 'action_submit', [[id]])
    return
  }
  const [r] = await callKw<{ sheet_id: M2o }[]>(server, 'hr.expense', 'read', [[id], ['sheet_id']])
  let nota = r?.sheet_id ? r.sheet_id[0] : 0
  if (!nota) {
    const azione = await callKw<{ res_id?: number }>(server, 'hr.expense', 'action_submit_expenses', [[id]])
    nota = azione?.res_id || 0
  }
  if (!nota) {
    throw new Error(t('spese.erroreNota'))
  }
  await callKw(server, 'hr.expense.sheet', 'action_submit_sheet', [[nota]])
}

export async function eliminaSpesa(server: string, id: number): Promise<void> {
  await callKw(server, 'hr.expense', 'unlink', [[id]])
}

export function urlRicevuta(server: string, allegatoId: number, larghezza = 900): string {
  return `${server}/web/image/${allegatoId}?width=${larghezza}`
}

/** Icona dell'app Spese di Odoo (uguale dalla 17 alla 20). */
export function iconaSpese(server: string): string {
  return `${server}/hr_expense/static/description/icon.png`
}

export function dimenticaSpese(): void {
  campiDi.clear()
  campoFileDi.clear()
}
