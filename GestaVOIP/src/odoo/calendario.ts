/**
 * Il calendario di Odoo (calendar.event): i miei appuntamenti, il dettaglio con
 * i partecipanti, la risposta a un invito, un appuntamento nuovo. Campi e
 * metodi uguali in Odoo 17 e 19.
 *
 * Odoo salva start/stop in UTC («2026-11-25 08:00:00»); gli appuntamenti di
 * tutto il giorno hanno anche start_date/stop_date, date senza ora.
 */

import { callKw } from './client'
import { mioPartner } from './lavoro'
import { dataOdoo, htmlDaTesto } from './testo'

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

export type Partecipante = { id: Id; partnerId: Id; nome: string; stato: 'accepted' | 'declined' | 'tentative' | 'needsAction'; io: boolean }

export type DettaglioEvento = Evento & {
  descrizione: string
  persone: Partecipante[]
  modello: string
  recordId: Id
}

/** Data locale «AAAA-MM-GG». */
export function giornoChiave(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** «mercoledì 25 novembre» → «Mercoledì 25 novembre» (solo la prima lettera). */
export function giornoEsteso(d: Date): string {
  const t = d.toLocaleDateString('it-CH', { weekday: 'long', day: 'numeric', month: 'long' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** Un istante in UTC nel formato di Odoo. */
function utc(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19)
}

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
    titolo: r.name || '(senza titolo)',
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

export async function dettaglioEvento(server: string, uid: number, id: Id): Promise<DettaglioEvento | null> {
  const io = await mioPartner(server, uid)
  const [r] = await callKw<(Riga & { description: string | false; attendee_ids: Id[]; res_model: string | false; res_id: Id })[]>(
    server,
    'calendar.event',
    'read',
    [[id], [...CAMPI, 'description', 'attendee_ids', 'res_model', 'res_id']],
  )
  if (!r) {
    return null
  }
  const persone = r.attendee_ids.length
    ? await callKw<{ id: Id; partner_id: M2o; common_name: string | false; state: Partecipante['stato'] }[]>(
        server,
        'calendar.attendee',
        'read',
        [r.attendee_ids, ['partner_id', 'common_name', 'state']],
      )
    : []
  return {
    ...daRiga(r),
    descrizione: r.description || '',
    modello: r.res_model || '',
    recordId: r.res_id || 0,
    persone: persone
      .map((p) => ({
        id: p.id,
        partnerId: p.partner_id ? p.partner_id[0] : 0,
        nome: p.common_name || (p.partner_id ? p.partner_id[1] : ''),
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

export type NuovoEvento = {
  titolo: string
  inizio: Date
  minuti: number
  tuttoIlGiorno: boolean
  luogo: string
  nota: string
}

export async function creaEvento(server: string, uid: number, e: NuovoEvento): Promise<Id> {
  const io = await mioPartner(server, uid)
  const giorno = giornoChiave(e.inizio)
  const valori: Record<string, unknown> = {
    name: e.titolo.trim(),
    partner_ids: [[6, 0, [io]]],
    location: e.luogo.trim() || false,
    description: e.nota.trim() ? htmlDaTesto(e.nota) : false,
  }
  if (e.tuttoIlGiorno) {
    Object.assign(valori, {
      allday: true,
      start_date: giorno,
      stop_date: giorno,
      start: `${giorno} 08:00:00`,
      stop: `${giorno} 18:00:00`,
    })
  } else {
    Object.assign(valori, {
      allday: false,
      start: utc(e.inizio),
      stop: utc(new Date(e.inizio.getTime() + e.minuti * 60_000)),
    })
  }
  return callKw<Id>(server, 'calendar.event', 'create', [valori])
}

export const ETICHETTE_STATO: Record<Partecipante['stato'], string> = {
  accepted: 'Accettato',
  declined: 'Rifiutato',
  tentative: 'Forse',
  needsAction: 'In attesa',
}
