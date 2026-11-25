/**
 * CarPlay: componente senza finestra che la scena dell'auto avvia (anche con
 * l'app chiusa). Manda all'auto le chiamate recenti e i numeri piu' chiamati
 * (registro di Odoo: prima la copia sul telefono, poi quella aggiornata) e,
 * quando si tocca un nome sullo schermo dell'auto, avvia la chiamata: CallKit
 * la mostra sulla schermata di chiamata di CarPlay.
 */

import { useEffect } from 'react'
import { caricaLingua, loc, t, tn } from '../i18n'
import { leggi, scrivi } from '../odoo/archivio'
import { conTelefono, leggiSessione } from '../odoo/sessione'
import { segnalaErrore } from '../ui/crash'
import { registroChiamate, type VoceRegistro } from '../voip/api'
import { telefono } from '../voip/telefono'
import { aggiornaAuto, ascolta, type VoceAuto } from '../../modules/gestable-nativo'

const OGNI_MS = 60_000
const MASSIMO = 12

function quando(data: string): string {
  const d = new Date(data.replace(' ', 'T') + 'Z')
  const ora = d.toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === new Date().toDateString()) {
    return ora
  }
  return `${d.toLocaleDateString(loc(), { day: '2-digit', month: '2-digit' })} ${ora}`
}

function nome(v: VoceRegistro): string {
  return v.partner_id ? v.partner_id[1] : v.caller_number || ''
}

function recenti(voci: VoceRegistro[]): VoceAuto[] {
  return voci
    .filter((v) => v.caller_number)
    .slice(0, MASSIMO)
    .map((v) => ({ titolo: nome(v), sottotitolo: quando(v.create_date), numero: v.caller_number || '', entrata: v.direction === 'inbound' }))
}

/** I numeri piu' chiamati o che chiamano di piu', dal registro. */
function frequenti(voci: VoceRegistro[]): VoceAuto[] {
  const conta = new Map<string, { voce: VoceRegistro; n: number }>()
  for (const v of voci) {
    if (!v.caller_number) {
      continue
    }
    const prima = conta.get(v.caller_number)
    if (prima) {
      prima.n += 1
    } else {
      conta.set(v.caller_number, { voce: v, n: 1 })
    }
  }
  return [...conta.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, MASSIMO)
    .map(({ voce, n }) => ({ titolo: nome(voce), sottotitolo: tn('auto.chiamate', n), numero: voce.caller_number || '', entrata: false }))
}

export function RadiceAuto() {
  useEffect(() => {
    let vivo = true
    let avviato = false

    async function aggiorna() {
      await caricaLingua()
      const testi = { recenti: t('auto.recenti'), frequenti: t('auto.frequenti'), vuoto: t('auto.vuoto'), accedi: t('auto.accedi') }
      const s = await leggiSessione()
      if (!vivo) {
        return
      }
      if (!s || !conTelefono(s)) {
        await aggiornaAuto({ accesso: false, recenti: [], frequenti: [], testi })
        return
      }
      // Con l'app chiusa il telefono non e' ancora collegato al centralino.
      if (!avviato) {
        avviato = true
        telefono.avvia(s).catch((e) => segnalaErrore(e, 'avvio telefono (CarPlay)'))
      }
      const manda = (voci: VoceRegistro[]) => aggiornaAuto({ accesso: true, recenti: recenti(voci), frequenti: frequenti(voci), testi })
      await manda(leggi<VoceRegistro[]>(s.server, s.utente.uid, 'recenti') || [])
      try {
        const voci = await registroChiamate(s.server, s.utente.uid)
        scrivi(s.server, s.utente.uid, 'recenti', voci)
        if (vivo) {
          await manda(voci)
        }
      } catch {
        // Senza rete restano quelle salvate.
      }
    }

    void aggiorna()
    const timer = setInterval(() => void aggiorna(), OGNI_MS)
    const via1 = ascolta('onSceltaAuto', ({ numero }) => {
      telefono.chiama(numero).catch((e) => segnalaErrore(e, 'chiamata da CarPlay'))
    })
    const via2 = ascolta('onConnessioneAuto', ({ collegata }) => {
      if (collegata) {
        void aggiorna()
      }
    })
    return () => {
      vivo = false
      clearInterval(timer)
      via1()
      via2()
    }
  }, [])

  return null
}
