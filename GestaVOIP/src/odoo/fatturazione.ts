/**
 * Fatturazione di Odoo (modulo account, modello account.move): fatture e note
 * di credito di clienti e fornitori, con righe, totali, quanto resta da pagare
 * e le azioni dei pulsanti di Odoo.
 *
 * Le azioni passano dai metodi di Odoo, cosi' numerazione, controlli, modelli
 * email e permessi restano quelli del browser:
 * - «Conferma» = `action_post`;
 * - «Invia» = `action_invoice_sent` e la procedura che Odoo restituisce:
 *   `account.move.send` nella 17, `account.move.send.wizard` dalla 18 alla 20.
 *   Si legge dal server quale procedura arriva e se l'email e' pronta; in ogni
 *   altro caso la fattura si apre in Odoo Web, dove si finisce a mano;
 * - «Registra pagamento» resta in Odoo Web (la procedura dei pagamenti ha
 *   troppe varianti: banche, differenze, valute).
 *
 * I campi si leggono dal server (fields_get) prima di usarli: unita' di misura
 * della riga `product_uom_id` (o `product_uom`), «inviata» `is_move_sent`,
 * condizioni di pagamento, origine e così via.
 */

import { callKw, ErroreOdoo } from './client'
import { testoDaHtml } from './testo'

type Id = number
type M2o = [number, string] | false

export const MODELLO = 'account.move'

/** Fatture e note di credito (le altre registrazioni contabili restano in Odoo Web). */
const TIPI_FATTURA = ['out_invoice', 'out_refund', 'in_invoice', 'in_refund']

type Struttura = { fattura: Set<string>; uom: 'product_uom_id' | 'product_uom' | null }

const strutture = new Map<string, Promise<Struttura>>()

function struttura(server: string): Promise<Struttura> {
  let p = strutture.get(server)
  if (!p) {
    p = Promise.all([
      callKw<Record<string, unknown>>(server, 'account.move', 'fields_get', [], { attributes: ['type'] }),
      callKw<Record<string, unknown>>(server, 'account.move.line', 'fields_get', [], { attributes: ['type'] }),
    ]).then(([fattura, riga]) => ({
      fattura: new Set(Object.keys(fattura)),
      uom: 'product_uom_id' in riga ? 'product_uom_id' : 'product_uom' in riga ? 'product_uom' : null,
    }))
    p.catch(() => strutture.delete(server))
    strutture.set(server, p)
  }
  return p
}

/** Solo i campi che questo Odoo ha. */
function presenti(s: Struttura, campi: string[]): string[] {
  return campi.filter((x) => s.fattura.has(x))
}

function oggi(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Elenco
// ---------------------------------------------------------------------------

export type Filtro = 'incassare' | 'scadute' | 'bozze' | 'fornitori' | 'tutte'

export const FILTRI: Filtro[] = ['incassare', 'scadute', 'bozze', 'fornitori', 'tutte']

/** 'entry' = registrazione contabile che non e' una fattura (da una notifica): la scheda la apre in Odoo Web. */
export type Tipo = 'out_invoice' | 'out_refund' | 'in_invoice' | 'in_refund' | 'entry'

/**
 * Lo stato come lo legge chi usa l'app: dalla fase (bozza, registrata,
 * annullata) e dal pagamento (payment_state di Odoo).
 */
export type StatoFattura = 'bozza' | 'daPagare' | 'parziale' | 'inPagamento' | 'pagata' | 'stornata' | 'bloccata' | 'annullata'

export type Fattura = {
  id: Id
  /** Numero (INV/2026/00042); vuoto per una bozza mai confermata. */
  nome: string
  tipo: Tipo
  cliente: string
  clienteId: Id | null
  totale: number
  /** Quanto resta da pagare (amount_residual). */
  residuo: number
  valuta: string
  /** Data della fattura, AAAA-MM-GG. */
  data: string
  /** Scadenza, AAAA-MM-GG. */
  scadenza: string
  stato: StatoFattura
  /** Registrata, non pagata del tutto e con la scadenza passata. */
  scaduta: boolean
  riferimento: string
}

type Riga = {
  id: Id
  name: string | false
  move_type: string
  partner_id: M2o
  amount_total: number
  amount_residual: number
  currency_id: M2o
  invoice_date: string | false
  invoice_date_due: string | false
  state: string
  payment_state: string | false
  ref?: string | false
}

const CAMPI_ELENCO = ['name', 'move_type', 'partner_id', 'amount_total', 'amount_residual', 'currency_id', 'invoice_date', 'invoice_date_due', 'state', 'payment_state', 'ref']

function stato(state: string, pagamento: string | false): StatoFattura {
  if (state === 'draft') return 'bozza'
  if (state === 'cancel') return 'annullata'
  switch (pagamento) {
    case 'paid':
    // «Invoicing App Legacy»: fatture di prima della contabilita', considerate chiuse.
    case 'invoicing_legacy':
      return 'pagata'
    case 'partial':
      return 'parziale'
    case 'in_payment':
      return 'inPagamento'
    case 'reversed':
      return 'stornata'
    case 'blocked':
      return 'bloccata'
    default:
      return 'daPagare'
  }
}

function daRiga(r: Riga): Fattura {
  const st = stato(r.state, r.payment_state)
  const scadenza = r.invoice_date_due || ''
  const tipo = (TIPI_FATTURA.find((x) => x === r.move_type) || 'entry') as Tipo
  return {
    id: r.id,
    nome: r.name && r.name !== '/' ? r.name : '',
    tipo,
    cliente: r.partner_id ? r.partner_id[1] : '',
    clienteId: r.partner_id ? r.partner_id[0] : null,
    totale: r.amount_total || 0,
    residuo: r.amount_residual || 0,
    valuta: r.currency_id ? r.currency_id[1] : '',
    data: r.invoice_date || '',
    scadenza,
    stato: st,
    scaduta: (st === 'daPagare' || st === 'parziale') && !!scadenza && scadenza < oggi(),
    riferimento: r.ref || '',
  }
}

const DA_PAGARE = ['payment_state', 'in', ['not_paid', 'partial']]

function dominio(filtro: Filtro, testo: string): unknown[] {
  const d: unknown[] =
    filtro === 'incassare'
      ? [['move_type', '=', 'out_invoice'], ['state', '=', 'posted'], DA_PAGARE]
      : filtro === 'scadute'
        ? [['move_type', '=', 'out_invoice'], ['state', '=', 'posted'], DA_PAGARE, ['invoice_date_due', '<', oggi()]]
        : filtro === 'bozze'
          ? [['move_type', 'in', TIPI_FATTURA], ['state', '=', 'draft']]
          : filtro === 'fornitori'
            ? [['move_type', '=', 'in_invoice'], ['state', '=', 'posted'], DA_PAGARE]
            : [['move_type', 'in', TIPI_FATTURA]]
  const q = testo.trim()
  if (q) {
    d.push('|', '|', ['name', 'ilike', q], ['partner_id', 'ilike', q], ['ref', 'ilike', q])
  }
  return d
}

function ordine(filtro: Filtro): string {
  // Da incassare e da pagare: prima quelle che scadono prima.
  return filtro === 'incassare' || filtro === 'scadute' || filtro === 'fornitori'
    ? 'invoice_date_due asc, id asc'
    : 'invoice_date desc, id desc'
}

export async function fatture(server: string, filtro: Filtro, testo = ''): Promise<Fattura[]> {
  const s = await struttura(server)
  const righe = await callKw<Riga[]>(server, 'account.move', 'search_read', [], {
    domain: dominio(filtro, testo),
    fields: presenti(s, CAMPI_ELENCO),
    order: ordine(filtro),
    limit: 200,
  })
  return righe.map(daRiga)
}

/** Quanti documenti per filtro (i numeri sulle schede in alto). */
export async function conteggi(server: string): Promise<Record<Filtro, number>> {
  const conta = (f: Filtro) => callKw<number>(server, 'account.move', 'search_count', [dominio(f, '')]).catch(() => 0)
  const n = await Promise.all(FILTRI.map(conta))
  return Object.fromEntries(FILTRI.map((f, i) => [f, n[i]])) as Record<Filtro, number>
}

export type Riepilogo = { daIncassare: number; scaduto: number; valuta: string }

/**
 * Quanto c'e' da incassare dai clienti e quanto e' gia' scaduto, nella valuta
 * dell'azienda (amount_residual_signed). Somma fatta sul telefono invece di
 * read_group, che cambia tra la 17 e la 19. Null se le aziende hanno valute diverse.
 */
export async function riepilogo(server: string): Promise<Riepilogo | null> {
  const s = await struttura(server)
  if (!s.fattura.has('amount_residual_signed') || !s.fattura.has('company_currency_id')) {
    return null
  }
  const righe = await callKw<{ amount_residual_signed: number; invoice_date_due: string | false; company_currency_id: M2o }[]>(
    server,
    'account.move',
    'search_read',
    [],
    { domain: dominio('incassare', ''), fields: ['amount_residual_signed', 'invoice_date_due', 'company_currency_id'], limit: 5000 },
  )
  const valute = new Set(righe.map((r) => (r.company_currency_id ? r.company_currency_id[1] : '')))
  if (valute.size > 1) {
    return null
  }
  const g = oggi()
  let daIncassare = 0
  let scaduto = 0
  for (const r of righe) {
    daIncassare += r.amount_residual_signed || 0
    if (r.invoice_date_due && r.invoice_date_due < g) {
      scaduto += r.amount_residual_signed || 0
    }
  }
  return { daIncassare, scaduto, valuta: [...valute][0] || '' }
}

// ---------------------------------------------------------------------------
// Un documento
// ---------------------------------------------------------------------------

export type RigaFattura = {
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
}

export type Dettaglio = Fattura & {
  clienteAzienda: boolean
  email: string
  telefono: string
  imponibile: number
  imposte: number
  pagamento: string
  origine: string
  venditore: [Id, string] | null
  note: string
  /** Gia' inviata al cliente (is_move_sent), dove Odoo lo segna. */
  inviata: boolean
  segue: boolean
  righe: RigaFattura[]
}

export async function dettaglio(server: string, id: Id): Promise<Dettaglio | null> {
  const s = await struttura(server)
  const extra = presenti(s, ['amount_untaxed', 'amount_tax', 'invoice_payment_term_id', 'invoice_origin', 'invoice_user_id', 'narration', 'is_move_sent', 'message_is_follower', 'invoice_line_ids'])
  const [r] = await callKw<(Riga & Record<string, unknown>)[]>(server, 'account.move', 'read', [[id], [...presenti(s, CAMPI_ELENCO), ...extra]])
  if (!r) {
    return null
  }
  const campiRiga = ['display_type', 'name', 'product_id', 'quantity', 'price_unit', 'discount', 'price_subtotal', 'sequence']
  if (s.uom) campiRiga.push(s.uom)
  const idRighe = (r.invoice_line_ids as Id[] | undefined) || []
  const [righe, partner] = await Promise.all([
    idRighe.length ? callKw<Record<string, unknown>[]>(server, 'account.move.line', 'read', [idRighe, campiRiga]) : Promise.resolve([] as Record<string, unknown>[]),
    r.partner_id
      ? callKw<Record<string, unknown>[]>(server, 'res.partner', 'read', [[r.partner_id[0]], ['is_company', 'email', 'phone', ...(await campiMobile(server))]]).catch(() => [])
      : Promise.resolve([] as Record<string, unknown>[]),
  ])
  const p = partner[0] || {}
  const pagamento = r.invoice_payment_term_id as M2o | undefined
  const venditore = r.invoice_user_id as M2o | undefined
  return {
    ...daRiga(r),
    clienteAzienda: !!p.is_company,
    email: (p.email as string) || '',
    telefono: (p.phone as string) || (p.mobile as string) || '',
    imponibile: (r.amount_untaxed as number) || 0,
    imposte: (r.amount_tax as number) || 0,
    pagamento: pagamento ? pagamento[1] : '',
    origine: (r.invoice_origin as string) || '',
    venditore: venditore || null,
    note: testoDaHtml(r.narration as string),
    inviata: !!r.is_move_sent,
    segue: !!r.message_is_follower,
    righe: righe
      .sort((a, b) => ((a.sequence as number) || 0) - ((b.sequence as number) || 0) || (a.id as number) - (b.id as number))
      .map((x) => {
        const prodotto = x.product_id as M2o
        const unita = (s.uom ? x[s.uom] : false) as M2o
        const tipo = x.display_type === 'line_section' || x.display_type === 'line_subsection' ? 'sezione' : x.display_type === 'line_note' ? 'nota' : 'prodotto'
        return {
          id: x.id as Id,
          tipo,
          descrizione: (x.name as string) || '',
          prodottoId: prodotto ? prodotto[0] : null,
          prodotto: prodotto ? prodotto[1] : '',
          quantita: (x.quantity as number) || 0,
          unita: unita ? unita[1] : '',
          prezzo: (x.price_unit as number) || 0,
          sconto: (x.discount as number) || 0,
          subtotale: (x.price_subtotal as number) || 0,
        }
      }),
  }
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

// ---------------------------------------------------------------------------
// Azioni (i pulsanti di Odoo)
// ---------------------------------------------------------------------------

type Azione = { type?: string; res_model?: string; context?: Record<string, unknown> } | false | null

/**
 * Conferma la bozza (numero, scritture contabili). Torna 'web' se Odoo chiede
 * altro con una sua finestra (es. date bloccate): si continua in Odoo Web.
 */
export async function conferma(server: string, id: Id): Promise<'fatto' | 'web'> {
  const r = await callKw<Azione>(server, 'account.move', 'action_post', [[id]])
  return r && typeof r === 'object' && r.type === 'ir.actions.act_window' ? 'web' : 'fatto'
}

/** Le procedure d'invio che l'app sa usare: 17 e dalla 18 alla 20. */
const PROCEDURE_INVIO = ['account.move.send', 'account.move.send.wizard']

/** Errori per cui neanche Odoo Web andrebbe: si mostrano invece di aprire il browser. */
function bloccante(e: unknown): boolean {
  return e instanceof ErroreOdoo && (e.tipo === 'rete' || e.tipo === 'sessione' || e.tipo === 'occupato')
}

/**
 * Invia la fattura al cliente con il modello email di Odoo (PDF allegato),
 * come «Invia» seguito da «Invia» nella finestra di Odoo.
 * Torna 'web' quando la procedura non e' quella attesa o l'email non e' pronta
 * (cliente senza email, invio con altri canali come Peppol): si apre la fattura
 * in Odoo Web invece di indovinare.
 */
export async function inviaFattura(server: string, id: Id): Promise<'inviata' | 'web'> {
  let azione: Azione = null
  for (const metodo of ['action_invoice_sent', 'action_send_and_print']) {
    try {
      azione = await callKw<Azione>(server, 'account.move', metodo, [[id]])
      break
    } catch (e) {
      if (bloccante(e)) throw e
    }
  }
  const modello = azione && typeof azione === 'object' ? azione.res_model || '' : ''
  if (!azione || !PROCEDURE_INVIO.includes(modello)) {
    return 'web'
  }
  const context = { ...(azione.context || {}), active_model: 'account.move', active_ids: [id], active_id: id }
  // Gli errori di Odoo da qui in poi (es. modello email mancante) si mostrano all'utente.
  const campi = await callKw<Record<string, unknown>>(server, modello, 'fields_get', [], { attributes: ['type'] })
  const daLeggere = ['checkbox_send_mail', 'sending_methods'].filter((x) => x in campi)
  if (!daLeggere.length) {
    return 'web'
  }
  const mago = await callKw<Id>(server, modello, 'create', [{}], { context })
  const [w] = await callKw<Record<string, unknown>[]>(server, modello, 'read', [[mago], daLeggere], { context })
  // 17: casella «Email»; 18-20: i canali scelti per il cliente.
  if ('checkbox_send_mail' in campi && !w?.checkbox_send_mail) {
    return 'web'
  }
  if ('sending_methods' in campi && !(Array.isArray(w?.sending_methods) && (w.sending_methods as unknown[]).includes('email'))) {
    return 'web'
  }
  await callKw(server, modello, 'action_send_and_print', [[mago]], { context })
  return 'inviata'
}

/** Il PDF della fattura, come «Stampa» di Odoo (con i pagamenti). */
export function urlPdf(server: string, id: Id): string {
  return `${server}/report/pdf/account.report_invoice_with_payments/${id}`
}

/** Icona dell'app Fatturazione di Odoo (quella del menu, dal modulo account). */
export function iconaFatturazione(server: string): string {
  return `${server}/account/static/description/icon.png`
}
