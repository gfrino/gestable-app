/**
 * Logo dell'azienda cliente, mostrato nel menu laterale sopra «Esci».
 *
 * Lo serve GestaClient su ticinoweb.online (tw_app_allowlist,
 * /tw_app/logo?origin=...): PNG o JPEG, al massimo 512 px, 404 se il server
 * non e' autorizzato o non ha un logo. Proporzioni ed esito si salvano sul
 * telefono (archivio): il menu si apre subito con il logo giusto, senza
 * sfarfallare, e senza rete resta l'ultimo noto.
 */

import { Image } from 'react-native'
import { leggi, scrivi } from './archivio'
import { origineDi } from './autorizzati'

const NOME = 'logo-cliente'

/** `rapporto` = larghezza / altezza; null = nessun logo per questo server. */
export type LogoCliente = { url: string; rapporto: number } | null

export function urlLogo(server: string): string {
  return `https://ticinoweb.online/tw_app/logo?origin=${encodeURIComponent(origineDi(server) || server)}`
}

/** L'ultimo esito salvato: undefined se non si e' mai controllato. */
export function logoSalvato(server: string): LogoCliente | undefined {
  const r = leggi<{ rapporto: number | null }>(server, 0, NOME)
  if (!r) {
    return undefined
  }
  return r.rapporto ? { url: urlLogo(server), rapporto: r.rapporto } : null
}

function misura(url: string): Promise<number> {
  return new Promise((risolvi, rifiuta) =>
    Image.getSize(
      url,
      (w, h) => (w > 0 && h > 0 ? risolvi(w / h) : rifiuta(new Error('logo vuoto'))),
      rifiuta,
    ),
  )
}

/**
 * Chiede di nuovo il logo. Torna undefined se non si e' potuto sapere (rete
 * assente, ticinoweb.online giu'): in quel caso si tiene quello salvato.
 */
export async function controllaLogo(server: string): Promise<LogoCliente | undefined> {
  const url = urlLogo(server)
  let stato = 0
  try {
    stato = (await fetch(url, { method: 'HEAD' })).status
  } catch {
    return undefined
  }
  if (stato === 404) {
    scrivi(server, 0, NOME, { rapporto: null })
    return null
  }
  if (stato !== 200 && stato !== 304) {
    return undefined
  }
  try {
    const rapporto = await misura(url)
    scrivi(server, 0, NOME, { rapporto })
    return { url, rapporto }
  } catch {
    return undefined
  }
}
