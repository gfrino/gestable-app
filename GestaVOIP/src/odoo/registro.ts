/**
 * La conversazione sotto un record di Odoo (il «chatter»): messaggi, note
 * interne, cambi registrati da Odoo, allegati; scrivere una nota o un
 * messaggio, seguire il record. Uguale per ogni modello che ha il chatter
 * (ticket dell'Helpdesk, opportunita' del CRM...).
 */

import { File } from 'expo-file-system'
import { callKw } from './client'
import { mioPartner } from './lavoro'
import { dataOdoo, testoDaHtml } from './testo'

type Id = number
type M2o = [number, string] | false

export type Messaggio = {
  id: Id
  autore: string
  autoreId: Id | null
  data: Date | null
  testo: string
  nota: boolean
  email: boolean
  allegati: { id: Id; nome: string; tipo: string }[]
  /** Cambio di fase, assegnazione... scritto da Odoo. */
  tracciamento: string
}

type RigaMessaggio = {
  id: Id
  body: string
  author_id: M2o
  date: string
  message_type: string
  subtype_id: M2o
  is_internal?: boolean
  attachment_ids: Id[]
  tracking_value_ids?: Id[]
}

/**
 * I campi dei messaggi cambiano: Odoo 17 e 19 tengono i cambi (fase,
 * assegnazione...) in `tracking_value_ids` di un messaggio «notification»;
 * Odoo 20 non ha piu' quel campo e scrive il cambio nel testo di un
 * messaggio di tipo «tracking».
 */
type CampiMessaggio = { tracce: boolean; tipi: string[] }
const campiDi = new Map<string, Promise<CampiMessaggio>>()

function campiMessaggio(server: string): Promise<CampiMessaggio> {
  let p = campiDi.get(server)
  if (!p) {
    p = callKw<Record<string, { selection?: [string, string][] }>>(server, 'mail.message', 'fields_get', [['tracking_value_ids', 'message_type']], {
      attributes: ['selection'],
    }).then((f) => {
      const esistono = new Set((f.message_type?.selection || []).map(([v]) => v))
      return { tracce: 'tracking_value_ids' in f, tipi: ['comment', 'email', 'notification', 'tracking'].filter((x) => !esistono.size || esistono.has(x)) }
    })
    p.catch(() => campiDi.delete(server))
    campiDi.set(server, p)
  }
  return p
}

export async function conversazione(server: string, modello: string, id: Id): Promise<Messaggio[]> {
  const campi = await campiMessaggio(server)
  const righe = await callKw<RigaMessaggio[]>(server, 'mail.message', 'search_read', [], {
    domain: [['model', '=', modello], ['res_id', '=', id], ['message_type', 'in', campi.tipi]],
    fields: ['body', 'author_id', 'date', 'message_type', 'subtype_id', 'is_internal', 'attachment_ids', ...(campi.tracce ? ['tracking_value_ids'] : [])],
    order: 'id desc',
    limit: 80,
  })
  const idAllegati = [...new Set(righe.flatMap((r) => r.attachment_ids || []))]
  const idTracce = [...new Set(righe.flatMap((r) => r.tracking_value_ids || []))]
  // Nota interna = sottotipo «internal» (mail.mt_note): `is_internal` del messaggio resta false sulle note.
  const idSottotipi = [...new Set(righe.flatMap((r) => (r.subtype_id ? [r.subtype_id[0]] : [])))]
  const [allegati, tracce, sottotipi] = await Promise.all([
    idAllegati.length
      ? callKw<{ id: Id; name: string; mimetype: string | false }[]>(server, 'ir.attachment', 'read', [idAllegati, ['name', 'mimetype']]).catch(() => [])
      : Promise.resolve([]),
    idTracce.length
      ? callKw<{ id: Id; field_id?: M2o; old_value_char?: string | false; new_value_char?: string | false }[]>(
          server,
          'mail.tracking.value',
          'read',
          [idTracce, ['field_id', 'old_value_char', 'new_value_char']],
        ).catch(() => [])
      : Promise.resolve([]),
    idSottotipi.length
      ? callKw<{ id: Id; internal: boolean }[]>(server, 'mail.message.subtype', 'read', [idSottotipi, ['internal']]).catch(() => [])
      : Promise.resolve([]),
  ])
  const interni = new Set(sottotipi.filter((x) => x.internal).map((x) => x.id))
  const allegato = new Map(allegati.map((a) => [a.id, { id: a.id, nome: a.name, tipo: a.mimetype || '' }]))
  const traccia = new Map(tracce.map((x) => [x.id, x]))
  return righe
    .map((r) => {
      // Odoo 20: il cambio sta nel testo del messaggio «tracking» («Nuova → Proposta (Fase)»).
      const traccia20 = r.message_type === 'tracking'
      const testo = traccia20 ? '' : testoDaHtml(r.body)
      const cambi = (traccia20 ? [testoDaHtml(r.body).replace(/\bNone\b/g, '—')] : []).concat(
        (r.tracking_value_ids || [])
          .map((tid) => traccia.get(tid))
          .filter(Boolean)
          .map((x) => `${x?.field_id ? x.field_id[1] : ''}: ${x?.old_value_char || '—'} → ${x?.new_value_char || '—'}`.replace(/^: /, '')),
      )
      const nota = !!r.is_internal || (!!r.subtype_id && interni.has(r.subtype_id[0]))
      return {
        id: r.id,
        autore: r.author_id ? r.author_id[1] : '',
        autoreId: r.author_id ? r.author_id[0] : null,
        data: dataOdoo(r.date),
        testo,
        nota: r.message_type === 'comment' && nota,
        email: r.message_type === 'email',
        allegati: (r.attachment_ids || []).map((a) => allegato.get(a)).filter((a): a is NonNullable<typeof a> => !!a),
        tracciamento: cambi.join('\n'),
      }
    })
    .filter((m) => m.testo || m.allegati.length || m.tracciamento)
}

/**
 * Scrive nel record: `nota` interna (solo colleghi) o messaggio (va per email
 * ai follower, cliente compreso). Le foto (file://) diventano allegati.
 */
export async function scrivi(server: string, modello: string, id: Id, testo: string, nota: boolean, foto: string[] = []): Promise<void> {
  const allegati: Id[] = []
  if (foto.length) {
    const campo = await campoDati(server)
    for (const [i, uri] of foto.entries()) {
      const f = new File(uri)
      const dati = await f.base64()
      allegati.push(await callKw<Id>(server, 'ir.attachment', 'create', [{ name: `Foto ${i + 1}.jpg`, [campo]: dati, res_model: modello, res_id: id }]))
    }
  }
  // Testo semplice: message_post chiamato dall'esterno fa l'escape di ogni stringa
  // (Odoo 17-20), quindi un HTML preparato qui si vedrebbe con «&lt;br&gt;» e «&amp;amp;».
  await callKw(server, modello, 'message_post', [[id]], {
    body: testo.trim(),
    message_type: 'comment',
    subtype_xmlid: nota ? 'mail.mt_note' : 'mail.mt_comment',
    attachment_ids: allegati,
  })
}

/** Segue (o smette di seguire) il record: arrivano le notifiche dei messaggi nuovi. */
export async function segui(server: string, uid: number, modello: string, id: Id, si: boolean): Promise<void> {
  const io = await mioPartner(server, uid)
  await callKw(server, modello, si ? 'message_subscribe' : 'message_unsubscribe', [[id]], { partner_ids: [io] })
}

const campoDatiDi = new Map<string, Promise<'datas' | 'raw'>>()

/** Odoo 17-19 ricevono il file in `datas`, Odoo 20 in `raw`. */
function campoDati(server: string): Promise<'datas' | 'raw'> {
  let p = campoDatiDi.get(server)
  if (!p) {
    p = callKw<Record<string, unknown>>(server, 'ir.attachment', 'fields_get', [], { attributes: ['type'] }).then((f) => ('datas' in f ? 'datas' : 'raw'))
    p.catch(() => campoDatiDi.delete(server))
    campoDatiDi.set(server, p)
  }
  return p
}
