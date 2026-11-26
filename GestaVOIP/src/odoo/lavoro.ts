/**
 * Quello che in Odoo sta nella barra in alto: presenze, chat e posta in arrivo,
 * attivita'. Tutto con le route e i metodi che esistono sia in Odoo 17 sia in
 * Odoo 19; dove cambiano (segnare letta una chat) si prova la nuova e poi la
 * vecchia.
 */

import { t } from '../i18n'
import { callKw, ErroreOdoo, rpc } from './client'
import { dataOdoo } from './testo'

type Id = number
type M2o = [number, string] | false

// ---------------------------------------------------------------------------
// Chi sono
// ---------------------------------------------------------------------------

const partnerDi = new Map<string, Promise<Id>>()

export function mioPartner(server: string, uid: number): Promise<Id> {
  const chiave = `${server}|${uid}`
  let p = partnerDi.get(chiave)
  if (!p) {
    p = callKw<{ partner_id: M2o }[]>(server, 'res.users', 'read', [[uid], ['partner_id']]).then((r) =>
      r[0]?.partner_id ? r[0].partner_id[0] : 0,
    )
    p.catch(() => partnerDi.delete(chiave))
    partnerDi.set(chiave, p)
  }
  return p
}

export function urlAvatar(server: string, modello: 'res.partner' | 'res.users', id: number): string {
  return `${server}/web/image/${modello}/${id}/avatar_128`
}

// ---------------------------------------------------------------------------
// Presenze (il pallino rosso/verde di Odoo)
// ---------------------------------------------------------------------------

export type Presenza = {
  dentro: boolean
  /** Ore lavorate oggi, decimali. */
  oreOggi: number
  entrata: Date | null
}

/** null se il server non ha le presenze, o l'utente non e' un dipendente. */
export async function presenza(server: string): Promise<Presenza | null> {
  try {
    const r = await rpc<{
      id?: number
      attendance_state?: string
      hours_today?: number
      last_check_in?: string | false
      display_systray?: boolean
    }>(server, '/hr_attendance/attendance_user_data')
    if (!r?.id || r.display_systray === false) {
      return null
    }
    return {
      dentro: r.attendance_state === 'checked_in',
      oreOggi: r.hours_today || 0,
      entrata: dataOdoo(r.last_check_in),
    }
  } catch {
    return null
  }
}

export async function cambiaPresenza(server: string): Promise<Presenza | null> {
  await rpc(server, '/hr_attendance/systray_check_in_out', { latitude: false, longitude: false })
  return presenza(server)
}

// ---------------------------------------------------------------------------
// Chat e canali
// ---------------------------------------------------------------------------

export type Conversazione = {
  id: Id
  tipo: string
  nome: string
  /** Per le chat a due: il partner dall'altra parte (per la foto). */
  partnerId: Id | null
  nonLetti: number
  /** Conta nel pallino e nel numero «Chat»: chat a due o di gruppo, non silenziata. */
  conta: boolean
  ultimo: { testo: string; autore: string; data: Date | null; mio: boolean } | null
}

type Membro = {
  channel_id: M2o
  partner_id: M2o
  message_unread_counter?: number
  mute_until_dt?: string | false
  custom_notifications?: string | false
}

/**
 * Come il contatore di Odoo 20: contano solo le chat a due e di gruppo, non
 * silenziate. I canali pubblici, WhatsApp, la chat del sito e simili si leggono
 * nella lista ma non accendono il pallino: non li legge quasi mai nessuno in Odoo.
 */
function contaPerPallino(tipo: string, m: Membro | undefined): boolean {
  if (tipo !== 'chat' && tipo !== 'group') {
    return false
  }
  if (m?.custom_notifications === 'no_notif') {
    return false
  }
  const muto = m?.mute_until_dt ? dataOdoo(m.mute_until_dt) : null
  return !muto || muto.getTime() < Date.now()
}
type Canale = { id: Id; name: string; channel_type: string }
type Messaggio = {
  id: Id
  res_id: Id
  body: string
  author_id: M2o
  date: string
  attachment_ids: Id[]
  message_type: string
}

/** I miei canali e chat: quelli fissati in Discuss, come li mostra Odoo. */
async function mieiCanali(server: string, io: Id): Promise<Membro[]> {
  const campi = ['channel_id', 'message_unread_counter', 'mute_until_dt', 'custom_notifications']
  try {
    return await callKw<Membro[]>(server, 'discuss.channel.member', 'search_read', [], {
      domain: [['partner_id', '=', io], ['is_pinned', '=', true]],
      fields: campi,
    })
  } catch (e) {
    if (e instanceof ErroreOdoo && e.tipo === 'sessione') {
      throw e
    }
    return callKw<Membro[]>(server, 'discuss.channel.member', 'search_read', [], {
      domain: [['partner_id', '=', io]],
      fields: campi,
    })
  }
}

export async function conversazioni(server: string, uid: number): Promise<Conversazione[]> {
  const io = await mioPartner(server, uid)
  const miei = await mieiCanali(server, io)
  const ids = miei.map((m) => (m.channel_id ? m.channel_id[0] : 0)).filter(Boolean)
  if (!ids.length) {
    return []
  }
  const [canali, altri, ultimi] = await Promise.all([
    callKw<Canale[]>(server, 'discuss.channel', 'read', [ids, ['name', 'channel_type']]),
    callKw<Membro[]>(server, 'discuss.channel.member', 'search_read', [], {
      domain: [['channel_id', 'in', ids], ['partner_id', '!=', io]],
      fields: ['channel_id', 'partner_id'],
    }),
    callKw<Messaggio[]>(server, 'mail.message', 'search_read', [], {
      domain: [['model', '=', 'discuss.channel'], ['res_id', 'in', ids], ['message_type', 'in', ['comment', 'email']]],
      fields: ['res_id', 'body', 'author_id', 'date'],
      order: 'id desc',
      limit: Math.min(400, ids.length * 8),
    }),
  ])
  // Il nome della persona senza l'azienda davanti («ticinoWEB, Rita Ispan» → «Rita Ispan»).
  const idPartner = [...new Set(altri.map((a) => (a.partner_id ? a.partner_id[0] : 0)).filter(Boolean))]
  const nomi = idPartner.length
    ? await callKw<{ id: Id; name: string }[]>(server, 'res.partner', 'read', [idPartner, ['name']]).catch(() => [])
    : []
  const nomeDi = new Map(nomi.map((n) => [n.id, n.name]))
  const membro = new Map(miei.map((m) => [m.channel_id ? m.channel_id[0] : 0, m]))
  const ultimo = new Map<Id, Messaggio>()
  for (const m of ultimi) {
    if (!ultimo.has(m.res_id)) {
      ultimo.set(m.res_id, m)
    }
  }

  return canali
    .map((c) => {
      const altro = c.channel_type === 'chat' ? altri.find((a) => a.channel_id && a.channel_id[0] === c.id) : undefined
      const u = ultimo.get(c.id)
      return {
        id: c.id,
        tipo: c.channel_type,
        nome: altro?.partner_id ? nomeDi.get(altro.partner_id[0]) || altro.partner_id[1] : c.name,
        partnerId: altro?.partner_id ? altro.partner_id[0] : null,
        nonLetti: membro.get(c.id)?.message_unread_counter || 0,
        conta: contaPerPallino(c.channel_type, membro.get(c.id)),
        ultimo: u
          ? {
              testo: u.body,
              autore: u.author_id ? u.author_id[1] : '',
              data: dataOdoo(u.date),
              mio: !!u.author_id && u.author_id[0] === io,
            }
          : null,
      }
    })
    .sort((a, b) => (b.ultimo?.data?.getTime() || 0) - (a.ultimo?.data?.getTime() || 0))
}

export type MessaggioChat = {
  id: Id
  testo: string
  autore: string
  autoreId: Id | null
  data: Date | null
  mio: boolean
  allegati: number
}

export async function messaggiChat(server: string, uid: number, canale: Id, limite = 60): Promise<MessaggioChat[]> {
  const io = await mioPartner(server, uid)
  const righe = await callKw<Messaggio[]>(server, 'mail.message', 'search_read', [], {
    domain: [['model', '=', 'discuss.channel'], ['res_id', '=', canale], ['message_type', '!=', 'notification']],
    fields: ['body', 'author_id', 'date', 'attachment_ids', 'message_type'],
    order: 'id desc',
    limit: limite,
  })
  return righe
    .map((m) => ({
      id: m.id,
      testo: m.body,
      autore: m.author_id ? m.author_id[1] : '',
      autoreId: m.author_id ? m.author_id[0] : null,
      data: dataOdoo(m.date),
      mio: !!m.author_id && m.author_id[0] === io,
      allegati: m.attachment_ids?.length || 0,
    }))
    .reverse()
}

export async function inviaChat(server: string, canale: Id, html: string): Promise<void> {
  await rpc(server, '/mail/message/post', {
    thread_model: 'discuss.channel',
    thread_id: canale,
    post_data: { body: html, message_type: 'comment', subtype_xmlid: 'mail.mt_comment' },
  })
}

/**
 * Fin dove gli altri hanno letto: le spunte dei miei messaggi, come WhatsApp.
 * `visto`: l'ultimo messaggio letto da tutti gli altri (due spunte verdi);
 * `ricevuto`: l'ultimo arrivato a tutti (due spunte grigie; Odoo 20 non lo
 * tiene piu', resta 0 e si passa da una spunta a due verdi). Solo chat a due e
 * di gruppo: nei canali aperti a tutta l'azienda non ha senso.
 */
export type Letture = { visto: Id; ricevuto: Id }

const campiMembroDi = new Map<string, Promise<Set<string>>>()

function campiMembro(server: string): Promise<Set<string>> {
  let p = campiMembroDi.get(server)
  if (!p) {
    p = callKw<Record<string, unknown>>(server, 'discuss.channel.member', 'fields_get', [], { attributes: ['type'] }).then(
      (f) => new Set(Object.keys(f)),
    )
    p.catch(() => campiMembroDi.delete(server))
    campiMembroDi.set(server, p)
  }
  return p
}

export async function letture(server: string, uid: number, canale: Id): Promise<Letture> {
  const io = await mioPartner(server, uid)
  const campi = await campiMembro(server)
  const conRicevuto = campi.has('fetched_message_id')
  const altri = await callKw<{ partner_id: M2o; seen_message_id: M2o; fetched_message_id?: M2o }[]>(
    server,
    'discuss.channel.member',
    'search_read',
    [],
    {
      domain: [['channel_id', '=', canale], ['partner_id', '!=', io], ['partner_id', '!=', false]],
      fields: ['partner_id', 'seen_message_id', ...(conRicevuto ? ['fetched_message_id'] : [])],
      limit: 50,
    },
  )
  if (!altri.length) {
    return { visto: 0, ricevuto: 0 }
  }
  const id = (v: M2o | undefined) => (v ? v[0] : 0)
  const visto = Math.min(...altri.map((a) => id(a.seen_message_id)))
  const ricevuto = conRicevuto ? Math.min(...altri.map((a) => Math.max(id(a.fetched_message_id), id(a.seen_message_id)))) : 0
  return { visto, ricevuto }
}

/**
 * Chi chiamare dalla chat a due: l'interno se la persona e' un collega con il
 * telefono dell'ufficio, altrimenti il suo numero (cellulare prima).
 */
export async function numeroDelPartner(server: string, partner: Id): Promise<{ utente: Id | null; numero: string }> {
  const [utenti, dati] = await Promise.all([
    callKw<{ id: Id }[]>(server, 'res.users', 'search_read', [], {
      domain: [['partner_id', '=', partner], ['share', '=', false]],
      fields: ['id'],
      limit: 1,
    }).catch(() => []),
    callKw<{ phone?: string | false; mobile?: string | false }[]>(server, 'res.partner', 'read', [[partner], ['phone', 'mobile']]).catch(() =>
      callKw<{ phone?: string | false; mobile?: string | false }[]>(server, 'res.partner', 'read', [[partner], ['phone']]).catch(() => []),
    ),
  ])
  const p = dati[0]
  return { utente: utenti[0]?.id || null, numero: (p?.mobile || p?.phone || '') as string }
}

/** Il partner dall'altra parte di una chat a due. */
export async function altroNellaChat(server: string, uid: number, canale: Id): Promise<Id | null> {
  const io = await mioPartner(server, uid)
  const r = await callKw<{ partner_id: M2o }[]>(server, 'discuss.channel.member', 'search_read', [], {
    domain: [['channel_id', '=', canale], ['partner_id', '!=', io], ['partner_id', '!=', false]],
    fields: ['partner_id'],
    limit: 1,
  })
  return r[0]?.partner_id ? r[0].partner_id[0] : null
}

/** Segna letta la chat fino al messaggio dato. Odoo 18+ e Odoo 17 hanno route diverse. */
export async function segnaLetta(server: string, canale: Id, ultimo: Id): Promise<void> {
  try {
    await rpc(server, '/discuss/channel/mark_as_read', { channel_id: canale, last_message_id: ultimo })
  } catch (e) {
    if (e instanceof ErroreOdoo && e.tipo === 'sessione') {
      throw e
    }
    await rpc(server, '/discuss/channel/set_last_seen_message', { channel_id: canale, last_message_id: ultimo }).catch(
      () => undefined,
    )
  }
}

// ---------------------------------------------------------------------------
// Posta in arrivo (notifiche e menzioni da segnare come lette)
// ---------------------------------------------------------------------------

export type Notifica = {
  id: Id
  titolo: string
  testo: string
  autore: string
  autoreId: Id | null
  data: Date | null
  modello: string
  recordId: Id
}

export async function postaInArrivo(server: string, limite = 80): Promise<Notifica[]> {
  const righe = await callKw<
    {
      id: Id
      subject: string | false
      body: string
      author_id: M2o
      date: string
      model: string | false
      res_id: Id
      record_name: string | false
    }[]
  >(server, 'mail.message', 'search_read', [], {
    domain: [['needaction', '=', true]],
    fields: ['subject', 'body', 'author_id', 'date', 'model', 'res_id', 'record_name'],
    order: 'id desc',
    limit: limite,
  })
  return righe.map((m) => ({
    id: m.id,
    titolo: m.record_name || m.subject || '',
    testo: m.body,
    autore: m.author_id ? m.author_id[1] : '',
    autoreId: m.author_id ? m.author_id[0] : null,
    data: dataOdoo(m.date),
    modello: m.model || '',
    recordId: m.res_id,
  }))
}

export async function quanteNotifiche(server: string): Promise<number> {
  return callKw<number>(server, 'mail.message', 'search_count', [[['needaction', '=', true]]])
}

export async function segnaNotificheLette(server: string, ids: Id[]): Promise<void> {
  if (ids.length) {
    await callKw(server, 'mail.message', 'set_message_done', [ids])
  }
}

// ---------------------------------------------------------------------------
// Attivita'
// ---------------------------------------------------------------------------

export type Attivita = {
  id: Id
  tipo: string
  riassunto: string
  nota: string
  scadenza: Date | null
  stato: 'overdue' | 'today' | 'planned'
  modello: string
  modelloNome: string
  recordId: Id
  recordNome: string
}

export async function attivita(server: string, uid: number): Promise<Attivita[]> {
  const righe = await callKw<
    {
      id: Id
      activity_type_id: M2o
      summary: string | false
      note: string | false
      date_deadline: string
      state: string
      res_model: string
      res_id: Id
      res_name: string | false
    }[]
  >(server, 'mail.activity', 'search_read', [], {
    domain: [['user_id', '=', uid]],
    fields: ['activity_type_id', 'summary', 'note', 'date_deadline', 'state', 'res_model', 'res_id', 'res_name'],
    order: 'date_deadline asc, id asc',
    limit: 300,
  })
  const modelli = [...new Set(righe.map((r) => r.res_model))]
  const nomi = modelli.length
    ? await callKw<{ model: string; name: string }[]>(server, 'ir.model', 'search_read', [], {
        domain: [['model', 'in', modelli]],
        fields: ['model', 'name'],
      }).catch(() => [])
    : []
  const nomeDi = new Map(nomi.map((n) => [n.model, n.name]))
  return righe.map((r) => ({
    id: r.id,
    tipo: r.activity_type_id ? r.activity_type_id[1] : t('lavoro.attivita.tipo'),
    riassunto: r.summary || '',
    nota: r.note || '',
    // La scadenza e' una data senza ora: mezzogiorno locale evita salti di giorno.
    scadenza: r.date_deadline ? new Date(`${r.date_deadline}T12:00:00`) : null,
    stato: r.state === 'overdue' ? 'overdue' : r.state === 'today' ? 'today' : 'planned',
    modello: r.res_model,
    modelloNome: nomeDi.get(r.res_model) || r.res_model,
    recordId: r.res_id,
    recordNome: r.res_name || '',
  }))
}

export async function completaAttivita(server: string, id: Id): Promise<void> {
  await callKw(server, 'mail.activity', 'action_feedback', [[id]], { feedback: false })
}

// ---------------------------------------------------------------------------
// Contatori per il menu (come i numeri sulle icone di Odoo)
// ---------------------------------------------------------------------------

export type Contatori = { messaggi: number; attivita: number }

export async function contatori(server: string, uid: number): Promise<Contatori> {
  const io = await mioPartner(server, uid)
  const oggi = new Date()
  const fineOggi = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}-${String(oggi.getDate()).padStart(2, '0')}`
  const [notifiche, miei, scadute] = await Promise.all([
    callKw<number>(server, 'mail.message', 'search_count', [[['needaction', '=', true]]]).catch(() => 0),
    // message_unread_counter e' calcolato, non si puo' filtrare: si somma qui.
    mieiCanali(server, io).catch(() => [] as Membro[]),
    callKw<number>(server, 'mail.activity', 'search_count', [[['user_id', '=', uid], ['date_deadline', '<=', fineOggi]]]).catch(
      () => 0,
    ),
  ])
  // Come Odoo 20: le notifiche, piu' una per ogni chat (a due o di gruppo) con qualcosa da leggere.
  const daLeggere = miei.filter((m) => (m.message_unread_counter || 0) > 0 && m.channel_id)
  const ids = daLeggere.map((m) => (m.channel_id ? m.channel_id[0] : 0))
  const tipi = ids.length
    ? await callKw<{ id: Id; channel_type: string }[]>(server, 'discuss.channel', 'read', [ids, ['channel_type']]).catch(() => [])
    : []
  const tipoDi = new Map(tipi.map((c) => [c.id, c.channel_type]))
  const chat = daLeggere.filter((m) => m.channel_id && contaPerPallino(tipoDi.get(m.channel_id[0]) || '', m)).length
  return {
    messaggi: notifiche + chat,
    attivita: scadute,
  }
}

/** Indirizzo di un record nell'Odoo web (vale su 17 e 19). */
export function percorsoRecord(modello: string, id: Id): string {
  return `/web#model=${encodeURIComponent(modello)}&id=${id}&view_type=form`
}
