/**
 * I contatti di Odoo (res.partner): ricerca a pagine, scheda, contatto nuovo,
 * e la scheda completa con tutti i campi del modulo di Odoo (vedi in fondo:
 * schedaCompleta, opzioniCampo, salvaContatto).
 *
 * Odoo 19 non ha piu' il campo «mobile» (solo «phone»): i campi si leggono
 * da fields_get una volta per server e si chiedono solo quelli che esistono.
 */

import { callKw } from './client'
import { htmlDaTesto, testoDaHtml } from './testo'

type Id = number
type M2o = [number, string] | false

const campiDi = new Map<string, Promise<Set<string>>>()

function campiPartner(server: string): Promise<Set<string>> {
  let p = campiDi.get(server)
  if (!p) {
    p = callKw<Record<string, unknown>>(server, 'res.partner', 'fields_get', [], { attributes: ['type'] }).then(
      (f) => new Set(Object.keys(f)),
    )
    p.catch(() => campiDi.delete(server))
    campiDi.set(server, p)
  }
  return p
}

function solo(campi: Set<string>, voluti: string[]): string[] {
  return voluti.filter((c) => campi.has(c))
}

export type Contatto = {
  id: Id
  nome: string
  /** Ha una foto vera in Odoo (senza, Odoo da' una sagoma grigia: meglio le iniziali). */
  foto: boolean
  azienda: string
  aziendaId: Id | null
  eAzienda: boolean
  funzione: string
  citta: string
  telefono: string
  cellulare: string
  email: string
}

type Riga = {
  id: Id
  name: string | false
  parent_id: M2o
  is_company: boolean
  function?: string | false
  city?: string | false
  phone?: string | false
  mobile?: string | false
  email?: string | false
}

function daRiga(r: Riga, conFoto: Set<Id>): Contatto {
  return {
    id: r.id,
    // Alcuni nomi in Odoo iniziano con spazi: si tolgono.
    nome: (r.name || '').trim(),
    foto: conFoto.has(r.id),
    azienda: r.parent_id ? r.parent_id[1] : '',
    aziendaId: r.parent_id ? r.parent_id[0] : null,
    eAzienda: !!r.is_company,
    funzione: r.function || '',
    citta: r.city || '',
    telefono: r.phone || '',
    cellulare: r.mobile || '',
    email: r.email || '',
  }
}

/** Fra questi, quali hanno una foto caricata. Una sola richiesta leggera. */
async function conFoto(server: string, ids: Id[]): Promise<Set<Id>> {
  if (!ids.length) {
    return new Set()
  }
  const r = await callKw<Id[]>(server, 'res.partner', 'search', [[['id', 'in', ids], ['image_1920', '!=', false]]]).catch(
    () => [] as Id[],
  )
  return new Set(r)
}

export type Filtro = 'tutti' | 'aziende' | 'persone'

export async function cercaContatti(
  server: string,
  testo: string,
  filtro: Filtro,
  offset: number,
  limite = 60,
): Promise<Contatto[]> {
  const campi = await campiPartner(server)
  const dominio: unknown[] = [['name', '!=', false]]
  if (filtro === 'aziende') {
    dominio.push(['is_company', '=', true])
  } else if (filtro === 'persone') {
    dominio.push(['is_company', '=', false])
  }
  const t = testo.trim()
  if (!t) {
    // Senza ricerca: solo i nomi che iniziano con una cifra o una lettera.
    // Fuori quelli con simboli davanti (oltre 1300 su ticinoweb.online: numeri
    // «+41...» creati dalle chiamate, «"Mario" <mario@...>» dalle email, «*», «#»),
    // che Odoo metterebbe in cima. Con la ricerca si trovano lo stesso.
    dominio.push(['name', '>=', '0'])
  }
  if (t) {
    const cifre = t.replace(/\D/g, '')
    if (cifre.length >= 4 && campi.has('phone_mobile_search')) {
      // Un numero: la ricerca di Odoo che ignora spazi e prefissi.
      dominio.push('|', ['phone_mobile_search', 'ilike', t], ['name', 'ilike', t])
    } else {
      dominio.push('|', '|', ['name', 'ilike', t], ['email', 'ilike', t], ['commercial_company_name', 'ilike', t])
    }
  }
  const righe = await callKw<Riga[]>(server, 'res.partner', 'search_read', [], {
    domain: dominio,
    fields: solo(campi, ['name', 'parent_id', 'is_company', 'function', 'city', 'phone', 'mobile', 'email']),
    order: 'name asc, id asc',
    offset,
    limit: limite,
  })
  const foto = await conFoto(server, righe.map((r) => r.id))
  return righe.map((r) => daRiga(r, foto))
}

export type SchedaContatto = Contatto & {
  indirizzo: string
  sito: string
  partitaIva: string
  etichette: string[]
  note: string
  persone: Contatto[]
}

export async function schedaContatto(server: string, id: Id): Promise<SchedaContatto | null> {
  const campi = await campiPartner(server)
  const [r] = await callKw<
    (Riga & {
      street?: string | false
      street2?: string | false
      zip?: string | false
      country_id?: M2o
      website?: string | false
      vat?: string | false
      category_id?: Id[]
      comment?: string | false
      child_ids?: Id[]
    })[]
  >(server, 'res.partner', 'read', [
    [id],
    solo(campi, [
      'name', 'parent_id', 'is_company', 'function', 'city', 'phone', 'mobile', 'email',
      'street', 'street2', 'zip', 'country_id', 'website', 'vat', 'category_id', 'comment', 'child_ids',
    ]),
  ])
  if (!r) {
    return null
  }
  const [etichette, persone] = await Promise.all([
    r.category_id?.length
      ? callKw<{ id: Id; name: string }[]>(server, 'res.partner.category', 'read', [r.category_id, ['name']]).catch(() => [])
      : Promise.resolve([]),
    r.child_ids?.length
      ? callKw<Riga[]>(server, 'res.partner', 'search_read', [], {
          domain: [['parent_id', '=', id], ['name', '!=', false]],
          fields: solo(campi, ['name', 'parent_id', 'is_company', 'function', 'city', 'phone', 'mobile', 'email']),
          order: 'name asc',
          limit: 50,
        }).catch(() => [])
      : Promise.resolve([]),
  ])
  const citta = [r.zip, r.city].filter(Boolean).join(' ')
  const foto = await conFoto(server, [r.id, ...persone.map((p) => p.id)])
  return {
    ...daRiga(r, foto),
    indirizzo: [r.street, r.street2, citta, r.country_id ? r.country_id[1] : ''].filter(Boolean).join('\n'),
    sito: r.website || '',
    partitaIva: r.vat || '',
    etichette: etichette.map((e) => e.name),
    note: r.comment || '',
    persone: persone.map((p) => daRiga(p, foto)),
  }
}

/** Il server ha il campo «mobile»? (Odoo 17 si', Odoo 19 no.) */
export async function haCellulare(server: string): Promise<boolean> {
  return (await campiPartner(server)).has('mobile')
}

export type NuovoContatto = {
  eAzienda: boolean
  nome: string
  azienda: string
  funzione: string
  telefono: string
  cellulare: string
  email: string
}

/**
 * Crea il contatto. L'azienda scritta per una persona si collega a
 * un'azienda esistente con lo stesso nome; se non c'e', resta come testo
 * (company_name), come fa Odoo, e la si crea poi da Odoo se serve.
 */
export async function creaContatto(server: string, n: NuovoContatto): Promise<Id> {
  const campi = await campiPartner(server)
  const valori: Record<string, unknown> = {
    name: n.nome.trim(),
    is_company: n.eAzienda,
    email: n.email.trim() || false,
    phone: n.telefono.trim() || false,
  }
  if (campi.has('mobile') && n.cellulare.trim()) {
    valori.mobile = n.cellulare.trim()
  }
  if (!n.eAzienda) {
    valori.function = n.funzione.trim() || false
    const azienda = n.azienda.trim()
    if (azienda) {
      const [trovata] = await callKw<Id[]>(server, 'res.partner', 'search', [
        [['is_company', '=', true], ['name', '=ilike', azienda]],
      ], { limit: 1 })
      if (trovata) {
        valori.parent_id = trovata
      } else if (campi.has('company_name')) {
        valori.company_name = azienda
      }
    }
  }
  const id = await callKw<Id>(server, 'res.partner', 'create', [valori])
  if (n.eAzienda) {
    // Odoo 20 calcola «azienda» da solo (entita' commerciale con partita IVA)
    // e alla creazione ignora is_company: lo si conferma dopo.
    const [letto] = await callKw<{ is_company: boolean }[]>(server, 'res.partner', 'read', [[id], ['is_company']])
    if (letto && !letto.is_company) {
      await callKw<boolean>(server, 'res.partner', 'write', [[id], { is_company: true }])
    }
  }
  return id
}

// ---------------------------------------------------------------------------
// Scheda completa: tutti i campi del modulo di Odoo
// ---------------------------------------------------------------------------

export type InfoCampo = { type: string; string?: string; selection?: [string, string][]; relation?: string; readonly?: boolean }

const infoDi = new Map<string, Promise<Record<string, InfoCampo>>>()

/** I campi del contatto su questo server (dipendono dalla versione e dalle app installate). */
export function infoCampiPartner(server: string): Promise<Record<string, InfoCampo>> {
  let p = infoDi.get(server)
  if (!p) {
    p = callKw<Record<string, InfoCampo>>(server, 'res.partner', 'fields_get', [], { attributes: ['type', 'string', 'selection', 'relation', 'readonly'] })
    p.catch(() => infoDi.delete(server))
    infoDi.set(server, p)
  }
  return p
}

export type Rel = { id: Id; nome: string }
/** Una scelta per un campo: i campi a elenco di Odoo hanno anche il valore («it_IT», «invoice»). */
export type Opzione = Rel & { valore?: string }

/** I campi del modulo che l'app mostra e modifica (quelli che non esistono sul server si saltano). */
export const CAMPI_TESTO = ['name', 'function', 'phone', 'mobile', 'email', 'website', 'vat', 'company_registry', 'street', 'street2', 'zip', 'city', 'ref', 'barcode'] as const
export const CAMPI_UNO = [
  'parent_id', 'title', 'state_id', 'country_id', 'user_id', 'team_id',
  'property_payment_term_id', 'property_supplier_payment_term_id', 'property_product_pricelist', 'industry_id',
] as const
export const CAMPI_SCELTA = ['lang', 'type'] as const

export type Valori = {
  is_company: boolean
  comment: string
  category_id: Rel[]
} & Record<(typeof CAMPI_TESTO)[number], string> &
  Record<(typeof CAMPI_UNO)[number], Rel | null> &
  Record<(typeof CAMPI_SCELTA)[number], string>

export type Figlio = Contatto & { tipo: string; tipoNome: string; indirizzo: string }

export type Completa = {
  id: Id
  foto: boolean
  campi: Record<string, InfoCampo>
  valori: Valori
  banche: string[]
  contatori: { opportunita: number | null; vendite: number | null; appuntamenti: number | null; fatturato: { importo: number; valuta: string } | null }
  figli: Figlio[]
  segue: boolean
  /** Testi di campi social aggiunti da moduli (facebook, instagram, social_*...). */
  social: string[]
}

/** Il nome leggibile di un valore di un campo a scelta («invoice» → «Indirizzo di fatturazione»). */
export function nomeScelta(info: InfoCampo | undefined, valore: string): string {
  return info?.selection?.find(([v]) => v === valore)?.[1] || valore
}

function indirizzoDi(r: Record<string, unknown>): string {
  const m2o = (x: unknown) => (Array.isArray(x) ? (x[1] as string) : '')
  return [r.street, r.street2, [r.zip, r.city].filter(Boolean).join(' '), m2o(r.state_id), m2o(r.country_id)].filter(Boolean).join('\n')
}

export async function schedaCompleta(server: string, id: Id): Promise<Completa | null> {
  const campi = await infoCampiPartner(server)
  const ha = (x: string) => x in campi
  const nomi = [
    'is_company', 'comment', 'category_id', 'child_ids', 'bank_ids', 'message_is_follower',
    'opportunity_count', 'sale_order_count', 'meeting_count', 'currency_id',
    ...CAMPI_TESTO, ...CAMPI_UNO, ...CAMPI_SCELTA,
  ].filter(ha)
  const [r] = await callKw<Record<string, unknown>[]>(server, 'res.partner', 'read', [[id], nomi])
  if (!r) {
    return null
  }
  const socialCampi = Object.keys(campi).filter((x) => campi[x].type === 'char' && /social|facebook|instagram|linkedin|twitter|youtube|tiktok/i.test(x))
  const socialValori = socialCampi.length
    ? await callKw<Record<string, unknown>[]>(server, 'res.partner', 'read', [[id], socialCampi]).then((x) => x[0] || {}).catch(() => ({}) as Record<string, unknown>)
    : {}
  const ids = (x: unknown) => (Array.isArray(x) ? (x as Id[]) : [])
  const campiFiglio = ['name', 'parent_id', 'is_company', 'function', 'city', 'phone', 'mobile', 'email', 'type', 'street', 'street2', 'zip', 'state_id', 'country_id'].filter(ha)
  const [etichette, figli, banche, foto, fatturato] = await Promise.all([
    ids(r.category_id).length ? callKw<{ id: Id; name: string }[]>(server, 'res.partner.category', 'read', [ids(r.category_id), ['name']]).catch(() => []) : Promise.resolve([]),
    ids(r.child_ids).length
      ? callKw<Record<string, unknown>[]>(server, 'res.partner', 'search_read', [], { domain: [['parent_id', '=', id]], fields: campiFiglio, order: 'type, name', limit: 100 }).catch(() => [])
      : Promise.resolve([]),
    ids(r.bank_ids).length
      ? callKw<{ acc_number: string; bank_id: [Id, string] | false }[]>(server, 'res.partner.bank', 'read', [ids(r.bank_ids), ['acc_number', 'bank_id']]).catch(() => [])
      : Promise.resolve([]),
    conFoto(server, [id, ...ids(r.child_ids)]),
    // Il fatturato lo legge solo chi ha accesso alla contabilita'.
    ha('total_invoiced')
      ? callKw<{ total_invoiced: number }[]>(server, 'res.partner', 'read', [[id], ['total_invoiced']]).then((x) => x[0]?.total_invoiced ?? null).catch(() => null)
      : Promise.resolve(null),
  ])
  const rel = (x: unknown): Rel | null => (Array.isArray(x) && x.length === 2 ? { id: x[0] as Id, nome: x[1] as string } : null)
  const testo = (x: unknown) => (typeof x === 'string' ? x : '')
  const valori = {
    is_company: !!r.is_company,
    comment: testoDaHtml(testo(r.comment)),
    category_id: etichette.map((e) => ({ id: e.id, nome: e.name })),
  } as Valori
  for (const k of CAMPI_TESTO) valori[k] = testo(r[k]).trim()
  for (const k of CAMPI_UNO) valori[k] = rel(r[k])
  for (const k of CAMPI_SCELTA) valori[k] = testo(r[k])
  const conta = (x: unknown) => (typeof x === 'number' ? x : null)
  const valuta = rel(r.currency_id)?.nome || ''
  return {
    id,
    foto: foto.has(id),
    campi,
    valori,
    banche: banche.map((b) => [b.acc_number, b.bank_id ? b.bank_id[1] : ''].filter(Boolean).join(' · ')),
    contatori: {
      opportunita: conta(r.opportunity_count),
      vendite: conta(r.sale_order_count),
      appuntamenti: conta(r.meeting_count),
      fatturato: fatturato === null ? null : { importo: fatturato, valuta },
    },
    figli: figli.map((f) => ({
      ...daRiga(f as unknown as Riga, foto),
      tipo: testo(f.type) || 'contact',
      tipoNome: nomeScelta(campi.type, testo(f.type) || 'contact'),
      indirizzo: indirizzoDi(f),
    })),
    segue: !!r.message_is_follower,
    social: socialCampi.map((x) => socialValori[x]).filter((x): x is string => typeof x === 'string' && !!x.trim()),
  }
}

/** Le scelte per un campo: elenco di Odoo (lingua, tipo) o ricerca nel modello collegato. */
export async function opzioniCampo(server: string, campo: string, testo: string, valori: Partial<Valori>): Promise<Opzione[]> {
  const info = (await infoCampiPartner(server))[campo]
  if (!info) {
    return []
  }
  if (info.selection) {
    const q = testo.trim().toLowerCase()
    return info.selection.map(([v, n], i) => ({ id: i + 1, nome: n, valore: v })).filter((x) => !q || x.nome.toLowerCase().includes(q))
  }
  if (!info.relation) {
    return []
  }
  const dominio: unknown[] =
    campo === 'parent_id'
      ? [['is_company', '=', true]]
      : campo === 'state_id' && valori.country_id
        ? [['country_id', '=', valori.country_id.id]]
        : campo === 'user_id'
          ? [['share', '=', false]]
          : []
  // Argomenti per posizione: il secondo si chiama «args» in Odoo 17 e «domain» dalla 18.
  const r = await callKw<[Id, string][]>(server, info.relation, 'name_search', [testo, dominio, 'ilike', 80])
  return r.map(([id, nome]) => ({ id, nome }))
}

/** Scrive solo i campi cambiati, nei formati di Odoo. */
export async function salvaContatto(server: string, id: Id, cambi: Partial<Valori>): Promise<void> {
  const campi = await infoCampiPartner(server)
  const v: Record<string, unknown> = {}
  for (const [k, x] of Object.entries(cambi)) {
    if (!(k in campi) || k === 'is_company') continue
    if (k === 'category_id') v[k] = [[6, 0, (x as Rel[]).map((e) => e.id)]]
    else if (k === 'comment') v[k] = (x as string).trim() ? htmlDaTesto(x as string) : false
    else if ((CAMPI_UNO as readonly string[]).includes(k)) v[k] = x ? (x as Rel).id : false
    else v[k] = typeof x === 'string' ? x.trim() || false : x
  }
  if (Object.keys(v).length) {
    await callKw(server, 'res.partner', 'write', [[id], v])
  }
  // Persona / azienda: come in creaContatto (Odoo 20 lo ricalcola, si conferma dopo).
  if (cambi.is_company !== undefined) {
    await callKw(server, 'res.partner', 'write', [[id], 'company_type' in campi ? { company_type: cambi.is_company ? 'company' : 'person' } : { is_company: cambi.is_company }])
  }
}

/** Una voce nuova nel modello collegato (es. un'etichetta), come «Crea» nei campi di Odoo. */
export async function creaVoce(server: string, campo: string, nome: string): Promise<Opzione> {
  const info = (await infoCampiPartner(server))[campo]
  if (!info?.relation) {
    throw new Error(campo)
  }
  const id = await callKw<Id>(server, info.relation, 'create', [{ name: nome.trim() }])
  return { id, nome: nome.trim() }
}

/** Contatto o indirizzo nuovo sotto un'azienda (scheda «Contatti e indirizzi»). */
export async function creaFiglio(server: string, aziendaId: Id, tipo: string, nome: string): Promise<Id> {
  const campi = await infoCampiPartner(server)
  return callKw<Id>(server, 'res.partner', 'create', [{ parent_id: aziendaId, name: nome.trim() || false, ...('type' in campi ? { type: tipo } : {}) }])
}

/** Prima lettera per i gruppi della lista (A, B, ... e # per il resto). */
export function lettera(nome: string): string {
  const l = nome.trim().charAt(0).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return /[A-Z]/.test(l) ? l : '#'
}
