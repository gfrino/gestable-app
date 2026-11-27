/**
 * Vendite di Odoo (modulo sale, modello sale.order): preventivi e ordini, un
 * documento con cliente, righe e totali, e le azioni dei pulsanti di Odoo
 * (invia per email, conferma, annulla, rimetti in preventivo, crea fattura).
 *
 * Le azioni passano dai metodi di Odoo, cosi' modelli email, numerazione,
 * consegne, controlli e permessi restano quelli del browser:
 * - «Invia» = `action_quotation_send` + la procedura dell'email
 *   (mail.compose.message) con il contesto che Odoo prepara (modello, PDF
 *   allegato, «segna come inviato»);
 * - «Crea fattura» = la procedura sale.advance.payment.inv, fattura normale.
 *
 * Le differenze tra le versioni si leggono dal server: unita' di misura della
 * riga `product_uom` (17) o `product_uom_id` (19, 20); nella 17 l'annullamento
 * di un ordine apre una procedura con l'email, che si salta come «Annulla senza
 * avvisare» (`disable_cancel_warning`).
 */

import { callKw } from './client'
import { dataOdoo, htmlDaTesto, testoDaHtml } from './testo'

type Id = number
type M2o = [number, string] | false

export const MODELLO = 'sale.order'

type Struttura = { uom: 'product_uom' | 'product_uom_id' | null; ordine: Set<string> }

const strutture = new Map<string, Promise<Struttura>>()

function struttura(server: string): Promise<Struttura> {
  let p = strutture.get(server)
  if (!p) {
    p = Promise.all([
      callKw<Record<string, unknown>>(server, 'sale.order', 'fields_get', [], { attributes: ['type'] }),
      callKw<Record<string, unknown>>(server, 'sale.order.line', 'fields_get', [], { attributes: ['type'] }),
    ]).then(([ordine, riga]) => ({
      uom: 'product_uom_id' in riga ? 'product_uom_id' : 'product_uom' in riga ? 'product_uom' : null,
      ordine: new Set(Object.keys(ordine)),
    }))
    p.catch(() => strutture.delete(server))
    strutture.set(server, p)
  }
  return p
}

// ---------------------------------------------------------------------------
// Elenco
// ---------------------------------------------------------------------------

export type Filtro = 'miei' | 'preventivi' | 'ordini' | 'fatturare'

export type Stato = 'draft' | 'sent' | 'sale' | 'cancel'
export type Fatturazione = 'no' | 'to invoice' | 'invoiced' | 'upselling'

export type Ordine = {
  id: Id
  /** Numero del documento (S00042). */
  nome: string
  cliente: string
  clienteId: Id | null
  totale: number
  valuta: string
  /** Giorno del documento, AAAA-MM-GG (ora locale). */
  data: string
  stato: Stato
  fatturazione: Fatturazione
  venditore: [Id, string] | null
  riferimento: string
}

type Riga = {
  id: Id
  name: string
  partner_id: M2o
  amount_total: number
  currency_id: M2o
  date_order: string | false
  state: string
  invoice_status: string | false
  user_id: M2o
  client_order_ref: string | false
}

const CAMPI_ELENCO = ['name', 'partner_id', 'amount_total', 'currency_id', 'date_order', 'state', 'invoice_status', 'user_id', 'client_order_ref']

function giorno(d: Date | null): string {
  return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : ''
}

function daRiga(r: Riga): Ordine {
  const stato = (['draft', 'sent', 'sale', 'cancel'] as const).find((x) => x === r.state) || 'draft'
  const fatt = (['to invoice', 'invoiced', 'upselling'] as const).find((x) => x === r.invoice_status) || 'no'
  return {
    id: r.id,
    nome: r.name,
    cliente: r.partner_id ? r.partner_id[1] : '',
    clienteId: r.partner_id ? r.partner_id[0] : null,
    totale: r.amount_total || 0,
    valuta: r.currency_id ? r.currency_id[1] : '',
    data: giorno(dataOdoo(r.date_order)),
    stato,
    fatturazione: fatt,
    venditore: r.user_id || null,
    riferimento: r.client_order_ref || '',
  }
}

function dominio(filtro: Filtro, uid: number, testo: string): unknown[] {
  const d: unknown[] =
    filtro === 'miei'
      ? [['state', 'in', ['draft', 'sent']], ['user_id', '=', uid]]
      : filtro === 'preventivi'
        ? [['state', 'in', ['draft', 'sent']]]
        : filtro === 'ordini'
          ? [['state', '=', 'sale']]
          : [['state', '=', 'sale'], ['invoice_status', '=', 'to invoice']]
  const q = testo.trim()
  if (q) {
    d.push('|', '|', ['name', 'ilike', q], ['partner_id', 'ilike', q], ['client_order_ref', 'ilike', q])
  }
  return d
}

export async function ordini(server: string, uid: number, filtro: Filtro, testo = ''): Promise<Ordine[]> {
  const righe = await callKw<Riga[]>(server, 'sale.order', 'search_read', [], {
    domain: dominio(filtro, uid, testo),
    fields: CAMPI_ELENCO,
    order: 'date_order desc, id desc',
    limit: 200,
  })
  return righe.map(daRiga)
}

/** Quanti documenti per filtro (i numeri sulle schede in alto). */
export async function conteggi(server: string, uid: number): Promise<Record<Filtro, number>> {
  const conta = (f: Filtro) => callKw<number>(server, 'sale.order', 'search_count', [dominio(f, uid, '')]).catch(() => 0)
  const [miei, preventivi, ordiniN, fatturare] = await Promise.all([conta('miei'), conta('preventivi'), conta('ordini'), conta('fatturare')])
  return { miei, preventivi, ordini: ordiniN, fatturare }
}

/** I preventivi e ordini di un'opportunita' del CRM (sale_crm). */
export async function diOpportunita(server: string, opportunitaId: Id): Promise<Ordine[]> {
  const s = await struttura(server)
  if (!s.ordine.has('opportunity_id')) {
    return []
  }
  const righe = await callKw<Riga[]>(server, 'sale.order', 'search_read', [], {
    domain: [['opportunity_id', '=', opportunitaId]],
    fields: CAMPI_ELENCO,
    order: 'date_order desc, id desc',
    limit: 50,
  })
  return righe.map(daRiga)
}

// ---------------------------------------------------------------------------
// Un documento
// ---------------------------------------------------------------------------

export type RigaOrdine = {
  id: Id
  /** Sezione o nota (righe senza prodotto) oppure riga di prodotto. */
  tipo: 'prodotto' | 'sezione' | 'nota'
  descrizione: string
  prodottoId: Id | null
  prodotto: string
  quantita: number
  unita: string
  prezzo: number
  sconto: number
  subtotale: number
  totale: number
  consegnata: number
  fatturata: number
}

export type Dettaglio = Ordine & {
  clienteAzienda: boolean
  email: string
  telefono: string
  imponibile: number
  imposte: number
  /** Scadenza del preventivo, AAAA-MM-GG. */
  scadenza: string
  pagamento: string
  note: string
  opportunita: [Id, string] | null
  segue: boolean
  bloccato: boolean
  fatture: Fattura[]
  righe: RigaOrdine[]
}

export type Fattura = { id: Id; nome: string; bozza: boolean; nota: boolean; totale: number; pagata: boolean }

export async function dettaglio(server: string, id: Id): Promise<Dettaglio | null> {
  const s = await struttura(server)
  const extra = ['amount_untaxed', 'amount_tax', 'validity_date', 'payment_term_id', 'note', 'message_is_follower', 'invoice_ids', 'order_line']
  for (const x of ['opportunity_id', 'locked']) {
    if (s.ordine.has(x)) extra.push(x)
  }
  const [r] = await callKw<(Riga & Record<string, unknown>)[]>(server, 'sale.order', 'read', [[id], [...CAMPI_ELENCO, ...extra]])
  if (!r) {
    return null
  }
  const campiRiga = ['display_type', 'name', 'product_id', 'product_uom_qty', 'price_unit', 'discount', 'price_subtotal', 'price_total', 'qty_delivered', 'qty_invoiced']
  if (s.uom) campiRiga.push(s.uom)
  const [righe, partner] = await Promise.all([
    callKw<Record<string, unknown>[]>(server, 'sale.order.line', 'search_read', [], {
      domain: [['order_id', '=', id]],
      fields: campiRiga,
      order: 'sequence, id',
    }),
    r.partner_id
      ? callKw<Record<string, unknown>[]>(server, 'res.partner', 'read', [[r.partner_id[0]], ['is_company', 'email', 'phone', ...(await campiMobile(server))]]).catch(() => [])
      : Promise.resolve([] as Record<string, unknown>[]),
  ])
  const p = partner[0] || {}
  const pagamento = r.payment_term_id as M2o
  const opp = r.opportunity_id as M2o | undefined
  return {
    ...daRiga(r),
    clienteAzienda: !!p.is_company,
    email: (p.email as string) || '',
    telefono: (p.phone as string) || (p.mobile as string) || '',
    imponibile: (r.amount_untaxed as number) || 0,
    imposte: (r.amount_tax as number) || 0,
    scadenza: (r.validity_date as string) || '',
    pagamento: pagamento ? pagamento[1] : '',
    note: testoDaHtml(r.note as string),
    opportunita: opp || null,
    segue: !!r.message_is_follower,
    bloccato: !!r.locked,
    fatture: await fatture(server, (r.invoice_ids as Id[]) || []),
    righe: righe.map((x) => {
      const prodotto = x.product_id as M2o
      const unita = (s.uom ? x[s.uom] : false) as M2o
      const tipo = x.display_type === 'line_section' ? 'sezione' : x.display_type === 'line_note' ? 'nota' : 'prodotto'
      return {
        id: x.id as Id,
        tipo,
        descrizione: (x.name as string) || '',
        prodottoId: prodotto ? prodotto[0] : null,
        prodotto: prodotto ? prodotto[1] : '',
        quantita: (x.product_uom_qty as number) || 0,
        unita: unita ? unita[1] : '',
        prezzo: (x.price_unit as number) || 0,
        sconto: (x.discount as number) || 0,
        subtotale: (x.price_subtotal as number) || 0,
        totale: (x.price_total as number) || 0,
        consegnata: (x.qty_delivered as number) || 0,
        fatturata: (x.qty_invoiced as number) || 0,
      }
    }),
  }
}

/** Le fatture dell'ordine (chi vende le legge; se no, nessuna riga invece di un errore). */
async function fatture(server: string, ids: Id[]): Promise<Fattura[]> {
  if (!ids.length) {
    return []
  }
  const r = await callKw<{ id: Id; name: string | false; state: string; move_type: string; amount_total: number; payment_state: string | false }[]>(
    server,
    'account.move',
    'read',
    [ids, ['name', 'state', 'move_type', 'amount_total', 'payment_state']],
  ).catch(() => [])
  return r
    .map((x) => ({
      id: x.id,
      nome: x.name && x.name !== '/' ? x.name : '',
      bozza: x.state === 'draft',
      nota: x.move_type === 'out_refund',
      totale: x.amount_total || 0,
      pagata: x.payment_state === 'paid' || x.payment_state === 'in_payment',
    }))
    .sort((a, b) => b.id - a.id)
}

/** `mobile` sul contatto c'e' fino alla 18. */
const mobili = new Map<string, Promise<string[]>>()
function campiMobile(server: string): Promise<string[]> {
  let p = mobili.get(server)
  if (!p) {
    p = callKw<Record<string, unknown>>(server, 'res.partner', 'fields_get', [['mobile']], { attributes: ['type'] })
      .then((f) => ('mobile' in f ? ['mobile'] : []))
      .catch(() => [])
    mobili.set(server, p)
  }
  return p
}

export type Modifica = Partial<{
  clienteId: Id
  venditore: Id | false
  scadenza: string | false
  riferimento: string
  note: string
}>

export async function aggiorna(server: string, id: Id, m: Modifica): Promise<void> {
  const v: Record<string, unknown> = {}
  if (m.clienteId !== undefined) v.partner_id = m.clienteId
  if (m.venditore !== undefined) v.user_id = m.venditore
  if (m.scadenza !== undefined) v.validity_date = m.scadenza
  if (m.riferimento !== undefined) v.client_order_ref = m.riferimento.trim() || false
  if (m.note !== undefined) v.note = m.note.trim() ? htmlDaTesto(m.note.trim()) : false
  await callKw(server, 'sale.order', 'write', [[id], v])
}

// ---------------------------------------------------------------------------
// Righe
// ---------------------------------------------------------------------------

/** Aggiunge un prodotto: prezzo, descrizione e imposte li calcola Odoo (listino del cliente). */
export async function aggiungiRiga(server: string, ordineId: Id, prodottoId: Id, quantita: number): Promise<void> {
  await callKw(server, 'sale.order', 'write', [[ordineId], { order_line: [[0, 0, { product_id: prodottoId, product_uom_qty: quantita }]] }])
}

export type ModificaRiga = Partial<{ quantita: number; prezzo: number; sconto: number; descrizione: string }>

export async function modificaRiga(server: string, rigaId: Id, m: ModificaRiga): Promise<void> {
  const v: Record<string, unknown> = {}
  if (m.quantita !== undefined) v.product_uom_qty = m.quantita
  if (m.prezzo !== undefined) v.price_unit = m.prezzo
  if (m.sconto !== undefined) v.discount = m.sconto
  if (m.descrizione !== undefined) v.name = m.descrizione.trim()
  await callKw(server, 'sale.order.line', 'write', [[rigaId], v])
}

export async function eliminaRiga(server: string, rigaId: Id): Promise<void> {
  await callKw(server, 'sale.order.line', 'unlink', [[rigaId]])
}

export type Prodotto = { id: Id; nome: string; codice: string; prezzo: number; unita: string }

/** Prodotti vendibili (sale_ok), per nome, codice o codice a barre. */
export async function cercaProdotti(server: string, testo: string): Promise<Prodotto[]> {
  const q = testo.trim()
  const domain: unknown[] = [['sale_ok', '=', true]]
  if (q) {
    domain.push('|', '|', ['name', 'ilike', q], ['default_code', 'ilike', q], ['barcode', '=', q])
  }
  const r = await callKw<{ id: Id; display_name: string; default_code: string | false; lst_price: number; uom_id: M2o }[]>(
    server,
    'product.product',
    'search_read',
    [],
    { domain, fields: ['display_name', 'default_code', 'lst_price', 'uom_id'], order: 'name, id', limit: 60 },
  )
  return r.map((x) => ({ id: x.id, nome: x.display_name, codice: x.default_code || '', prezzo: x.lst_price || 0, unita: x.uom_id ? x.uom_id[1] : '' }))
}

export function immagineProdotto(server: string, id: Id): string {
  return `${server}/web/image/product.product/${id}/image_128`
}

// ---------------------------------------------------------------------------
// Nuovo preventivo
// ---------------------------------------------------------------------------

export type Nuovo = {
  clienteId: Id
  venditore: Id | null
  righe: { prodottoId: Id; quantita: number }[]
  riferimento: string
  opportunitaId: Id | null
}

/** Nuovo preventivo: listino, condizioni e imposte li sceglie Odoo dal cliente, come nel browser. */
export async function crea(server: string, n: Nuovo): Promise<Id> {
  const v: Record<string, unknown> = {
    partner_id: n.clienteId,
    order_line: n.righe.map((r) => [0, 0, { product_id: r.prodottoId, product_uom_qty: r.quantita }]),
  }
  if (n.venditore) v.user_id = n.venditore
  if (n.riferimento.trim()) v.client_order_ref = n.riferimento.trim()
  if (n.opportunitaId && (await struttura(server)).ordine.has('opportunity_id')) v.opportunity_id = n.opportunitaId
  return callKw<Id>(server, 'sale.order', 'create', [v])
}

// ---------------------------------------------------------------------------
// Azioni (i pulsanti di Odoo)
// ---------------------------------------------------------------------------

export async function conferma(server: string, id: Id): Promise<void> {
  await callKw(server, 'sale.order', 'action_confirm', [[id]])
}

/** Annulla; nella 17 senza la procedura con l'email al cliente. */
export async function annulla(server: string, id: Id): Promise<void> {
  await callKw(server, 'sale.order', 'action_cancel', [[id]], { context: { disable_cancel_warning: true } })
}

/** Un documento annullato torna preventivo. */
export async function rimettiInPreventivo(server: string, id: Id): Promise<void> {
  await callKw(server, 'sale.order', 'action_draft', [[id]])
}

/**
 * Invia al cliente con il modello di Odoo (PDF allegato), come «Invia per
 * email» seguito da «Invia»: il preventivo passa a «Inviato».
 */
export async function inviaEmail(server: string, id: Id): Promise<void> {
  const azione = await callKw<{ context?: Record<string, unknown> }>(server, 'sale.order', 'action_quotation_send', [[id]])
  const context = azione?.context || {}
  const mago = await callKw<Id>(server, 'mail.compose.message', 'create', [{}], { context })
  await callKw(server, 'mail.compose.message', 'action_send_mail', [[mago]], { context })
}

/** «Crea fattura» → fattura normale (quanto consegnato o ordinato, secondo i prodotti). Torna l'id della fattura nuova. */
export async function creaFattura(server: string, id: Id): Promise<Id | null> {
  const context = { active_model: 'sale.order', active_ids: [id], active_id: id }
  const prima = await fattureDi(server, id)
  const mago = await callKw<Id>(server, 'sale.advance.payment.inv', 'create', [{ advance_payment_method: 'delivered' }], { context })
  await callKw(server, 'sale.advance.payment.inv', 'create_invoices', [[mago]], { context })
  const dopo = await fattureDi(server, id)
  const nuove = dopo.filter((x) => !prima.includes(x))
  return nuove.length ? Math.max(...nuove) : null
}

async function fattureDi(server: string, id: Id): Promise<Id[]> {
  const [r] = await callKw<{ invoice_ids: Id[] }[]>(server, 'sale.order', 'read', [[id], ['invoice_ids']])
  return r?.invoice_ids || []
}

/** Il PDF del preventivo o ordine, come «Stampa» di Odoo. */
export function urlPdf(server: string, id: Id): string {
  return `${server}/report/pdf/sale.report_saleorder/${id}`
}

/** Icona dell'app Vendite di Odoo (quella del menu, dal modulo sale_management). */
export function iconaVendite(server: string): string {
  return `${server}/sale_management/static/description/icon.png`
}
