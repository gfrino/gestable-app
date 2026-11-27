/**
 * Le attivita' pianificate di un record qualsiasi di Odoo (la parte
 * «Attivita'» del chatter): elenco, fatta, pianifica nuova. Valgono per ogni
 * modello con le attivita' (contatti, ticket, preventivi...), uguali dalla 17
 * alla 20. Pianificare passa da `activity_schedule` del record, come il
 * pulsante «Pianifica attivita'» del browser.
 */

import { callKw } from './client'
import { completaAttivita } from './lavoro'
import { testoDaHtml } from './testo'

type Id = number
type M2o = [number, string] | false

export type StatoAttivita = 'overdue' | 'today' | 'planned'

export type AttivitaRecord = {
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

export async function attivitaDi(server: string, modello: string, id: Id): Promise<AttivitaRecord[]> {
  const r = await callKw<
    { id: Id; activity_type_id: M2o; summary: string | false; note: string | false; date_deadline: string; state: string; user_id: M2o; icon: string | false; activity_category?: string | false }[]
  >(server, 'mail.activity', 'search_read', [], {
    domain: [['res_model', '=', modello], ['res_id', '=', id]],
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

/** I tipi di attivita' validi per il modello (quelli senza modello valgono per tutti). */
export async function tipiAttivitaDi(server: string, modello: string): Promise<TipoAttivita[]> {
  const r = await callKw<{ id: Id; name: string; category: string | false; icon: string | false; delay_count: number; delay_unit: string }[]>(
    server,
    'mail.activity.type',
    'search_read',
    [],
    { domain: ['|', ['res_model', '=', false], ['res_model', '=', modello]], fields: ['name', 'category', 'icon', 'delay_count', 'delay_unit'], order: 'sequence, id' },
  )
  return r.map((x) => ({
    id: x.id,
    nome: x.name,
    categoria: x.category || '',
    icona: x.icon || '',
    giorni: x.delay_unit === 'weeks' ? x.delay_count * 7 : x.delay_unit === 'months' ? x.delay_count * 30 : x.delay_count || 0,
  }))
}

export async function pianificaAttivita(server: string, modello: string, id: Id, a: { tipoId: Id; data: string; riassunto: string; persona: Id }): Promise<void> {
  await callKw(server, modello, 'activity_schedule', [[id]], {
    activity_type_id: a.tipoId,
    date_deadline: a.data,
    summary: a.riassunto.trim(),
    user_id: a.persona,
  })
}

export function attivitaFatta(server: string, attivitaId: Id): Promise<void> {
  return completaAttivita(server, attivitaId)
}
