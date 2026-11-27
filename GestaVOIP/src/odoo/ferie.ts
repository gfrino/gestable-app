/**
 * Ferie (app Assenze di Odoo, modulo hr_holidays): quanti giorni restano per
 * tipo di assenza, le mie richieste e una richiesta nuova.
 *
 * Le versioni cambiano molto: in Odoo 17 e 19 il tipo e' `hr.leave.type`
 * (campo holiday_status_id), in Odoo 20 e' `hr.work.entry.type` (campo
 * work_entry_type_id). La mezza giornata e' una casella in Odoo 17
 * (request_unit_half), mattina/pomeriggio di inizio e fine in Odoo 19
 * (request_date_*_period) e una «durata» in Odoo 20 (request_duration). Per
 * questo l'app non calcola nulla da se': chiede a Odoo l'onchange del modulo,
 * come fa il browser, e riceve gli stessi giorni e gli stessi valori. Gli
 * errori (giorni non sufficienti, richiesta sovrapposta...) sono quelli di Odoo.
 *
 * Chi approva (responsabile delle assenze del dipendente, addetto o
 * amministratore delle Assenze) vede anche le richieste del team da approvare.
 * Chi puo' fare cosa lo dice Odoo (can_approve, can_validate, can_refuse); i
 * pulsanti chiamano action_approve / action_validate / action_refuse come il
 * browser, doppia approvazione compresa.
 */

import { callKw } from './client'

type M2o = [number, string] | false
type Valori = Record<string, unknown>

/** Come la vede il dipendente: in Odoo 17 c'e' anche «da inviare», 19 e 20 hanno «annullata». */
export type StatoFerie = 'attesa' | 'approvata' | 'rifiutata' | 'annullata'

export type UnitaTipo = 'day' | 'half_day' | 'hour'

/** Quanto resta di un tipo di assenza con giorni assegnati (ferie, recuperi...). */
export type Saldo = {
  tipoId: number
  nome: string
  /** Gia' tolte le richieste in attesa, come la «disponibilita'» di Odoo. */
  disponibili: number
  totale: number
  inAttesa: number
  ore: boolean
}

export type Tipo = { id: number; nome: string; unita: UnitaTipo }

export type Richiesta = {
  id: number
  tipo: string
  /** AAAA-MM-GG, come in Odoo. */
  dal: string
  al: string
  giorni: number
  ore: number
  inOre: boolean
  stato: StatoFerie
  nota: string
  /** Mezza giornata: mattina o pomeriggio. */
  mezza: 'am' | 'pm' | null
  dipendente: string
  /** L'utente del dipendente (per la foto), se ne ha uno. */
  utenteId: number | null
  /** L'utente collegato puo' approvarla / rifiutarla (lo calcola Odoo). */
  puoApprovare: boolean
  puoRifiutare: boolean
  /** Gia' approvata una volta, manca la seconda approvazione. */
  seconda: boolean
}

/** Quello che sceglie il dipendente nella richiesta nuova. */
export type Scelta = {
  tipo: Tipo
  dal: string
  al: string
  mezza: 'am' | 'pm' | null
  nota: string
}

export type Anteprima = {
  /** Giorni lavorativi che Odoo conta (0: nel periodo non si lavora). */
  giorni: number
  /** Valori che Odoo ha calcolato (orari, periodi) da mandare con la richiesta. */
  valori: Valori
}

const STATI: Record<string, StatoFerie> = {
  draft: 'attesa',
  confirm: 'attesa',
  validate1: 'attesa',
  validate: 'approvata',
  refuse: 'rifiutata',
  cancel: 'annullata',
}

type Struttura = {
  modelloTipo: 'hr.leave.type' | 'hr.work.entry.type'
  campoTipo: 'holiday_status_id' | 'work_entry_type_id'
  campi: Record<string, { readonly?: boolean }>
  campiTipo: Set<string>
  /** requires_allocation e' «yes»/«no» in Odoo 17, vero/falso dopo. */
  allocazioneSelezione: boolean
  /** Come si chiede la mezza giornata (vedi in cima). */
  mezza: 'durata' | 'casella' | 'periodi'
  azienda: number
}

const struttureDi = new Map<string, Promise<Struttura>>()

async function leggiStruttura(server: string, uid: number): Promise<Struttura> {
  const [campi, utente] = await Promise.all([
    callKw<Record<string, { readonly?: boolean }>>(server, 'hr.leave', 'fields_get', [], { attributes: ['type', 'readonly'] }),
    callKw<{ company_id: M2o }[]>(server, 'res.users', 'read', [[uid], ['company_id']]),
  ])
  const modelloTipo = 'work_entry_type_id' in campi ? 'hr.work.entry.type' : 'hr.leave.type'
  const campiTipo = await callKw<Record<string, { type: string }>>(server, modelloTipo, 'fields_get', [], { attributes: ['type'] })
  return {
    modelloTipo,
    campoTipo: modelloTipo === 'hr.work.entry.type' ? 'work_entry_type_id' : 'holiday_status_id',
    campi,
    campiTipo: new Set(Object.keys(campiTipo)),
    allocazioneSelezione: campiTipo.requires_allocation?.type === 'selection',
    mezza: 'request_duration' in campi ? 'durata' : campi.request_unit_half && !campi.request_unit_half.readonly ? 'casella' : 'periodi',
    azienda: utente[0]?.company_id ? utente[0].company_id[0] : 0,
  }
}

function struttura(server: string, uid: number): Promise<Struttura> {
  const chiave = `${server}|${uid}`
  let p = struttureDi.get(chiave)
  if (!p) {
    p = leggiStruttura(server, uid)
    p.catch(() => struttureDi.delete(chiave))
    struttureDi.set(chiave, p)
  }
  return p
}

/** Il contesto del browser: l'azienda in cui si lavora (Odoo la usa per tipi e saldi). */
function contesto(st: Struttura, altro: Valori = {}): { context: Valori } {
  return { context: { ...(st.azienda ? { allowed_company_ids: [st.azienda] } : {}), ...altro } }
}

function campiEsistenti(st: Struttura, nomi: string[]): string[] {
  return nomi.filter((x) => x in st.campi)
}

/** I tipi con giorni assegnati e quanto ne resta, come nel cruscotto delle Assenze. */
export async function saldi(server: string, uid: number): Promise<Saldo[]> {
  const st = await struttura(server, uid)
  const r = await callKw<unknown>(server, st.modelloTipo, 'get_allocation_data_request', [], contesto(st, { from_dashboard: true }))
  // Senza dipendente collegato Odoo 20 risponde {} invece di una lista.
  if (!Array.isArray(r)) {
    return []
  }
  const lista: Saldo[] = []
  for (const voce of r as [string, Record<string, unknown>, unknown, number][]) {
    const [nome, d, richiede, id] = voce
    const totale = Number(d?.max_leaves) || 0
    if (!(richiede === true || richiede === 'yes') || totale <= 0) {
      continue
    }
    const unita = (d.unit_of_measure as string) || (d.request_unit === 'hour' ? 'hour' : 'day')
    lista.push({
      tipoId: id,
      nome,
      disponibili: Number(d.virtual_remaining_leaves) || 0,
      totale,
      inAttesa: Number(d.leaves_requested) || 0,
      ore: unita === 'hour',
    })
  }
  return lista
}

type Riga = {
  id: number
  name: string | false
  request_date_from: string | false
  request_date_to: string | false
  number_of_days: number
  number_of_hours?: number
  state: string
  request_date_from_period?: 'am' | 'pm' | false
  leave_type_request_unit?: UnitaTipo
  work_entry_type_request_unit?: UnitaTipo
  [tipo: string]: unknown
}

/** Le mie richieste, le piu' recenti prima. */
export function mieRichieste(server: string, uid: number): Promise<Richiesta[]> {
  return leggiRichieste(server, uid, [['user_id', '=', uid]], 'request_date_from desc, id desc', 200)
}

/**
 * Le richieste degli altri che l'utente puo' approvare, le prime che
 * iniziano prima. Odoo da' a ognuno solo quelle che puo' leggere; tra quelle,
 * restano quelle su cui Odoo dice che puo' agire.
 */
export async function daApprovare(server: string, uid: number): Promise<Richiesta[]> {
  const r = await leggiRichieste(server, uid, [['state', 'in', ['confirm', 'validate1']], ['user_id', '!=', uid]], 'request_date_from asc, id asc', 100)
  return r.filter((x) => x.puoApprovare || x.puoRifiutare)
}

async function leggiRichieste(server: string, uid: number, domain: unknown[], order: string, limit: number): Promise<Richiesta[]> {
  const st = await struttura(server, uid)
  const righe = await callKw<Riga[]>(server, 'hr.leave', 'search_read', [], {
    domain,
    fields: campiEsistenti(st, [
      'employee_id',
      'user_id',
      'can_approve',
      'can_validate',
      'can_refuse',
      st.campoTipo,
      'name',
      'request_date_from',
      'request_date_to',
      'number_of_days',
      'number_of_hours',
      'state',
      'request_date_from_period',
      'leave_type_request_unit',
      'work_entry_type_request_unit',
    ]),
    order,
    limit,
    ...contesto(st),
  })
  return righe.map((r) => {
    const dal = r.request_date_from || ''
    const al = r.request_date_to || dal
    const giorni = r.number_of_days || 0
    const tipo = r[st.campoTipo] as M2o
    const inAttesa = r.state === 'confirm' || r.state === 'validate1'
    return {
      id: r.id,
      tipo: tipo ? tipo[1] : '',
      dal,
      al,
      giorni,
      ore: r.number_of_hours || 0,
      inOre: (r.leave_type_request_unit || r.work_entry_type_request_unit) === 'hour',
      stato: STATI[r.state] || 'attesa',
      nota: r.name || '',
      mezza: dal === al && giorni > 0 && giorni < 1 ? r.request_date_from_period || 'am' : null,
      dipendente: r.employee_id ? (r.employee_id as [number, string])[1] : '',
      utenteId: r.user_id ? (r.user_id as [number, string])[0] : null,
      // Solo le richieste in attesa: i pulsanti di Odoo valgono anche per altri passaggi.
      puoApprovare: inAttesa && (!!r.can_approve || !!r.can_validate),
      // Odoo 17 non ha can_refuse: chi puo' approvare puo' anche rifiutare.
      puoRifiutare: inAttesa && ('can_refuse' in st.campi ? !!r.can_refuse : !!r.can_approve),
      seconda: r.state === 'validate1',
    }
  })
}

/**
 * I campi della richiesta che si mandano a Odoo (solo quelli che esistono e
 * si possono scrivere su questo server). Anche gli altri valori del modulo
 * calcolati da Odoo (orari, periodi) passano di qui.
 */
const DA_INVIARE = [
  'employee_id',
  'holiday_type',
  'request_date_from',
  'request_date_to',
  'request_unit_half',
  'request_date_from_period',
  'request_date_to_period',
  'request_duration',
  'request_hour_from',
  'request_hour_to',
  'name',
]

/** I campi chiesti all'onchange (quelli che esistono su questo server). */
function specifica(st: Struttura): Record<string, Valori> {
  const nomi = [st.campoTipo, 'employee_ids', 'number_of_days', 'allowed_work_entry_type_ids', ...DA_INVIARE]
  return Object.fromEntries(campiEsistenti(st, nomi).map((x) => [x, {}]))
}

function id(v: unknown): unknown {
  return v && typeof v === 'object' && !Array.isArray(v) && 'id' in v ? (v as { id: unknown }).id : v
}

type Nuova = { base: Valori; consentiti: number[] | null }
const nuoveDi = new Map<string, Promise<Nuova>>()

/**
 * Il modulo vuoto come lo apre il browser: da qui arriva il dipendente
 * collegato all'utente e, in Odoo 20, i tipi che si possono scegliere.
 */
function nuova(server: string, uid: number): Promise<Nuova> {
  const chiave = `${server}|${uid}`
  let p = nuoveDi.get(chiave)
  if (!p) {
    p = (async () => {
      const st = await struttura(server, uid)
      const r = await callKw<{ value: Valori }>(server, 'hr.leave', 'onchange', [[], {}, [], specifica(st)], contesto(st))
      const v = r?.value || {}
      const base: Valori = {}
      if (v.employee_id) {
        base.employee_id = id(v.employee_id)
      } else if (Array.isArray(v.employee_ids) && v.employee_ids.length) {
        // Odoo 17: il dipendente arriva come elenco (employee_ids), l'onchange ne ricava employee_id.
        base.employee_ids = v.employee_ids
      }
      if (v.holiday_type) {
        base.holiday_type = v.holiday_type
      }
      const consentiti = Array.isArray(v.allowed_work_entry_type_ids)
        ? (v.allowed_work_entry_type_ids as unknown[]).map((x) => (Array.isArray(x) ? x[1] : id(x))).filter((x): x is number => typeof x === 'number')
        : null
      return { base, consentiti }
    })()
    p.catch(() => nuoveDi.delete(chiave))
    nuoveDi.set(chiave, p)
  }
  return p
}

/** I tipi che il dipendente puo' chiedere: come il menu a tendina del browser. */
export async function tipi(server: string, uid: number): Promise<Tipo[]> {
  const st = await struttura(server, uid)
  const { consentiti } = await nuova(server, uid)
  const dominio: unknown[] = []
  if (consentiti) {
    dominio.push(['id', 'in', consentiti])
  }
  if (st.campiTipo.has('time_off_selectable')) {
    dominio.push(['time_off_selectable', '=', true])
  }
  if (st.campiTipo.has('company_id') && st.azienda) {
    dominio.push(['company_id', 'in', [st.azienda, false]])
  }
  dominio.push('|', ['requires_allocation', '=', st.allocazioneSelezione ? 'no' : false], ['has_valid_allocation', '=', true])
  const r = await callKw<{ id: number; name: string; request_unit: UnitaTipo }[]>(server, st.modelloTipo, 'search_read', [], {
    domain: dominio,
    fields: ['name', 'request_unit'],
    ...contesto(st),
  })
  return r.map((x) => ({ id: x.id, nome: x.name, unita: x.request_unit || 'day' }))
}

/** Si puo' chiedere mezza giornata per questo tipo? Come nel modulo del browser. */
export async function mezzaPossibile(server: string, uid: number, tipo: Tipo): Promise<boolean> {
  const st = await struttura(server, uid)
  // Odoo 19 calcola la mezza giornata solo per i tipi «a mezze giornate»; 17 e 20 anche per quelli a ore.
  return st.mezza === 'periodi' ? tipo.unita === 'half_day' : tipo.unita === 'half_day' || tipo.unita === 'hour'
}

function valoriScelta(st: Struttura, base: Valori, s: Scelta): Valori {
  const v: Valori = {
    ...base,
    [st.campoTipo]: s.tipo.id,
    request_date_from: s.dal,
    request_date_to: s.mezza ? s.dal : s.al,
  }
  if (st.mezza === 'durata') {
    v.request_duration = s.mezza || 'full'
  } else if (st.mezza === 'casella') {
    if (s.mezza) {
      v.request_unit_half = true
      v.request_date_from_period = s.mezza
    }
  } else if (s.mezza) {
    v.request_date_from_period = s.mezza
    v.request_date_to_period = s.mezza
  }
  if (s.nota.trim()) {
    v.name = s.nota.trim()
  }
  return v
}

/**
 * Quanti giorni conta Odoo per la scelta, e i valori che calcola (orari,
 * periodi): l'onchange del browser, con tutte le scelte come campi cambiati.
 */
export async function anteprima(server: string, uid: number, s: Scelta): Promise<Anteprima> {
  const st = await struttura(server, uid)
  const { base } = await nuova(server, uid)
  const valori = valoriScelta(st, base, s)
  const r = await callKw<{ value?: Valori }>(server, 'hr.leave', 'onchange', [[], valori, Object.keys(valori), specifica(st)], contesto(st))
  const cambiati = r?.value || {}
  const calcolati: Valori = {}
  for (const [k, x] of Object.entries(cambiati)) {
    if (DA_INVIARE.includes(k) && !(k in valori) && st.campi[k] && !st.campi[k].readonly) {
      calcolati[k] = id(x)
    }
  }
  if (cambiati.employee_id) {
    calcolati.employee_id = id(cambiati.employee_id)
  }
  // Odoo manda solo i valori cambiati: senza giorni nella risposta, i giorni sono 0.
  return { giorni: Number(cambiati.number_of_days) || 0, valori: calcolati }
}

/** Crea la richiesta: Odoo la mette in approvazione (o la approva da sola, se il tipo non la chiede). */
export async function inviaRichiesta(server: string, uid: number, s: Scelta): Promise<number> {
  const st = await struttura(server, uid)
  const { base } = await nuova(server, uid)
  const prima = await anteprima(server, uid, s).catch(() => null)
  const valori = { ...valoriScelta(st, base, s), ...(prima?.valori || {}) }
  delete valori.employee_ids
  const scrivibili = Object.fromEntries(Object.entries(valori).filter(([k]) => k === st.campoTipo || (DA_INVIARE.includes(k) && k in st.campi)))
  return callKw<number>(server, 'hr.leave', 'create', [scrivibili], contesto(st))
}

/** Icona dell'app Assenze di Odoo (uguale dalla 17 alla 20). */
/** Approva come il pulsante di Odoo: prima o seconda approvazione secondo il tipo di assenza. */
export async function approva(server: string, uid: number, r: Richiesta): Promise<void> {
  const st = await struttura(server, uid)
  // Odoo 17: la seconda approvazione e' action_validate; 19 e 20 la fanno con action_approve.
  const metodo = r.seconda && !('can_validate' in st.campi) ? 'action_validate' : 'action_approve'
  await callKw(server, 'hr.leave', metodo, [[r.id]], contesto(st))
}

export async function rifiuta(server: string, uid: number, r: Richiesta): Promise<void> {
  const st = await struttura(server, uid)
  await callKw(server, 'hr.leave', 'action_refuse', [[r.id]], contesto(st))
}

export function iconaFerie(server: string): string {
  return `${server}/hr_holidays/static/description/icon.png`
}
