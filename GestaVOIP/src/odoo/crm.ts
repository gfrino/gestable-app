/**
 * CRM di Odoo (modulo crm, modello crm.lead): le opportunita' per fase, una
 * opportunita' con cliente, importo, attivita' e conversazione, vinta o
 * persa, e una opportunita' nuova.
 *
 * Le differenze tra le versioni si leggono dal server: la fase vale per un
 * team (`team_id`, Odoo 17) o per piu' team (`team_ids`, 19 e 20); una
 * opportunita' persa si ripristina con `toggle_active` (17) o
 * `action_restore` (19 e 20). Vinta e persa passano dai metodi di Odoo
 * (`action_set_won_rainbowman`, procedura «Persa» con il motivo), cosi'
 * probabilita', fase e controlli restano quelli del browser.
 */

import { completaAttivita } from './lavoro'
import { callKw, ErroreOdoo } from './client'
import { dataOdoo, htmlDaTesto, testoDaHtml } from './testo'

type Id = number
type M2o = [number, string] | false

export const MODELLO = 'crm.lead'

type Struttura = { faseTeam: 'team_id' | 'team_ids' | null; campi: Set<string> }

const strutture = new Map<string, Promise<Struttura>>()

function struttura(server: string): Promise<Struttura> {
  let p = strutture.get(server)
  if (!p) {
    p = Promise.all([
      callKw<Record<string, unknown>>(server, 'crm.lead', 'fields_get', [], { attributes: ['type'] }),
      callKw<Record<string, unknown>>(server, 'crm.stage', 'fields_get', [], { attributes: ['type'] }),
    ]).then(([lead, fase]) => ({
      faseTeam: 'team_ids' in fase ? 'team_ids' : 'team_id' in fase ? 'team_id' : null,
      campi: new Set(Object.keys(lead)),
    }))
    p.catch(() => strutture.delete(server))
    strutture.set(server, p)
  }
  return p
}

// ---------------------------------------------------------------------------
// Fasi
// ---------------------------------------------------------------------------

export type Fase = { id: Id; nome: string; vinta: boolean; teams: Id[] }

export async function fasi(server: string): Promise<Fase[]> {
  const s = await struttura(server)
  const r = await callKw<{ id: Id; name: string; is_won: boolean; team_id?: M2o; team_ids?: Id[] }[]>(server, 'crm.stage', 'search_read', [], {
    domain: [],
    fields: ['name', 'is_won', ...(s.faseTeam ? [s.faseTeam] : [])],
    order: 'sequence, id',
  })
  return r.map((x) => ({
    id: x.id,
    nome: x.name,
    vinta: !!x.is_won,
    teams: Array.isArray(x.team_ids) ? x.team_ids : x.team_id ? [x.team_id[0]] : [],
  }))
}

/** Le fasi che valgono per il team dell'opportunita' (quelle senza team valgono per tutti). */
export function fasiDelTeam(tutte: Fase[], teamId: Id | null): Fase[] {
  return tutte.filter((f) => !f.teams.length || (teamId !== null && f.teams.includes(teamId)))
}

// ---------------------------------------------------------------------------
// Elenco
// ---------------------------------------------------------------------------

export type Filtro = 'mie' | 'tutte' | 'perse'

export type StatoAttivita = 'overdue' | 'today' | 'planned'

export type Opportunita = {
  id: Id
  nome: string
  cliente: string
  clienteId: Id | null
  importo: number
  valuta: string
  probabilita: number
  priorita: number
  faseId: Id | null
  fase: string
  venditore: [Id, string] | null
  /** Chiusura prevista, AAAA-MM-GG. */
  chiusura: string
  /** La prossima attivita' (la piu' vicina), come l'orologio nella vista kanban. */
  prossima: { data: string; riassunto: string; stato: StatoAttivita } | null
}

type Riga = {
  id: Id
  name: string
  partner_id: M2o
  partner_name: string | false
  contact_name: string | false
  expected_revenue: number
  company_currency: M2o
  probability: number
  priority: string | false
  stage_id: M2o
  user_id: M2o
  date_deadline: string | false
  activity_date_deadline: string | false
  activity_summary: string | false
  activity_type_id: M2o
  activity_state: string | false
}

const CAMPI_ELENCO = [
  'name',
  'partner_id',
  'partner_name',
  'contact_name',
  'expected_revenue',
  'company_currency',
  'probability',
  'priority',
  'stage_id',
  'user_id',
  'date_deadline',
  'activity_date_deadline',
  'activity_summary',
  'activity_type_id',
  'activity_state',
]

function daRiga(r: Riga): Opportunita {
  const stato = r.activity_state === 'overdue' || r.activity_state === 'today' ? r.activity_state : 'planned'
  return {
    id: r.id,
    nome: r.name,
    cliente: r.partner_id ? r.partner_id[1] : r.partner_name || r.contact_name || '',
    clienteId: r.partner_id ? r.partner_id[0] : null,
    importo: r.expected_revenue || 0,
    valuta: r.company_currency ? r.company_currency[1] : '',
    probabilita: Math.round(r.probability || 0),
    priorita: Number(r.priority || 0),
    faseId: r.stage_id ? r.stage_id[0] : null,
    fase: r.stage_id ? r.stage_id[1] : '',
    venditore: r.user_id || null,
    chiusura: r.date_deadline || '',
    prossima: r.activity_date_deadline
      ? { data: r.activity_date_deadline, riassunto: r.activity_summary || (r.activity_type_id ? r.activity_type_id[1] : ''), stato }
      : null,
  }
}

function dominio(filtro: Filtro, uid: number, testo: string): unknown[] {
  // Perse = archiviate con probabilita' 0, come il filtro «Perse» di Odoo.
  const d: unknown[] =
    filtro === 'perse'
      ? [['type', '=', 'opportunity'], ['active', '=', false], ['probability', '=', 0]]
      : [['type', '=', 'opportunity']]
  if (filtro === 'mie') {
    d.push(['user_id', '=', uid])
  }
  const q = testo.trim()
  if (q) {
    d.push('|', '|', '|', ['name', 'ilike', q], ['partner_id', 'ilike', q], ['partner_name', 'ilike', q], ['contact_name', 'ilike', q])
  }
  return d
}

export async function opportunita(server: string, uid: number, filtro: Filtro, testo = ''): Promise<Opportunita[]> {
  const righe = await callKw<Riga[]>(server, 'crm.lead', 'search_read', [], {
    domain: dominio(filtro, uid, testo),
    fields: CAMPI_ELENCO,
    order: filtro === 'perse' ? 'write_date desc' : 'priority desc, id desc',
    limit: 200,
    ...(filtro === 'perse' ? { context: { active_test: false } } : {}),
  })
  return righe.map(daRiga)
}

/** Le opportunita' in corso di un cliente (e dei suoi contatti), dalla sua scheda. */
export async function opportunitaCliente(server: string, cliente: Id): Promise<Opportunita[]> {
  const righe = await callKw<Riga[]>(server, 'crm.lead', 'search_read', [], {
    domain: [['type', '=', 'opportunity'], ['partner_id', 'child_of', cliente]],
    fields: CAMPI_ELENCO,
    order: 'priority desc, id desc',
    limit: 200,
  })
  return righe.map(daRiga)
}

/** Quante opportunita' per filtro (i numeri sulle schede in alto). */
export async function conteggi(server: string, uid: number): Promise<Record<Filtro, number>> {
  const conta = (f: Filtro) =>
    callKw<number>(server, 'crm.lead', 'search_count', [dominio(f, uid, '')], f === 'perse' ? { context: { active_test: false } } : {}).catch(() => 0)
  const [mie, tutte, perse] = await Promise.all([conta('mie'), conta('tutte'), conta('perse')])
  return { mie, tutte, perse }
}

// ---------------------------------------------------------------------------
// Una opportunita'
// ---------------------------------------------------------------------------

export type Scelta = { id: Id; nome: string }

export type Dettaglio = Opportunita & {
  /** Il cliente e' un'azienda: si mostra il logo intero, non una foto tonda. */
  clienteAzienda: boolean
  email: string
  telefono: string
  teamId: Id | null
  team: string
  etichette: Scelta[]
  descrizione: string
  attiva: boolean
  motivoPerdita: string
  segue: boolean
}

export async function dettaglio(server: string, id: Id): Promise<Dettaglio | null> {
  const s = await struttura(server)
  const campi = [
    ...CAMPI_ELENCO,
    'email_from',
    'phone',
    ...(s.campi.has('mobile') ? ['mobile'] : []),
    'team_id',
    'tag_ids',
    'description',
    'active',
    'lost_reason_id',
    'message_is_follower',
  ]
  const [r] = await callKw<(Riga & Record<string, unknown>)[]>(server, 'crm.lead', 'read', [[id], campi])
  if (!r) {
    return null
  }
  const tag = (r.tag_ids as Id[]) || []
  const [etichette, partner] = await Promise.all([
    tag.length ? callKw<{ id: Id; name: string }[]>(server, 'crm.tag', 'read', [tag, ['name']]).catch(() => []) : Promise.resolve([]),
    r.partner_id ? callKw<{ is_company: boolean }[]>(server, 'res.partner', 'read', [[r.partner_id[0]], ['is_company']]).catch(() => []) : Promise.resolve([]),
  ])
  const team = r.team_id as M2o
  const motivo = r.lost_reason_id as M2o
  return {
    ...daRiga(r),
    clienteAzienda: !!partner[0]?.is_company,
    email: (r.email_from as string) || '',
    telefono: (r.phone as string) || (r.mobile as string) || '',
    teamId: team ? team[0] : null,
    team: team ? team[1] : '',
    etichette: etichette.map((x) => ({ id: x.id, nome: x.name })),
    descrizione: testoDaHtml(r.description as string),
    attiva: r.active !== false,
    motivoPerdita: motivo ? motivo[1] : '',
    segue: !!r.message_is_follower,
  }
}

export async function elenco(server: string, cosa: 'team' | 'etichette' | 'motivi'): Promise<Scelta[]> {
  const modello = cosa === 'team' ? 'crm.team' : cosa === 'etichette' ? 'crm.tag' : 'crm.lost.reason'
  const r = await callKw<{ id: Id; name: string }[]>(server, modello, 'search_read', [], {
    domain: [],
    fields: ['name'],
    order: cosa === 'team' ? 'sequence, name' : 'name',
    limit: 200,
  })
  return r.map((x) => ({ id: x.id, nome: x.name }))
}

export type Modifica = Partial<{
  nome: string
  faseId: Id
  venditore: Id | false
  priorita: number
  teamId: Id | false
  etichette: Id[]
  clienteId: Id | false
  importo: number
  chiusura: string | false
  descrizione: string
}>

function valori(m: Modifica): Record<string, unknown> {
  const v: Record<string, unknown> = {}
  if (m.nome !== undefined) v.name = m.nome.trim()
  if (m.faseId !== undefined) v.stage_id = m.faseId
  if (m.venditore !== undefined) v.user_id = m.venditore
  if (m.priorita !== undefined) v.priority = String(m.priorita)
  if (m.teamId !== undefined) v.team_id = m.teamId
  if (m.etichette !== undefined) v.tag_ids = [[6, 0, m.etichette]]
  if (m.clienteId !== undefined) v.partner_id = m.clienteId
  if (m.importo !== undefined) v.expected_revenue = m.importo
  if (m.chiusura !== undefined) v.date_deadline = m.chiusura
  if (m.descrizione !== undefined) v.description = m.descrizione.trim() ? htmlDaTesto(m.descrizione.trim()) : false
  return v
}

export async function aggiorna(server: string, id: Id, m: Modifica): Promise<void> {
  await callKw(server, 'crm.lead', 'write', [[id], valori(m)])
}

export type Nuova = { nome: string; clienteId: Id | null; importo: number; venditore: Id | null; chiusura: string | null; descrizione: string }

/** Nuova opportunita': team e fase li sceglie Odoo come nel browser (team del venditore, prima fase). */
export async function crea(server: string, n: Nuova): Promise<Id> {
  const v: Record<string, unknown> = { type: 'opportunity', ...valori({ nome: n.nome, importo: n.importo }) }
  if (n.clienteId) v.partner_id = n.clienteId
  if (n.venditore) v.user_id = n.venditore
  if (n.chiusura) v.date_deadline = n.chiusura
  if (n.descrizione.trim()) v.description = htmlDaTesto(n.descrizione.trim())
  return callKw<Id>(server, 'crm.lead', 'create', [v])
}

export async function vinta(server: string, id: Id): Promise<void> {
  await callKw(server, 'crm.lead', 'action_set_won_rainbowman', [[id]])
}

/** Persa con il motivo e una nota, con la procedura di Odoo (pulsante «Persa»). */
export async function persa(server: string, id: Id, motivoId: Id | null, nota: string): Promise<void> {
  const mago = await callKw<Id>(server, 'crm.lead.lost', 'create', [
    { lead_ids: [[6, 0, [id]]], ...(motivoId ? { lost_reason_id: motivoId } : {}), ...(nota.trim() ? { lost_feedback: htmlDaTesto(nota.trim()) } : {}) },
  ])
  await callKw(server, 'crm.lead.lost', 'action_lost_reason_apply', [[mago]])
}

/** Rimette in corso un'opportunita' persa: `action_restore` (19, 20) o `toggle_active` (17). */
export async function ripristina(server: string, id: Id): Promise<void> {
  try {
    await callKw(server, 'crm.lead', 'action_restore', [[id]])
  } catch (e) {
    if (!(e instanceof ErroreOdoo) || e.tipo !== 'server' || !/action_restore/.test(e.message)) {
      throw e
    }
    await callKw(server, 'crm.lead', 'toggle_active', [[id]])
  }
}

// ---------------------------------------------------------------------------
// Attivita' dell'opportunita'
// ---------------------------------------------------------------------------

export type Attivita = {
  id: Id
  tipo: string
  categoria: string
  icona: string
  riassunto: string
  nota: string
  /** AAAA-MM-GG */
  scadenza: string
  stato: StatoAttivita
  persona: [Id, string] | null
}

export async function attivita(server: string, id: Id): Promise<Attivita[]> {
  const r = await callKw<
    { id: Id; activity_type_id: M2o; summary: string | false; note: string | false; date_deadline: string; state: string; user_id: M2o; icon: string | false; activity_category?: string | false }[]
  >(server, 'mail.activity', 'search_read', [], {
    domain: [['res_model', '=', 'crm.lead'], ['res_id', '=', id]],
    fields: ['activity_type_id', 'summary', 'note', 'date_deadline', 'state', 'user_id', 'icon', 'activity_category'],
    order: 'date_deadline asc, id asc',
  })
  return r.map((x) => ({
    id: x.id,
    tipo: x.activity_type_id ? x.activity_type_id[1] : '',
    categoria: x.activity_category || '',
    icona: x.icon || '',
    riassunto: x.summary || '',
    nota: testoDaHtml(x.note || ''),
    scadenza: x.date_deadline,
    stato: x.state === 'overdue' || x.state === 'today' ? x.state : 'planned',
    persona: x.user_id || null,
  }))
}

export type TipoAttivita = { id: Id; nome: string; categoria: string; icona: string; giorni: number }

/** I tipi di attivita' che valgono per il CRM (quelli senza modello valgono per tutti). */
export async function tipiAttivita(server: string): Promise<TipoAttivita[]> {
  const r = await callKw<{ id: Id; name: string; category: string | false; icon: string | false; delay_count: number; delay_unit: string }[]>(
    server,
    'mail.activity.type',
    'search_read',
    [],
    { domain: ['|', ['res_model', '=', false], ['res_model', '=', 'crm.lead']], fields: ['name', 'category', 'icon', 'delay_count', 'delay_unit'], order: 'sequence, id' },
  )
  return r.map((x) => ({
    id: x.id,
    nome: x.name,
    categoria: x.category || '',
    icona: x.icon || '',
    giorni: x.delay_unit === 'weeks' ? x.delay_count * 7 : x.delay_unit === 'months' ? x.delay_count * 30 : x.delay_count || 0,
  }))
}

/** Pianifica un'attivita' sull'opportunita' (come «Pianifica attivita'» di Odoo). */
export async function pianifica(server: string, id: Id, a: { tipoId: Id; data: string; riassunto: string; persona: Id }): Promise<void> {
  await callKw(server, 'crm.lead', 'activity_schedule', [[id]], {
    activity_type_id: a.tipoId,
    date_deadline: a.data,
    summary: a.riassunto.trim(),
    user_id: a.persona,
  })
}

export function fatta(server: string, attivitaId: Id): Promise<void> {
  return completaAttivita(server, attivitaId)
}

/** Icona dell'app CRM di Odoo (uguale dalla 17 alla 20). */
export function iconaCrm(server: string): string {
  return `${server}/crm/static/description/icon.png`
}

/** Data di Odoo «AAAA-MM-GG HH:MM:SS» o «AAAA-MM-GG» in Date (le date senza ora a mezzogiorno). */
export function giornoOdoo(valore: string): Date | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valore) ? new Date(`${valore}T12:00:00`) : dataOdoo(valore)
}
