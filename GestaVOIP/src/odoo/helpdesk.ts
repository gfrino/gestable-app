/**
 * Helpdesk di Odoo: ticket, fasi, assegnazione, conversazione con il cliente,
 * note interne, ore e timer.
 *
 * Funziona con i due Helpdesk che si trovano sui server dei clienti:
 * - OCA `helpdesk_mgmt` (Community, anche su ticinoweb.online) con i suoi
 *   moduli per progetto, ore (`helpdesk_mgmt_timesheet`, timer di
 *   `project_timesheet_time_control`) e ordini di vendita;
 * - Odoo Enterprise `helpdesk`.
 * Nomi di campi e modelli si leggono dal server (fields_get) invece di
 * scriverli per una versione sola.
 */

import { t } from '../i18n'
import { callKw } from './client'
import * as registro from './registro'
import { dataOdoo, htmlDaTesto, testoDaHtml } from './testo'

type Id = number
type M2o = [number, string] | false

export type Struttura = {
  /** 'oca' = helpdesk_mgmt, 'enterprise' = helpdesk di Odoo. */
  tipo: 'oca' | 'enterprise'
  fasi: string
  team: string
  etichette: string
  /** Campo e modello della categoria (OCA) o del tipo di ticket (Enterprise). */
  categoria: { campo: string; modello: string } | null
  canale: boolean
  numero: string | null
  /** Le fasi chiuse si riconoscono da `closed` (OCA) o da `fold` (Enterprise). */
  chiusa: 'closed' | 'fold'
  membriTeam: string | null
  progetto: boolean
  ore: boolean
  /** Campo della riga ore che punta al ticket (OCA `ticket_id`, Enterprise `helpdesk_ticket_id`). */
  campoTicketOre: string | null
  timer: boolean
  vendite: boolean
  descrizioneObbligatoria: boolean
  priorita: { valore: string; nome: string }[]
}

const strutture = new Map<string, Promise<Struttura>>()

async function leggiStruttura(server: string): Promise<Struttura> {
  const f = await callKw<Record<string, { type: string; relation?: string; required?: boolean; selection?: [string, string][] }>>(
    server,
    'helpdesk.ticket',
    'fields_get',
    [],
    { attributes: ['type', 'relation', 'required', 'selection'] },
  )
  const fasi = f.stage_id?.relation || 'helpdesk.ticket.stage'
  const team = f.team_id?.relation || 'helpdesk.ticket.team'
  const tipo: Struttura['tipo'] = fasi === 'helpdesk.stage' ? 'enterprise' : 'oca'
  const [campiFase, campiTeam, campiOre] = await Promise.all([
    callKw<Record<string, unknown>>(server, fasi, 'fields_get', [], { attributes: ['type'] }),
    callKw<Record<string, unknown>>(server, team, 'fields_get', [], { attributes: ['type'] }),
    f.timesheet_ids
      ? callKw<Record<string, unknown>>(server, 'account.analytic.line', 'fields_get', [], { attributes: ['type'] }).catch(() => ({}))
      : Promise.resolve({} as Record<string, unknown>),
  ])
  const categoria = f.category_id?.relation
    ? { campo: 'category_id', modello: f.category_id.relation }
    : f.ticket_type_id?.relation
      ? { campo: 'ticket_type_id', modello: f.ticket_type_id.relation }
      : null
  return {
    tipo,
    fasi,
    team,
    etichette: f.tag_ids?.relation || 'helpdesk.ticket.tag',
    categoria,
    canale: !!f.channel_id,
    numero: f.number ? 'number' : f.ticket_ref ? 'ticket_ref' : null,
    chiusa: 'closed' in campiFase ? 'closed' : 'fold',
    membriTeam: 'user_ids' in campiTeam ? 'user_ids' : 'member_ids' in campiTeam ? 'member_ids' : null,
    progetto: !!f.project_id,
    ore: !!f.timesheet_ids,
    campoTicketOre: 'ticket_id' in campiOre ? 'ticket_id' : 'helpdesk_ticket_id' in campiOre ? 'helpdesk_ticket_id' : null,
    timer: !!f.show_time_control,
    vendite: !!f.sale_order_ids,
    descrizioneObbligatoria: !!f.description?.required,
    priorita: (f.priority?.selection || []).map(([valore, nome]) => ({ valore, nome })),
  }
}

export function struttura(server: string): Promise<Struttura> {
  let p = strutture.get(server)
  if (!p) {
    p = leggiStruttura(server)
    p.catch(() => strutture.delete(server))
    strutture.set(server, p)
  }
  return p
}

export function dimenticaHelpdesk(): void {
  strutture.clear()
}

// ---------------------------------------------------------------------------
// Elenco
// ---------------------------------------------------------------------------

/** `u12`: i ticket aperti assegnati al collega con quell'id utente. */
export type Filtro = 'miei' | 'liberi' | 'aperti' | 'chiusi' | `u${number}`

/** Un collega con almeno un ticket aperto assegnato (una pillola in alto). */
export type Collega = { id: Id; nome: string; ticket: number }

export type Ticket = {
  id: Id
  numero: string
  titolo: string
  cliente: string
  clienteId: Id | null
  assegnato: [Id, string] | null
  faseId: Id | null
  fase: string
  team: string
  priorita: number
  creato: Date | null
  aggiornato: Date | null
}

type RigaTicket = {
  id: Id
  name: string
  number?: string | false
  ticket_ref?: string | false
  partner_id: M2o
  partner_name?: string | false
  user_id: M2o
  stage_id: M2o
  team_id: M2o
  priority: string | false
  create_date: string
  write_date: string
}

function campiElenco(s: Struttura): string[] {
  return ['name', 'partner_id', 'partner_name', 'user_id', 'stage_id', 'team_id', 'priority', 'create_date', 'write_date', ...(s.numero ? [s.numero] : [])]
}

function daRiga(r: RigaTicket): Ticket {
  return {
    id: r.id,
    numero: (r.number || r.ticket_ref || '') as string,
    titolo: r.name,
    cliente: r.partner_id ? r.partner_id[1] : r.partner_name || '',
    clienteId: r.partner_id ? r.partner_id[0] : null,
    assegnato: r.user_id || null,
    faseId: r.stage_id ? r.stage_id[0] : null,
    fase: r.stage_id ? r.stage_id[1] : '',
    team: r.team_id ? r.team_id[1] : '',
    priorita: Number(r.priority || 0),
    creato: dataOdoo(r.create_date),
    aggiornato: dataOdoo(r.write_date),
  }
}

function dominio(s: Struttura, filtro: Filtro, uid: number, testo: string): unknown[] {
  const chiusa = `stage_id.${s.chiusa}`
  const d: unknown[] = [[chiusa, '=', filtro === 'chiusi']]
  if (filtro === 'miei') {
    d.push(['user_id', '=', uid])
  } else if (filtro === 'liberi') {
    d.push(['user_id', '=', false])
  } else if (filtro.startsWith('u')) {
    d.push(['user_id', '=', Number(filtro.slice(1))])
  }
  const q = testo.trim()
  if (q) {
    const parti: unknown[] = [['name', 'ilike', q], ['partner_id', 'ilike', q]]
    if (s.numero) {
      parti.push([s.numero, 'ilike', q])
    }
    d.push(...Array(parti.length - 1).fill('|'), ...parti)
  }
  return d
}

export async function tickets(server: string, uid: number, filtro: Filtro, testo = ''): Promise<Ticket[]> {
  const s = await struttura(server)
  const righe = await callKw<RigaTicket[]>(server, 'helpdesk.ticket', 'search_read', [], {
    domain: dominio(s, filtro, uid, testo),
    fields: campiElenco(s),
    order: filtro === 'chiusi' ? 'write_date desc' : 'priority desc, create_date desc',
    limit: 120,
  })
  return righe.map(daRiga)
}

export type Conteggi = { miei: number; liberi: number; aperti: number; colleghi: Collega[] }

/**
 * Quanti ticket aperti per ogni filtro (i numeri sulle schede in alto) e i
 * colleghi che ne hanno almeno uno assegnato, dal piu' carico. Si legge solo
 * chi e' assegnato (un campo per ticket): vale da Odoo 17 a 20, senza read_group.
 */
export async function conteggi(server: string, uid: number): Promise<Conteggi> {
  const s = await struttura(server)
  const conta = (f: Filtro) => callKw<number>(server, 'helpdesk.ticket', 'search_count', [dominio(s, f, uid, '')]).catch(() => 0)
  const [miei, liberi, aperti, assegnati] = await Promise.all([
    conta('miei'),
    conta('liberi'),
    conta('aperti'),
    callKw<{ user_id: M2o }[]>(server, 'helpdesk.ticket', 'search_read', [], {
      domain: [...dominio(s, 'aperti', uid, ''), ['user_id', '!=', false], ['user_id', '!=', uid]],
      fields: ['user_id'],
      limit: 5000,
    }).catch(() => []),
  ])
  const per = new Map<Id, Collega>()
  for (const r of assegnati) {
    if (!r.user_id) {
      continue
    }
    const c = per.get(r.user_id[0]) || { id: r.user_id[0], nome: r.user_id[1], ticket: 0 }
    c.ticket += 1
    per.set(c.id, c)
  }
  const colleghi = [...per.values()].sort((a, b) => b.ticket - a.ticket || a.nome.localeCompare(b.nome))
  return { miei, liberi, aperti, colleghi }
}

// ---------------------------------------------------------------------------
// Un ticket
// ---------------------------------------------------------------------------

export type Scelta = { id: Id; nome: string }

export type DettaglioTicket = Ticket & {
  /** Il cliente e' un'azienda: si mostra il logo intero, non una foto tonda. */
  clienteAzienda: boolean
  descrizione: string
  email: string
  telefono: string
  teamId: Id | null
  categoria: Scelta | null
  canale: string
  etichette: Scelta[]
  progetto: Scelta | null
  attivita: Scelta | null
  vendite: Scelta[]
  oreFatte: number
  orePreviste: number
  /** Il timer delle ore: 'start' si puo' avviare, 'stop' sta andando, null non c'e'. */
  timer: 'start' | 'stop' | null
  chiuso: boolean
  segue: boolean
}

export async function ticket(server: string, id: Id): Promise<DettaglioTicket | null> {
  const s = await struttura(server)
  const campi = [
    ...campiElenco(s),
    'description',
    'partner_email',
    'tag_ids',
    'message_is_follower',
    ...(s.categoria ? [s.categoria.campo] : []),
    ...(s.canale ? ['channel_id'] : []),
    ...(s.progetto ? ['project_id', 'task_id'] : []),
    ...(s.ore ? ['total_hours', 'planned_hours'] : []),
    ...(s.timer ? ['show_time_control'] : []),
    ...(s.vendite ? ['sale_order_ids'] : []),
  ]
  const [r] = await callKw<(RigaTicket & Record<string, unknown>)[]>(server, 'helpdesk.ticket', 'read', [[id], campi])
  if (!r) {
    return null
  }
  const m2o = (v: unknown): Scelta | null => (Array.isArray(v) ? { id: v[0] as number, nome: v[1] as string } : null)
  const [etichette, vendite, partner, fase] = await Promise.all([
    (r.tag_ids as Id[])?.length
      ? callKw<{ id: Id; name: string }[]>(server, s.etichette, 'read', [r.tag_ids, ['name']]).catch(() => [])
      : Promise.resolve([]),
    (r.sale_order_ids as Id[] | undefined)?.length
      ? callKw<{ id: Id; name: string }[]>(server, 'sale.order', 'read', [r.sale_order_ids, ['name']]).catch(() => [])
      : Promise.resolve([]),
    r.partner_id
      ? callKw<{ phone: string | false; is_company: boolean }[]>(server, 'res.partner', 'read', [[r.partner_id[0]], ['phone', 'is_company']]).catch(() => [])
      : Promise.resolve([]),
    r.stage_id
      ? callKw<Record<string, unknown>[]>(server, s.fasi, 'read', [[r.stage_id[0]], [s.chiusa]]).catch(() => [])
      : Promise.resolve([]),
  ])
  return {
    ...daRiga(r),
    clienteAzienda: !!partner[0]?.is_company,
    descrizione: testoDaHtml(r.description as string),
    email: (r.partner_email as string) || '',
    telefono: (partner[0]?.phone as string) || '',
    teamId: r.team_id ? r.team_id[0] : null,
    categoria: s.categoria ? m2o(r[s.categoria.campo]) : null,
    canale: Array.isArray(r.channel_id) ? (r.channel_id[1] as string) : '',
    etichette: etichette.map((x) => ({ id: x.id, nome: x.name })),
    progetto: m2o(r.project_id),
    attivita: m2o(r.task_id),
    vendite: vendite.map((x) => ({ id: x.id, nome: x.name })),
    oreFatte: (r.total_hours as number) || 0,
    orePreviste: (r.planned_hours as number) || 0,
    timer: r.show_time_control === 'start' || r.show_time_control === 'stop' ? r.show_time_control : null,
    chiuso: !!fase[0]?.[s.chiusa],
    segue: !!r.message_is_follower,
  }
}

export type Fase = { id: Id; nome: string; chiusa: boolean }

/** Le fasi che valgono per il team del ticket (quelle senza team valgono per tutti). */
export async function fasi(server: string, teamId: Id | null): Promise<Fase[]> {
  const s = await struttura(server)
  const r = await callKw<{ id: Id; name: string; team_ids?: Id[]; closed?: boolean; fold?: boolean }[]>(server, s.fasi, 'search_read', [], {
    domain: [],
    fields: ['name', 'team_ids', s.chiusa],
    order: 'sequence, id',
  })
  return r
    .filter((x) => !teamId || !x.team_ids?.length || x.team_ids.includes(teamId))
    .map((x) => ({ id: x.id, nome: x.name, chiusa: !!x[s.chiusa] }))
}

export async function elenco(server: string, cosa: 'team' | 'etichette' | 'categoria'): Promise<Scelta[]> {
  const s = await struttura(server)
  const modello = cosa === 'team' ? s.team : cosa === 'etichette' ? s.etichette : s.categoria?.modello
  if (!modello) {
    return []
  }
  const r = await callKw<{ id: Id; name: string }[]>(server, modello, 'search_read', [], { domain: [], fields: ['name'], order: 'name', limit: 200 })
  return r.map((x) => ({ id: x.id, nome: x.name }))
}

export type Modifica = Partial<{
  faseId: Id
  assegnato: Id | false
  priorita: number
  teamId: Id | false
  categoriaId: Id | false
  etichette: Id[]
  clienteId: Id | false
  titolo: string
  descrizione: string
}>

export async function aggiorna(server: string, id: Id, m: Modifica): Promise<void> {
  const s = await struttura(server)
  const v: Record<string, unknown> = {}
  if (m.faseId !== undefined) v.stage_id = m.faseId
  if (m.assegnato !== undefined) v.user_id = m.assegnato
  if (m.priorita !== undefined) v.priority = String(m.priorita)
  if (m.teamId !== undefined) v.team_id = m.teamId
  if (m.categoriaId !== undefined && s.categoria) v[s.categoria.campo] = m.categoriaId
  if (m.etichette !== undefined) v.tag_ids = [[6, 0, m.etichette]]
  if (m.clienteId !== undefined) v.partner_id = m.clienteId
  if (m.titolo !== undefined) v.name = m.titolo.trim()
  if (m.descrizione !== undefined) v.description = htmlDaTesto(m.descrizione)
  await callKw(server, 'helpdesk.ticket', 'write', [[id], v])
}

export type NuovoTicket = {
  titolo: string
  descrizione: string
  clienteId: Id | null
  teamId: Id | null
  categoriaId: Id | null
  priorita: number
  assegnato: Id | null
}

export async function creaTicket(server: string, n: NuovoTicket): Promise<Id> {
  const s = await struttura(server)
  const v: Record<string, unknown> = {
    name: n.titolo.trim(),
    description: htmlDaTesto(n.descrizione.trim() || n.titolo.trim()),
    priority: String(n.priorita),
  }
  if (n.clienteId) v.partner_id = n.clienteId
  if (n.teamId) v.team_id = n.teamId
  if (n.categoriaId && s.categoria) v[s.categoria.campo] = n.categoriaId
  if (n.assegnato) v.user_id = n.assegnato
  return callKw<Id>(server, 'helpdesk.ticket', 'create', [v])
}

/** Segue (o smette di seguire) il ticket: arrivano le notifiche dei messaggi nuovi. */
export function seguiTicket(server: string, uid: number, id: Id, segui: boolean): Promise<void> {
  return registro.segui(server, uid, 'helpdesk.ticket', id, segui)
}

// ---------------------------------------------------------------------------
// Conversazione (uguale per tutti i record: src/odoo/registro.ts)
// ---------------------------------------------------------------------------

export type Messaggio = registro.Messaggio

export function conversazione(server: string, id: Id): Promise<Messaggio[]> {
  return registro.conversazione(server, 'helpdesk.ticket', id)
}

/**
 * Scrive nel ticket: `nota` interna (solo colleghi) o risposta al cliente
 * (va per email ai follower, cliente compreso). Le foto (file://) diventano allegati.
 */
export function scrivi(server: string, id: Id, testo: string, nota: boolean, foto: string[] = []): Promise<void> {
  return registro.scrivi(server, 'helpdesk.ticket', id, testo, nota, foto)
}

// ---------------------------------------------------------------------------
// Ore
// ---------------------------------------------------------------------------

export type RigaOre = { id: Id; data: string; descrizione: string; ore: number; persona: string; inCorso: Date | null }

export async function ore(server: string, id: Id): Promise<RigaOre[]> {
  const s = await struttura(server)
  if (!s.ore || !s.campoTicketOre) {
    return []
  }
  const campi = ['date', 'name', 'unit_amount', 'employee_id', ...(s.timer ? ['date_time', 'show_time_control'] : [])]
  const r = await callKw<{ id: Id; date: string; name: string | false; unit_amount: number; employee_id: M2o; date_time?: string | false; show_time_control?: string | false }[]>(
    server,
    'account.analytic.line',
    'search_read',
    [],
    { domain: [[s.campoTicketOre, '=', id]], fields: campi, order: 'date desc, id desc', limit: 50 },
  )
  return r.map((x) => ({
    id: x.id,
    data: x.date,
    descrizione: x.name && x.name !== '/' ? x.name : '',
    ore: x.unit_amount || 0,
    persona: x.employee_id ? x.employee_id[1] : '',
    inCorso: x.show_time_control === 'stop' && x.date_time ? dataOdoo(x.date_time) : null,
  }))
}

/** Registra ore a mano sul ticket (serve un progetto sul ticket). */
export async function aggiungiOre(server: string, t: DettaglioTicket, ore: number, descrizione: string, data: string): Promise<void> {
  const s = await struttura(server)
  if (!s.campoTicketOre || !t.progetto) {
    throw new Error(tSenzaProgetto())
  }
  await callKw(server, 'account.analytic.line', 'create', [
    {
      [s.campoTicketOre]: t.id,
      project_id: t.progetto.id,
      ...(t.attivita ? { task_id: t.attivita.id } : {}),
      name: descrizione.trim() || t.titolo,
      unit_amount: ore,
      date: data,
    },
  ])
}

/**
 * Timer (OCA): si avvia come il pulsante di Odoo, con la procedura che ferma
 * l'eventuale altro timer in corso; si ferma con il metodo del ticket.
 */
export async function avviaTimer(server: string, t: DettaglioTicket, descrizione: string): Promise<void> {
  const s = await struttura(server)
  if (!s.timer || !s.campoTicketOre || !t.progetto) {
    throw new Error(tSenzaProgetto())
  }
  const contesto = {
    [`default_${s.campoTicketOre}`]: t.id,
    default_project_id: t.progetto.id,
    ...(t.attivita ? { default_task_id: t.attivita.id } : {}),
  }
  const mago = await callKw<Id>(server, 'hr.timesheet.switch', 'create', [{ name: descrizione.trim() || t.titolo }], { context: contesto })
  await callKw(server, 'hr.timesheet.switch', 'action_switch', [[mago]], { context: contesto })
}

export async function fermaTimer(server: string, id: Id): Promise<void> {
  await callKw(server, 'helpdesk.ticket', 'button_end_work', [[id]])
}

function tSenzaProgetto(): string {
  return t('helpdesk.oreSenzaProgetto')
}
