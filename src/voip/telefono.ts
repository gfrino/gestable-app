/**
 * Il telefono: registrazione, chiamate, e soprattutto cosa fare quando le
 * cose vanno storte.
 *
 * La differenza fra un softphone che funziona e uno di cui non ti fidi non sta
 * nelle chiamate riuscite: sta in cosa succede quando la rete cade, quando il
 * token scade, e quando il telefono si risveglia dopo una notte in tasca.
 * Quei tre casi sono gestiti qui esplicitamente.
 */

import { AppState, type AppStateStatus } from 'react-native'
import { Voice, type Call, type CallInvite } from '@twilio/voice-react-native-sdk'
import { chiediTokenInsistendo } from './token'

// Si rinnova prima della scadenza, non alla scadenza: fra i due momenti c'e'
// il tempo per accorgersi che il rinnovo e' fallito e riprovare.
const ANTICIPO_RINNOVO_MS = 5 * 60 * 1000

export type Stato =
  | { tipo: 'spento' }
  | { tipo: 'registrazione' }
  | { tipo: 'registrato' }
  | { tipo: 'guasto'; motivo: string }

type Ascoltatore = (stato: Stato) => void

export class Telefono {
  private voice = new Voice()
  private odooUrl: string
  private stato: Stato = { tipo: 'spento' }
  private ascoltatori = new Set<Ascoltatore>()
  private rinnovo: ReturnType<typeof setTimeout> | null = null
  private inChiamata = false

  constructor(odooUrl: string) {
    this.odooUrl = odooUrl
  }

  osserva(fn: Ascoltatore): () => void {
    this.ascoltatori.add(fn)
    fn(this.stato)
    return () => this.ascoltatori.delete(fn)
  }

  private annuncia(stato: Stato) {
    this.stato = stato
    this.ascoltatori.forEach((fn) => fn(stato))
  }

  /** Accende il telefono e lo tiene acceso. */
  async avvia() {
    this.annuncia({ tipo: 'registrazione' })

    this.voice.on(Voice.Event.CallInvite, (invito: CallInvite) => {
      // Non serve suonare o mostrare niente: su iOS ci pensa CallKit e su
      // Android il servizio dell'SDK. Reinventarli darebbe due schermate di
      // chiamata sovrapposte.
      this.inChiamata = true
    })

    this.voice.on(Voice.Event.Registered, () => this.annuncia({ tipo: 'registrato' }))

    this.voice.on(Voice.Event.Error, (errore: any) => {
      const motivo = errore?.message || 'errore sconosciuto'
      this.annuncia({ tipo: 'guasto', motivo })
      // Un errore di registrazione non e' definitivo: quasi sempre e' la rete
      // o un token scaduto, e in entrambi i casi si risolve riprovando.
      void this.riregistra('errore: ' + motivo)
    })

    // Il caso piu' comune di tutti, e quello che quasi nessuno gestisce: il
    // telefono e' stato in tasca tutta la notte, il timer di rinnovo non e'
    // scattato perche' il sistema l'ha sospeso, e al risveglio la
    // registrazione e' morta da ore.
    AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') {
        void this.verificaAlRisveglio()
      }
    })

    await this.riregistra('avvio')
  }

  private async riregistra(motivo: string) {
    if (this.rinnovo) {
      clearTimeout(this.rinnovo)
      this.rinnovo = null
    }

    const esito = await chiediTokenInsistendo(this.odooUrl, (m, tentativo) => {
      this.annuncia({ tipo: 'guasto', motivo: `${m} (tentativo ${tentativo + 1})` })
    })

    if (!esito.ok) {
      // Sessione scaduta: qui insistere non serve, serve che l'operatore
      // rientri. E' l'unico caso in cui ci si ferma davvero.
      this.annuncia({ tipo: 'guasto', motivo: esito.motivo })
      return
    }

    await this.voice.register(esito.token)
    this.annuncia({ tipo: 'registrato' })

    const fra = Math.max(30_000, esito.scadeFra - ANTICIPO_RINNOVO_MS)
    this.rinnovo = setTimeout(() => void this.riregistra('rinnovo programmato'), fra)
  }

  /**
   * Al risveglio si verifica, non si da' per scontato.
   *
   * Ri-registrare e' un'operazione a vuoto se era gia' tutto a posto, e
   * ripristina il telefono se non lo era: nel dubbio conviene sempre.
   */
  private async verificaAlRisveglio() {
    if (this.inChiamata) {
      return
    }
    await this.riregistra('risveglio')
  }

  async chiama(numero: string): Promise<Call | null> {
    const esito = await chiediTokenInsistendo(this.odooUrl)
    if (!esito.ok) {
      this.annuncia({ tipo: 'guasto', motivo: esito.motivo })
      return null
    }
    this.inChiamata = true
    const chiamata = await this.voice.connect(esito.token, { params: { To: numero } })
    chiamata.on('disconnected', () => { this.inChiamata = false })
    return chiamata
  }

  async spegni() {
    if (this.rinnovo) {
      clearTimeout(this.rinnovo)
      this.rinnovo = null
    }
    this.annuncia({ tipo: 'spento' })
  }
}
