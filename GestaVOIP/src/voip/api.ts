/**
 * Le route del modulo VOIP AI che usa anche il softphone dentro Odoo.
 *
 * Sono le stesse: un telefono e' un softphone come il browser, con la sola
 * differenza che dice `platform` e `push`, cosi' il centralino sa che puo'
 * svegliarlo anche con l'app chiusa.
 */

import { Platform } from 'react-native'
import { t } from '../i18n'
import { callKw, ErroreOdoo, rpc } from '../odoo/client'
import type { Qualita } from './telefono'

export const PIATTAFORMA = Platform.OS === 'ios' ? 'ios' : 'android'

type Esito = { status: 'success' | 'error'; message?: string }

function controlla<T extends Esito>(r: T): T {
  if (r.status !== 'success') {
    throw new ErroreOdoo('server', r.message || t('telefono.operazioneNonRiuscita'))
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
  dati: { call_sid?: string; log_id?: string | null; duration: number; quality?: Qualita | null },
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

/** Chi c'e' dall'altra parte della chiamata, letto dai contatti di Odoo. */
export type SchedaContatto = {
  nome: string
  azienda: string
  /** Immagine come data URI, o '' se il contatto (e la sua azienda) non ne hanno. */
  foto: string
}

type RigaPartner = { id: number; name: string; parent_id: [number, string] | false; image_512: string | false }

const schede = new Map<string, Promise<SchedaContatto | null>>()

// Odoo da' agli utenti senza foto un disegno SVG generato: per l'app non e'
// una foto (e React Native non lo disegna). Si usano solo PNG, JPEG e WebP.
function datiFoto(b64: string | false): string {
  if (!b64) {
    return ''
  }
  const tipo = b64.startsWith('/9j/') ? 'jpeg' : b64.startsWith('iVBOR') ? 'png' : b64.startsWith('UklGR') ? 'webp' : ''
  return tipo ? `data:image/${tipo};base64,${b64}` : ''
}

/**
 * Contatto di Odoo con questo numero: nome, azienda e foto (quella della
 * persona, altrimenti quella dell'azienda). Cerca con `phone_mobile_search`,
 * che confronta i numeri normalizzati: «+41 76 571 49 82» salvato in Odoo
 * corrisponde a «+41765714982» del centralino. Una sola richiesta per numero
 * finche' l'app resta aperta; senza risultato o in caso di errore, null.
 */
export function schedaContatto(server: string, numero: string): Promise<SchedaContatto | null> {
  const cifre = numero.replace(/\D/g, '')
  if (cifre.length < 6) {
    return Promise.resolve(null)
  }
  const chiave = `${server}|${cifre}`
  let scheda = schede.get(chiave)
  if (!scheda) {
    scheda = (async () => {
      // 512 pixel: la foto si vede grande, la 128 sarebbe sgranata.
      const campi = ['name', 'parent_id', 'image_512']
      const [p] = await callKw<RigaPartner[]>(server, 'res.partner', 'search_read', [], {
        domain: [['phone_mobile_search', '=', numero]],
        fields: campi,
        limit: 1,
        order: 'is_company asc, id desc',
      })
      if (!p) {
        return null
      }
      let foto = datiFoto(p.image_512)
      if (!foto && p.parent_id) {
        const [azienda] = await callKw<RigaPartner[]>(server, 'res.partner', 'read', [[p.parent_id[0]], ['image_512']])
        foto = datiFoto(azienda?.image_512 || false)
      }
      return { nome: p.name, azienda: p.parent_id ? p.parent_id[1] : '', foto }
    })().catch(() => {
      schede.delete(chiave)
      return null
    })
    schede.set(chiave, scheda)
  }
  return scheda
}
