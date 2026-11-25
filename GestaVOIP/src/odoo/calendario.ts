/**
 * Il calendario di Odoo (calendar.event): i miei appuntamenti, la scheda
 * completa, la risposta a un invito, creare, modificare ed eliminare.
 *
 * Tutti i campi del modulo di Odoo sono nell'app: titolo, date, tutto il
 * giorno, invitati, organizzatore, luogo, videochiamata, descrizione, note
 * interne (Odoo 19+), etichette, promemoria, privacy, mostra come, calendario
 * (Odoo 20) e ripetizione. I campi si leggono da fields_get una volta per
 * server: si chiedono e si scrivono solo quelli che esistono (Odoo 17, 19, 20).
 *
 * Odoo salva start/stop in UTC («2026-11-25 08:00:00»); gli appuntamenti di
 * tutto il giorno hanno anche start_date/stop_date, date senza ora.
 */

import { lingua, loc, t, tn } from '../i18n'
import { callKw } from './client'
import { mioPartner } from './lavoro'
import { dataOdoo, htmlDaTesto, testoDaHtml } from './testo'

type Id = number
type M2o = [number, string] | false

export type Evento = {
  id: Id
  titolo: string
  inizio: Date
  fine: Date
  tuttoIlGiorno: boolean
  /** Per gli eventi di tutto il giorno: primo e ultimo giorno, «AAAA-MM-GG». */
  dal: string
  al: string
  luogo: string
  video: string
  organizzatore: string
  partecipanti: number
}

export type Stato = 'accepted' | 'declined' | 'tentative' | 'needsAction'
export type Partecipante = { id: Id; partnerId: Id; nome: string; email: string; stato: Stato; io: boolean }
export type Voce = { id: Id; nome: string }

export type TipoRipetizione = 'daily' | 'weekly' | 'monthly' | 'yearly'
export type FineRipetizione = 'forever' | 'count' | 'end_date'
export const GIORNI_SETTIMANA = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type GiornoSettimana = (typeof GIORNI_SETTIMANA)[number]

export type Ripetizione = {
  tipo: TipoRipetizione
  ogni: number
  fine: FineRipetizione
  volte: number
  /** «AAAA-MM-GG» */
  finoAl: string
  giorni: GiornoSettimana[]
  /** Mensile: «date» = lo stesso giorno del mese, «day» = es. il quarto mercoledi'. */
  mesePer: 'date' | 'day'
}

export type Scheda = Evento & {
  descrizione: string
  note: string
  persone: Partecipante[]
  organizzatoreId: Id | null
  etichette: Voce[]
  promemoria: Voce[]
  privacy: string
  mostraCome: string
  calendario: Voce | null
  ripetizione: Ripetizione | null
  /** L'evento fa parte di una serie (anche se questa occorrenza e' un'eccezione). */
  inSerie: boolean
  puoModificare: boolean
  collegatoA: string
}

/** Compatibilita' con il nome di prima. */
export type DettaglioEvento = Scheda

/** Data locale «AAAA-MM-GG». */
export function giornoChiave(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** «mercoledì 25 novembre» → «Mercoledì 25 novembre» (solo la prima lettera). */
export function giornoEsteso(d: Date): string {
  const x = d.toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' })
  return x.charAt(0).toUpperCase() + x.slice(1)
}

/** L'ora breve nella lingua dell'app: «14:00» in italiano, «2:00 PM» in inglese. */
export function oraBreve(d: Date): string {
  return d.toLocaleTimeString(loc(), { hour: lingua() === 'it' ? '2-digit' : 'numeric', minute: '2-digit' })
}

/** Le iniziali dei giorni da lunedi' a domenica («L M M G V S D», «M T W T F S S»). */
export function lettereGiorni(): string[] {
  return t('calendario.lettereGiorni').split(' ')
}

/** Un istante in UTC nel formato di Odoo. */
function utc(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19)
}

// ---------------------------------------------------------------------------
// Campi che esistono su questo server
// ---------------------------------------------------------------------------

type InfoCampo = { type: string; selection?: [string, string][]; string?: string; required?: boolean }
const campiDi = new Map<string, Promise<Record<string, InfoCampo>>>()

function campiEvento(server: string): Promise<Record<string, InfoCampo>> {
  let p = campiDi.get(server)
  if (!p) {
    p = callKw<Record<string, InfoCampo>>(server, 'calendar.event', 'fields_get', [], {
      attributes: ['type', 'selection', 'string', 'required'],
    })
    p.catch(() => campiDi.delete(server))
    campiDi.set(server, p)
  }
  return p
}

function solo(campi: Record<string, InfoCampo>, voluti: string[]): string[] {
  return voluti.filter((c) => c in campi)
}

// ---------------------------------------------------------------------------
// Lista della settimana
// ---------------------------------------------------------------------------

const CAMPI = ['name', 'start', 'stop', 'allday', 'start_date', 'stop_date', 'location', 'videocall_location', 'user_id', 'partner_ids']

type Riga = {
  id: Id
  name: string
  start: string
  stop: string
  allday: boolean
  start_date: string | false
  stop_date: string | false
  location: string | false
  videocall_location: string | false
  user_id: M2o
  partner_ids: Id[]
}

function daRiga(r: Riga): Evento {
  const dal = r.start_date || r.start.slice(0, 10)
  const al = r.stop_date || r.stop.slice(0, 10)
  return {
    id: r.id,
    titolo: r.name || t('calendario.senzaTitolo'),
    // Tutto il giorno: date locali, l'ora non conta.
    inizio: r.allday ? new Date(`${dal}T00:00:00`) : dataOdoo(r.start) || new Date(),
    fine: r.allday ? new Date(`${al}T23:59:59`) : dataOdoo(r.stop) || new Date(),
    tuttoIlGiorno: !!r.allday,
    dal,
    al,
    luogo: r.location || '',
    video: r.videocall_location || '',
    organizzatore: r.user_id ? r.user_id[1] : '',
    partecipanti: r.partner_ids?.length || 0,
  }
}

/** I miei appuntamenti (partecipo o li organizzo) che toccano l'intervallo. */
export async function eventi(server: string, uid: number, da: Date, a: Date): Promise<Evento[]> {
  const io = await mioPartner(server, uid)
  // Un giorno di margine: gli eventi di tutto il giorno stanno in UTC a cavallo
  // della mezzanotte; il filtro per giorno lo fa l'app.
  const prima = new Date(da.getTime() - 86_400_000)
  const dopo = new Date(a.getTime() + 86_400_000)
  const righe = await callKw<Riga[]>(server, 'calendar.event', 'search_read', [], {
    domain: [['partner_ids', 'in', [io]], ['start', '<', utc(dopo)], ['stop', '>', utc(prima)]],
    fields: CAMPI,
    order: 'start asc',
    limit: 500,
  })
  return righe.map(daRiga)
}

/** Gli eventi del giorno, prima quelli di tutto il giorno, poi per ora. */
export function delGiorno(lista: Evento[], giorno: Date): Evento[] {
  const chiave = giornoChiave(giorno)
  const inizio = new Date(giorno.getFullYear(), giorno.getMonth(), giorno.getDate())
  const fine = new Date(inizio.getTime() + 86_400_000)
  return lista
    .filter((e) => (e.tuttoIlGiorno ? e.dal <= chiave && chiave <= e.al : e.inizio < fine && e.fine > inizio))
    .sort((x, y) => Number(y.tuttoIlGiorno) - Number(x.tuttoIlGiorno) || x.inizio.getTime() - y.inizio.getTime())
}

// ---------------------------------------------------------------------------
// Scheda completa
// ---------------------------------------------------------------------------

const CAMPI_SCHEDA = [
  ...CAMPI,
  'description', 'notes', 'attendee_ids', 'categ_ids', 'alarm_ids', 'privacy', 'show_as', 'calendar_id',
  'recurrency', 'recurrence_id', 'rrule_type', 'interval', 'end_type', 'count', 'until',
  ...GIORNI_SETTIMANA, 'month_by', 'user_can_edit', 'res_model_name', 'res_model', 'res_id',
]

type RigaScheda = Riga & {
  description?: string | false
  notes?: string | false
  attendee_ids: Id[]
  categ_ids?: Id[]
  alarm_ids?: Id[]
  privacy?: string | false
  show_as?: string | false
  calendar_id?: M2o
  recurrency?: boolean
  recurrence_id?: M2o
  rrule_type?: TipoRipetizione | false
  interval?: number
  end_type?: FineRipetizione | false
  count?: number
  until?: string | false
  month_by?: 'date' | 'day' | false
  user_can_edit?: boolean
  res_model_name?: string | false
  res_model?: string | false
  res_id?: Id
} & Partial<Record<GiornoSettimana, boolean>>

async function nomi(server: string, modello: string, ids: Id[] | undefined): Promise<Voce[]> {
  if (!ids?.length) {
    return []
  }
  const r = await callKw<{ id: Id; display_name: string }[]>(server, modello, 'read', [ids, ['display_name']]).catch(() => [])
  return r.map((x) => ({ id: x.id, nome: x.display_name }))
}

export async function dettaglioEvento(server: string, uid: number, id: Id): Promise<Scheda | null> {
  const [io, campi] = await Promise.all([mioPartner(server, uid), campiEvento(server)])
  const [r] = await callKw<RigaScheda[]>(server, 'calendar.event', 'read', [[id], solo(campi, CAMPI_SCHEDA)])
  if (!r) {
    return null
  }
  const [persone, etichette, promemoria, collegato] = await Promise.all([
    r.attendee_ids.length
      ? callKw<{ id: Id; partner_id: M2o; common_name: string | false; email?: string | false; state: Stato }[]>(
          server,
          'calendar.attendee',
          'read',
          [r.attendee_ids, ['partner_id', 'common_name', 'email', 'state']],
        )
      : Promise.resolve([]),
    nomi(server, 'calendar.event.type', r.categ_ids),
    nomi(server, 'calendar.alarm', r.alarm_ids),
    r.res_model && r.res_id ? nomi(server, r.res_model, [r.res_id]) : Promise.resolve([]),
  ])
  const ripetizione: Ripetizione | null = r.recurrency
    ? {
        tipo: r.rrule_type || 'weekly',
        ogni: r.interval || 1,
        fine: r.end_type || 'forever',
        volte: r.count || 1,
        finoAl: r.until || '',
        giorni: GIORNI_SETTIMANA.filter((g) => r[g]),
        mesePer: r.month_by || 'date',
      }
    : null
  return {
    ...daRiga(r),
    descrizione: testoDaHtml(r.description),
    note: testoDaHtml(r.notes),
    organizzatoreId: r.user_id ? r.user_id[0] : null,
    etichette,
    promemoria,
    privacy: r.privacy || '',
    mostraCome: r.show_as || '',
    calendario: r.calendar_id ? { id: r.calendar_id[0], nome: r.calendar_id[1] } : null,
    ripetizione,
    inSerie: !!r.recurrence_id,
    // Odoo 17 senza il campo: chi vede l'evento puo' provare, Odoo decide.
    puoModificare: r.user_can_edit ?? true,
    collegatoA: collegato[0] ? `${r.res_model_name ? `${r.res_model_name}: ` : ''}${collegato[0].nome}` : '',
    persone: persone
      .map((p) => ({
        id: p.id,
        partnerId: p.partner_id ? p.partner_id[0] : 0,
        nome: p.common_name || (p.partner_id ? p.partner_id[1] : ''),
        email: p.email || '',
        stato: p.state,
        io: !!p.partner_id && p.partner_id[0] === io,
      }))
      .sort((a, b) => Number(b.io) - Number(a.io) || a.nome.localeCompare(b.nome)),
  }
}

export async function rispondi(server: string, partecipante: Id, risposta: 'accepted' | 'tentative' | 'declined'): Promise<void> {
  const metodo = risposta === 'accepted' ? 'do_accept' : risposta === 'declined' ? 'do_decline' : 'do_tentative'
  await callKw(server, 'calendar.attendee', metodo, [[partecipante]])
}

// ---------------------------------------------------------------------------
// Scelte del modulo: etichette, promemoria, calendari, privacy, persone
// ---------------------------------------------------------------------------

export type Scelta = { valore: string; nome: string }

export type Opzioni = {
  etichette: Voce[]
  promemoria: Voce[]
  /** Solo Odoo 20 (calendar.calendar): vuoto altrove. */
  calendari: Voce[]
  privacy: Scelta[]
  /** Odoo 19+: la privacy puo' restare vuota (= quella del calendario/utente). */
  privacyFacoltativa: boolean
  mostraCome: Scelta[]
  haNote: boolean
  haVideo: boolean
  haRipetizione: boolean
}

export async function opzioniEvento(server: string): Promise<Opzioni> {
  const campi = await campiEvento(server)
  const lista = async (modello: string, campo: string, ordine: string): Promise<Voce[]> => {
    if (!(campo in campi)) {
      return []
    }
    const r = await callKw<{ id: Id; display_name: string }[]>(server, modello, 'search_read', [], {
      fields: ['display_name'],
      order: ordine,
      limit: 200,
    }).catch(() => [])
    return r.map((x) => ({ id: x.id, nome: x.display_name }))
  }
  const [etichette, promemoria, calendari] = await Promise.all([
    lista('calendar.event.type', 'categ_ids', 'name asc'),
    lista('calendar.alarm', 'alarm_ids', 'duration_minutes asc, id asc'),
    lista('calendar.calendar', 'calendar_id', 'id asc'),
  ])
  const scelte = (c: string): Scelta[] => (campi[c]?.selection || []).map(([valore, nome]) => ({ valore, nome }))
  return {
    etichette,
    promemoria,
    calendari,
    privacy: scelte('privacy'),
    privacyFacoltativa: !campi.privacy?.required,
    mostraCome: scelte('show_as'),
    haNote: 'notes' in campi,
    haVideo: 'videocall_location' in campi,
    haRipetizione: 'recurrency' in campi,
  }
}

export type Persona = { id: Id; nome: string; email: string; azienda: string }

/** Contatti da invitare: nome, email o azienda. */
export async function cercaInvitati(server: string, testo: string): Promise<Persona[]> {
  const t = testo.trim()
  const dominio: unknown[] = [['name', '!=', false]]
  if (t) {
    dominio.push('|', '|', ['name', 'ilike', t], ['email', 'ilike', t], ['commercial_company_name', 'ilike', t])
  } else {
    dominio.push(['email', '!=', false])
  }
  const r = await callKw<{ id: Id; name: string; email: string | false; parent_id: M2o }[]>(
    server,
    'res.partner',
    'search_read',
    [],
    { domain: dominio, fields: ['name', 'email', 'parent_id'], order: 'name asc', limit: 40 },
  )
  return r.map((p) => ({ id: p.id, nome: p.name, email: p.email || '', azienda: p.parent_id ? p.parent_id[1] : '' }))
}

/** Un invitato nuovo da un indirizzo email (come fa Odoo scrivendo l'email). */
export async function creaInvitato(server: string, email: string): Promise<Persona> {
  const e = email.trim()
  const [esiste] = await callKw<{ id: Id; display_name: string }[]>(server, 'res.partner', 'search_read', [], {
    domain: [['email', '=ilike', e]],
    fields: ['display_name'],
    limit: 1,
  })
  if (esiste) {
    return { id: esiste.id, nome: esiste.display_name, email: e, azienda: '' }
  }
  const id = await callKw<Id>(server, 'res.partner', 'create', [{ name: e, email: e }])
  return { id, nome: e, email: e, azienda: '' }
}

/** Utenti interni di Odoo: possono organizzare un appuntamento. */
export async function cercaUtenti(server: string, testo: string): Promise<Persona[]> {
  const t = testo.trim()
  const dominio: unknown[] = [['share', '=', false]]
  if (t) {
    dominio.push('|', ['name', 'ilike', t], ['login', 'ilike', t])
  }
  const r = await callKw<{ id: Id; name: string; login: string }[]>(server, 'res.users', 'search_read', [], {
    domain: dominio,
    fields: ['name', 'login'],
    order: 'name asc',
    limit: 60,
  })
  return r.map((u) => ({ id: u.id, nome: u.name, email: u.login, azienda: '' }))
}

/** Un link di videochiamata di Odoo (Discuss), nuovo. */
export async function linkVideoOdoo(server: string): Promise<string> {
  return callKw<string>(server, 'calendar.event', 'get_discuss_videocall_location', [])
}

// ---------------------------------------------------------------------------
// Salvare ed eliminare
// ---------------------------------------------------------------------------

export type Modulo = {
  titolo: string
  tuttoIlGiorno: boolean
  inizio: Date
  fine: Date
  invitati: Persona[]
  organizzatoreId: Id | null
  luogo: string
  video: string
  descrizione: string
  note: string
  etichette: Id[]
  promemoria: Id[]
  privacy: string
  mostraCome: string
  calendarioId: Id | null
  ripetizione: Ripetizione | null
}

/** Per un evento di una serie: a quali occorrenze si applica la modifica. */
export type Ambito = 'self_only' | 'future_events' | 'all_events'

const CODICE_GIORNO: Record<GiornoSettimana, string> = { mon: 'MON', tue: 'TUE', wed: 'WED', thu: 'THU', fri: 'FRI', sat: 'SAT', sun: 'SUN' }

/** Il giorno della settimana di una data, come in GIORNI_SETTIMANA. */
export function giornoDi(d: Date): GiornoSettimana {
  return GIORNI_SETTIMANA[(d.getDay() + 6) % 7]
}

/** Quale settimana del mese («1»..«4», «-1» = l'ultima), come la calcola Odoo. */
export function settimanaDelMese(d: Date): string {
  const n = Math.ceil(d.getDate() / 7)
  const ultima = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7).getMonth() !== d.getMonth()
  return n >= 5 || (n === 4 && ultima) ? '-1' : String(n)
}

function valoriRipetizione(r: Ripetizione | null, inizio: Date): Record<string, unknown> {
  if (!r) {
    return { recurrency: false }
  }
  const v: Record<string, unknown> = {
    recurrency: true,
    // «custom» fa usare a Odoo rrule_type e interval cosi' come sono.
    rrule_type_ui: 'custom',
    rrule_type: r.tipo,
    interval: Math.max(1, r.ogni),
    end_type: r.fine,
    count: r.fine === 'count' ? Math.max(1, r.volte) : 1,
    until: r.fine === 'end_date' && r.finoAl ? r.finoAl : false,
  }
  const giorni = r.tipo === 'weekly' ? (r.giorni.length ? r.giorni : [giornoDi(inizio)]) : []
  for (const g of GIORNI_SETTIMANA) {
    v[g] = giorni.includes(g)
  }
  if (r.tipo === 'monthly') {
    v.month_by = r.mesePer
    if (r.mesePer === 'date') {
      v.day = inizio.getDate()
    } else {
      v.byday = settimanaDelMese(inizio)
      v.weekday = CODICE_GIORNO[giornoDi(inizio)]
    }
  }
  return v
}

/**
 * Crea (id null) o modifica un appuntamento. `prima` e' la scheda letta prima
 * della modifica: si scrivono solo i campi cambiati (descrizione e note sono
 * HTML in Odoo: riscritte solo se toccate, per non perdere la formattazione).
 */
export async function salvaEvento(
  server: string,
  uid: number,
  id: Id | null,
  m: Modulo,
  prima: Scheda | null,
  ambito?: Ambito,
): Promise<Id> {
  const campi = await campiEvento(server)
  const v: Record<string, unknown> = {
    name: m.titolo.trim(),
    allday: m.tuttoIlGiorno,
    partner_ids: [[6, 0, m.invitati.map((p) => p.id)]],
    location: m.luogo.trim() || false,
  }
  if (m.tuttoIlGiorno) {
    const dal = giornoChiave(m.inizio)
    const al = giornoChiave(m.fine < m.inizio ? m.inizio : m.fine)
    Object.assign(v, { start_date: dal, stop_date: al, start: `${dal} 08:00:00`, stop: `${al} 18:00:00` })
  } else {
    Object.assign(v, { start: utc(m.inizio), stop: utc(m.fine > m.inizio ? m.fine : new Date(m.inizio.getTime() + 3_600_000)) })
  }
  if (m.organizzatoreId) {
    v.user_id = m.organizzatoreId
  }
  if ('videocall_location' in campi) {
    v.videocall_location = m.video.trim() || false
  }
  if (!prima || m.descrizione.trim() !== prima.descrizione.trim()) {
    v.description = m.descrizione.trim() ? htmlDaTesto(m.descrizione) : false
  }
  if ('notes' in campi && (!prima || m.note.trim() !== prima.note.trim())) {
    v.notes = m.note.trim() ? htmlDaTesto(m.note) : false
  }
  if ('categ_ids' in campi) {
    v.categ_ids = [[6, 0, m.etichette]]
  }
  if ('alarm_ids' in campi) {
    v.alarm_ids = [[6, 0, m.promemoria]]
  }
  if ('privacy' in campi && (m.privacy || !campi.privacy.required)) {
    v.privacy = m.privacy || false
  }
  if ('show_as' in campi && m.mostraCome) {
    v.show_as = m.mostraCome
  }
  if ('calendar_id' in campi && m.calendarioId) {
    v.calendar_id = m.calendarioId
  }
  if ('recurrency' in campi) {
    // Una serie che resta serie: si riscrive la regola solo se cambiata.
    const cambiata = JSON.stringify(m.ripetizione) !== JSON.stringify(prima?.ripetizione ?? null)
    if (!prima || cambiata) {
      Object.assign(v, valoriRipetizione(m.ripetizione, m.inizio))
    }
  }
  if (id === null) {
    // Nuovo: l'organizzatore e' anche invitato (come in Odoo).
    const io = await mioPartner(server, uid)
    if (!m.invitati.some((p) => p.id === io)) {
      v.partner_ids = [[6, 0, [io, ...m.invitati.map((p) => p.id)]]]
    }
    return callKw<Id>(server, 'calendar.event', 'create', [v])
  }
  if (prima?.inSerie && ambito) {
    v.recurrence_update = ambito
  }
  await callKw<boolean>(server, 'calendar.event', 'write', [[id], v])
  return id
}

export async function eliminaEvento(server: string, id: Id, ambito?: Ambito): Promise<void> {
  if (ambito && ambito !== 'self_only') {
    await callKw(server, 'calendar.event', 'action_mass_deletion', [[id], ambito])
    return
  }
  await callKw<boolean>(server, 'calendar.event', 'unlink', [[id]])
}

const CHIAVI_STATO: Record<Stato, string> = {
  accepted: 'calendario.statoAccettato',
  declined: 'calendario.statoRifiutato',
  tentative: 'calendario.statoForse',
  needsAction: 'calendario.statoInAttesa',
}

/** «Accettato», «Rifiutato», «Forse», «In attesa» nella lingua dell'app. */
export function etichettaStato(stato: Stato): string {
  return t(CHIAVI_STATO[stato])
}

const CHIAVI_TIPO: Record<TipoRipetizione, string> = {
  daily: 'calendario.ripGiorno',
  weekly: 'calendario.ripSettimana',
  monthly: 'calendario.ripMese',
  yearly: 'calendario.ripAnno',
}

/** «lunedì e mercoledì», «Monday, Wednesday, and Friday». */
function elenco(voci: string[]): string {
  if (voci.length < 2) {
    return voci[0] || ''
  }
  const chiave = voci.length > 2 ? 'calendario.elencoPiu' : 'calendario.elencoDue'
  return t(chiave, { elenco: voci.slice(0, -1).join(', '), ultimo: voci[voci.length - 1] })
}

/** «Ogni settimana il lunedì e mercoledì, 10 volte» */
export function descriviRipetizione(r: Ripetizione, inizio: Date): string {
  let x = tn(CHIAVI_TIPO[r.tipo], r.ogni)
  if (r.tipo === 'weekly') {
    const giorni = (r.giorni.length ? r.giorni : [giornoDi(inizio)]).map(nomeGiorno)
    x += t('calendario.ripNeiGiorni', { giorni: elenco(giorni) })
  } else if (r.tipo === 'monthly') {
    const settimana = settimanaDelMese(inizio)
    x +=
      r.mesePer === 'date'
        ? t('calendario.ripGiornoDelMese', { n: inizio.getDate() })
        : t('calendario.ripOrdinaleGiorno', { frase: fraseOrdinale(settimana, giornoDi(inizio)) })
  }
  if (r.fine === 'count') {
    x += tn('calendario.ripVolte', r.volte)
  } else if (r.fine === 'end_date' && r.finoAl) {
    const data = new Date(`${r.finoAl}T12:00:00`).toLocaleDateString(loc(), { day: 'numeric', month: 'long', year: 'numeric' })
    x += t('calendario.ripFinoAl', { data })
  }
  return x
}

/** Il nome del giorno nella lingua dell'app («lunedì», «Monday»). */
export function nomeGiorno(g: GiornoSettimana): string {
  // Lunedi' 1 gennaio 2024: un lunedi' noto, poi i giorni dopo.
  return new Date(2024, 0, 1 + GIORNI_SETTIMANA.indexOf(g)).toLocaleDateString(loc(), { weekday: 'long' })
}

/**
 * «il primo lunedì», «la prima domenica», «l'ultimo mercoledì» / «the first
 * Monday»: in italiano articolo e ordinale seguono il genere del giorno.
 */
export function fraseOrdinale(settimana: string, g: GiornoSettimana): string {
  const giorno = nomeGiorno(g)
  if (lingua() === 'it') {
    const f = g === 'sun'
    const ord: Record<string, [string, string]> = {
      '1': ['primo', 'prima'],
      '2': ['secondo', 'seconda'],
      '3': ['terzo', 'terza'],
      '4': ['quarto', 'quarta'],
      '-1': ['ultimo', 'ultima'],
    }
    const articolo = settimana === '-1' ? "l'" : f ? 'la ' : 'il '
    return `${articolo}${ord[settimana][f ? 1 : 0]} ${giorno}`
  }
  return `the ${nomeOrdinale(settimana)} ${giorno}`
}

/** Quale settimana del mese, a parole: «1» → «primo», «-1» → «ultimo». */
export function nomeOrdinale(settimana: string): string {
  return t(settimana === '-1' ? 'calendario.ordinaleUltimo' : `calendario.ordinale${settimana}`)
}
