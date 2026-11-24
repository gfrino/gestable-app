/**
 * Le route del modulo VOIP AI che usa anche il softphone dentro Odoo.
 *
 * Sono le stesse: un telefono e' un softphone come il browser, con la sola
 * differenza che dice `platform` e `push`, cosi' il centralino sa che puo'
 * svegliarlo anche con l'app chiusa.
 */

import { Platform } from 'react-native'
import { callKw, ErroreOdoo, rpc } from '../odoo/client'

export const PIATTAFORMA = Platform.OS === 'ios' ? 'ios' : 'android'

type Esito = { status: 'success' | 'error'; message?: string }

function controlla<T extends Esito>(r: T): T {
  if (r.status !== 'success') {
    throw new ErroreOdoo('server', r.message || 'Operazione non riuscita.')
  }
  return r
}

export type Token = { token: string; identity: string; ttl: number; ring_timeout: number; push: boolean; mode: string }

export async function chiediToken(server: string, dispositivo: string): Promise<Token> {
  return controlla(
    await rpc<Esito & Token>(server, '/ai_telemarketing/voice/token', {
      device_id: dispositivo,
      platform: PIATTAFORMA,
    }),
  )
}

export async function disponibilita(
  server: string,
  dispositivo: string,
  disponibile: boolean,
  etichetta: string,
): Promise<void> {
  controlla(
    await rpc<Esito>(server, '/ai_telemarketing/voice/availability', {
      available: disponibile,
      device_id: dispositivo,
      device_label: etichetta,
      platform: PIATTAFORMA,
      push: true,
    }),
  )
}

export async function battito(server: string, dispositivo: string, etichetta: string): Promise<void> {
  await rpc<Esito>(server, '/ai_telemarketing/voice/heartbeat', {
    device_id: dispositivo,
    device_label: etichetta,
    platform: PIATTAFORMA,
    push: true,
  })
}

export async function risposto(server: string, logId: string): Promise<void> {
  await rpc<Esito>(server, '/ai_telemarketing/voice/answered', { log_id: logId })
}

export async function chiamataFinita(
  server: string,
  dati: { call_sid?: string; log_id?: string | null; duration: number },
): Promise<void> {
  await rpc<Esito>(server, '/ai_telemarketing/voice/call_ended', { ...dati, recorded: false })
}

export type Contatto = {
  key: string
  id: number
  model: 'res.partner' | 'crm.lead'
  name: string
  subtitle: string
  number: string
  label: string
}

export async function cercaContatti(server: string, testo: string): Promise<Contatto[]> {
  const r = controlla(
    await rpc<Esito & { results: Contatto[] }>(server, '/ai_telemarketing/voice/search_contacts', {
      query: testo,
      limit: 12,
    }),
  )
  return r.results || []
}

export type Collega = { id: number; name: string; extension: string; available: boolean }

export async function colleghi(server: string): Promise<Collega[]> {
  const r = controlla(await rpc<Esito & { agents: Collega[] }>(server, '/ai_telemarketing/voice/agents'))
  return r.agents || []
}

export async function trasferisci(
  server: string,
  collega: number,
  dati: { log_id?: string | null; call_sid?: string },
): Promise<string> {
  const r = controlla(
    await rpc<Esito & { target: string }>(server, '/ai_telemarketing/voice/transfer', {
      user_id: collega,
      ...dati,
    }),
  )
  return r.target
}

export type Preferenze = {
  record_calls: boolean
  inbound_ring: boolean
  extension: string
  direct_number: string
}

export async function preferenze(
  server: string,
  modifiche: Partial<Pick<Preferenze, 'inbound_ring' | 'record_calls'>> = {},
): Promise<Preferenze> {
  return controlla(await rpc<Esito & Preferenze>(server, '/ai_telemarketing/voice/preferences', modifiche))
}

export type VoceRegistro = {
  id: number
  create_date: string
  direction: 'inbound' | 'outbound'
  caller_number: string | false
  partner_id: [number, string] | false
  duration: number
  status: string
  handled_by: 'ai' | 'human'
}

/** Le chiamate di questo operatore, le piu' recenti prima. */
export async function registroChiamate(server: string, uid: number): Promise<VoceRegistro[]> {
  return callKw<VoceRegistro[]>(server, 'ai.telemarketing.call.log', 'search_read', [
    [['agent_user_id', '=', uid]],
  ], {
    fields: ['create_date', 'direction', 'caller_number', 'partner_id', 'duration', 'status', 'handled_by'],
    order: 'id desc',
    limit: 80,
  })
}
