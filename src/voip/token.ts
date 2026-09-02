/**
 * Gli access token di Twilio.
 *
 * Un token scade — di norma dopo un'ora — e alla scadenza il dispositivo si
 * de-registra: le chiamate in arrivo smettono di arrivare e nessuno se ne
 * accorge. E' lo stesso guasto che il softphone dentro Odoo ha oggi.
 *
 * Qui il rinnovo e' automatico e il fallimento e' rumoroso, perche' un token
 * che non si rinnova in silenzio e' il modo piu' comune di perdere chiamate.
 */

import * as SecureStore from 'expo-secure-store'

const CHIAVE_SESSIONE = 'odoo.session'

/** Attese fra un tentativo e l'altro. Cresce, ma non si arrende mai. */
const ATTESE_MS = [2_000, 5_000, 15_000, 30_000, 60_000]

export type EsitoToken =
  | { ok: true; token: string; scadeFra: number }
  | { ok: false; motivo: string }

function attesa(tentativo: number): number {
  return ATTESE_MS[Math.min(tentativo, ATTESE_MS.length - 1)]
}

const dormi = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Chiede un token a Odoo.
 *
 * La sessione sta nel portachiavi del telefono, non in AsyncStorage: e' un
 * segreto, e AsyncStorage e' leggibile da chiunque abbia accesso al backup.
 */
export async function chiediToken(odooUrl: string): Promise<EsitoToken> {
  const sessione = await SecureStore.getItemAsync(CHIAVE_SESSIONE)
  if (!sessione) {
    return { ok: false, motivo: 'non autenticato' }
  }

  try {
    const risposta = await fetch(`${odooUrl}/ai_telemarketing_twilio/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session_id=${sessione}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', params: {} }),
    })

    if (risposta.status === 401 || risposta.status === 403) {
      // La sessione Odoo e' scaduta: ritentare non serve, serve rientrare.
      await SecureStore.deleteItemAsync(CHIAVE_SESSIONE)
      return { ok: false, motivo: 'sessione scaduta' }
    }
    if (!risposta.ok) {
      return { ok: false, motivo: `il server ha risposto ${risposta.status}` }
    }

    const corpo = await risposta.json()
    const token = corpo?.result?.token
    if (typeof token !== 'string' || token.length === 0) {
      return { ok: false, motivo: 'risposta senza token' }
    }

    // Il TTL lo dice il server. Se tace, un'ora e' il default di Twilio: meglio
    // rinnovare troppo presto che scoprire troppo tardi di essere scaduti.
    const ttl = Number(corpo?.result?.ttl) || 3600
    return { ok: true, token, scadeFra: ttl * 1000 }
  } catch (e: any) {
    return { ok: false, motivo: e?.message || 'rete non raggiungibile' }
  }
}

/**
 * Come sopra, ma insiste.
 *
 * Un errore di rete non deve lasciare il telefono spento: si riprova con
 * attese crescenti finche' non funziona, o finche' non e' la sessione a essere
 * scaduta — quello e' l'unico caso in cui insistere e' inutile.
 */
export async function chiediTokenInsistendo(
  odooUrl: string,
  suErrore?: (motivo: string, tentativo: number) => void
): Promise<EsitoToken> {
  for (let tentativo = 0; ; tentativo += 1) {
    const esito = await chiediToken(odooUrl)
    if (esito.ok || esito.motivo === 'sessione scaduta' || esito.motivo === 'non autenticato') {
      return esito
    }
    suErrore?.(esito.motivo, tentativo)
    await dormi(attesa(tentativo))
  }
}

export async function salvaSessione(sessionId: string) {
  await SecureStore.setItemAsync(CHIAVE_SESSIONE, sessionId)
}

export async function dimenticaSessione() {
  await SecureStore.deleteItemAsync(CHIAVE_SESSIONE)
}
