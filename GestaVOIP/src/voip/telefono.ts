/**
 * Il telefono: registrazione su Twilio, chiamate in entrata e in uscita, e
 * soprattutto cosa fare quando qualcosa va storto.
 *
 * La differenza fra un softphone che funziona e uno di cui ci si fida non sta
 * nelle chiamate riuscite: sta in cosa succede quando la rete cade, il token
 * scade o il telefono si risveglia dopo una notte in tasca. I tre casi sono
 * gestiti qui esplicitamente.
 *
 * Squillo e schermata della chiamata in arrivo NON sono rifatti qui: su iOS
 * li disegna CallKit, su Android il servizio dell'SDK Twilio. Rifarli darebbe
 * due schermate sovrapposte, ed e' il motivo per cui diversi softphone si
 * comportano male con il telefono bloccato.
 */

import * as Device from 'expo-device'
import { AppState, Platform, type NativeEventSubscription } from 'react-native'
import { AudioDevice, Call, CallInvite, Voice } from '@twilio/voice-react-native-sdk'
import { t } from '../i18n'
import { ErroreOdoo } from '../odoo/client'
import { idDispositivo, type Sessione } from '../odoo/sessione'
import * as api from './api'
import { segnalaErrore } from '../ui/crash'

// Si rinnova prima della scadenza: fra i due momenti c'e' il tempo per
// accorgersi che il rinnovo e' fallito e riprovare.
const ANTICIPO_RINNOVO_MS = 5 * 60 * 1000
// Attese fra un tentativo e l'altro: crescono, ma non ci si arrende mai.
const ATTESE_MS = [2_000, 5_000, 15_000, 30_000, 60_000]
const BATTITO_MS = 5 * 60 * 1000

export type Registrazione = 'spento' | 'collegamento' | 'pronto' | 'senza-push' | 'guasto'

export type Fase = 'composizione' | 'squillo' | 'in-arrivo' | 'connessa' | 'riconnessione' | 'finita'

export type Chiamata = {
  direzione: 'uscita' | 'entrata'
  numero: string
  nome: string
  logId: string | null
  sid?: string
  fase: Fase
  inizio: number | null
  muto: boolean
  attesa: boolean
  /** Avvisi di qualita' dell'SDK in questo momento (rete debole, microfono muto). */
  avvisi: string[]
}

/**
 * Com'e' andato l'audio, misurato dall'SDK durante la chiamata: va a Odoo con
 * la fine della chiamata, cosi' «non ti sentivo bene» si puo' verificare.
 * La perdita in uscita e' quella che dice il lato remoto (RTCP): e' il dato
 * di «non mi sentono».
 */
export type Qualita = {
  platform: string
  codec: string
  samples: number
  warnings: string[]
  mos_min: number | null
  mos_avg: number | null
  uplink_loss_pct: number | null
  downlink_loss_pct: number | null
  jitter_max_ms: number | null
  rtt_max_ms: number | null
}

const MISURA_MS = 5_000

export type StatoTelefono = {
  registrazione: Registrazione
  /** Il perche' del guasto, cosi' come lo dice il server o l'SDK (non tradotto). */
  motivo: string
  /** Tentativo di registrazione fallito (0 = nessuno): il testo lo compone la UI nella lingua scelta. */
  tentativo: number
  /** Il server Odoo si sta riavviando (502/503/504): si riprova da soli, non e' un guasto vero. */
  occupato: boolean
  disponibile: boolean
  chiamata: Chiamata | null
  audio: AudioDevice[]
  audioScelto: AudioDevice | null
}

type Ascoltatore = (stato: StatoTelefono) => void

const STATO_INIZIALE: StatoTelefono = {
  registrazione: 'spento',
  motivo: '',
  tentativo: 0,
  occupato: false,
  disponibile: true,
  chiamata: null,
  audio: [],
  audioScelto: null,
}

function etichetta(): string {
  return `${Device.modelName || (Platform.OS === 'ios' ? 'iPhone' : 'Android')} (GestaVOIP)`
}

export class Telefono {
  private voice = new Voice()
  private sessione: Sessione | null = null
  private dispositivo = ''
  private stato: StatoTelefono = STATO_INIZIALE
  private ascoltatori = new Set<Ascoltatore>()
  private rinnovo: ReturnType<typeof setTimeout> | null = null
  private battito: ReturnType<typeof setInterval> | null = null
  private appState: NativeEventSubscription | null = null
  private invito: CallInvite | null = null
  private call: Call | null = null
  private avviato = false
  private generazione = 0
  suSessioneScaduta: (() => void) | null = null

  osserva(fn: Ascoltatore): () => void {
    this.ascoltatori.add(fn)
    fn(this.stato)
    return () => {
      this.ascoltatori.delete(fn)
    }
  }

  leggi(): StatoTelefono {
    return this.stato
  }

  private aggiorna(parziale: Partial<StatoTelefono>) {
    this.stato = { ...this.stato, ...parziale }
    this.ascoltatori.forEach((fn) => fn(this.stato))
  }

  private aggiornaChiamata(parziale: Partial<Chiamata> | null) {
    if (parziale === null) {
      this.aggiorna({ chiamata: null })
      return
    }
    if (!this.stato.chiamata) {
      return
    }
    this.aggiorna({ chiamata: { ...this.stato.chiamata, ...parziale } })
  }

  // ------------------------------------------------------------------
  // Accensione
  // ------------------------------------------------------------------
  async avvia(sessione: Sessione) {
    this.sessione = sessione
    this.dispositivo = await idDispositivo()
    if (this.avviato) {
      await this.registra('nuova sessione')
      return
    }
    this.avviato = true

    this.voice.on(Voice.Event.CallInvite, (invito: CallInvite) => this.suInvito(invito))
    this.voice.on(Voice.Event.Error, (errore: { message?: string }) => {
      const motivo = errore?.message || t('telefono.erroreSconosciuto')
      this.aggiorna({ registrazione: 'guasto', motivo, tentativo: 0 })
      // Quasi sempre e' la rete o un token scaduto: si risolve riprovando.
      void this.registra('errore: ' + motivo)
    })
    this.voice.on(Voice.Event.AudioDevicesUpdated, (dispositivi: AudioDevice[], scelto?: AudioDevice) => {
      this.aggiorna({ audio: dispositivi, audioScelto: scelto || null })
    })

    if (Platform.OS === 'ios') {
      // Senza, PushKit non consegna le chiamate a un'app chiusa.
      await this.voice.initializePushRegistry().catch((e: unknown) => segnalaErrore(e, 'push registry'))
    }

    // Il telefono rimasto in tasca tutta la notte: il timer di rinnovo non e'
    // scattato perche' il sistema l'ha sospeso, e al risveglio la
    // registrazione puo' essere morta da ore. Al ritorno in primo piano si
    // ri-registra sempre, senza dare per scontato niente.
    this.appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        void this.registra('risveglio')
        this.avviaBattito()
      } else {
        this.fermaBattito()
      }
    })

    await this.riprendiChiamate()
    await this.registra('avvio')
    this.avviaBattito()
  }

  /** Chiamate gia' in corso quando l'app parte (risposta da CallKit ad app chiusa). */
  private async riprendiChiamate() {
    try {
      const chiamate = await this.voice.getCalls()
      const viva = [...chiamate.values()][0]
      if (viva) {
        const param = viva.getCustomParameters() as Record<string, string>
        this.aggiorna({
          chiamata: {
            direzione: 'entrata',
            numero: param.caller || viva.getFrom() || '',
            nome: param.caller_name || '',
            logId: param.log_id || null,
            sid: viva.getSid(),
            fase: 'connessa',
            inizio: viva.getInitialConnectedTimestamp()?.getTime() || Date.now(),
            muto: !!viva.isMuted(),
            attesa: !!viva.isOnHold(),
            avvisi: [],
          },
        })
        this.agganciaCall(viva)
      }
      const audio = await this.voice.getAudioDevices()
      this.aggiorna({ audio: audio.audioDevices, audioScelto: audio.selectedDevice || null })
    } catch (e) {
      segnalaErrore(e, 'ripresa chiamate')
    }
  }

  // ------------------------------------------------------------------
  // Registrazione e token
  // ------------------------------------------------------------------
  private async registra(motivo: string) {
    if (!this.sessione || this.stato.chiamata) {
      return
    }
    const mia = ++this.generazione
    if (this.rinnovo) {
      clearTimeout(this.rinnovo)
      this.rinnovo = null
    }
    if (this.stato.registrazione !== 'pronto') {
      this.aggiorna({ registrazione: 'collegamento', motivo, occupato: false })
    }

    for (let tentativo = 0; mia === this.generazione; tentativo += 1) {
      try {
        const token = await api.chiediToken(this.sessione.server, this.dispositivo)
        if (mia !== this.generazione) {
          return
        }
        if (token.push) {
          await this.voice.register(token.token)
          if (this.stato.disponibile) {
            await api.disponibilita(this.sessione.server, this.dispositivo, true, etichetta())
          }
          this.aggiorna({ registrazione: 'pronto', motivo: '', occupato: false })
        } else {
          // Senza Push Credential sul server Twilio non saprebbe come
          // svegliare il telefono: le chiamate in uscita vanno, quelle in
          // arrivo no. Meglio dirlo che fingere di essere raggiungibili.
          this.aggiorna({ registrazione: 'senza-push', motivo: 'Push non configurate sul server', occupato: false })
        }
        const fra = Math.max(30_000, token.ttl * 1000 - ANTICIPO_RINNOVO_MS)
        this.rinnovo = setTimeout(() => void this.registra('rinnovo programmato'), fra)
        return
      } catch (e) {
        if (e instanceof ErroreOdoo && e.tipo === 'sessione') {
          // Qui insistere non serve: serve che l'operatore rientri.
          this.aggiorna({ registrazione: 'guasto', motivo: e.message, tentativo: 0 })
          this.suSessioneScaduta?.()
          return
        }
        const occupato = e instanceof ErroreOdoo && e.tipo === 'occupato'
        const messaggio = e instanceof Error ? e.message : String(e)
        this.aggiorna({ registrazione: 'guasto', motivo: messaggio, tentativo: tentativo + 1, occupato })
        await new Promise((r) => setTimeout(r, ATTESE_MS[Math.min(tentativo, ATTESE_MS.length - 1)]))
      }
    }
  }

  private avviaBattito() {
    this.fermaBattito()
    this.battito = setInterval(() => {
      if (this.sessione && this.stato.disponibile) {
        api.battito(this.sessione.server, this.dispositivo, etichetta()).catch(() => {
          // Un battito perso non conta: il telefono resta nel centralino per
          // via delle push, il battito serve solo a dire "l'app e' aperta".
        })
      }
    }, BATTITO_MS)
  }

  private fermaBattito() {
    if (this.battito) {
      clearInterval(this.battito)
      this.battito = null
    }
  }

  async impostaDisponibile(disponibile: boolean) {
    this.aggiorna({ disponibile })
    if (!this.sessione) {
      return
    }
    await api.disponibilita(this.sessione.server, this.dispositivo, disponibile, etichetta())
  }

  /** Esce: il telefono smette subito di squillare. */
  async ferma() {
    this.generazione += 1
    if (this.rinnovo) {
      clearTimeout(this.rinnovo)
      this.rinnovo = null
    }
    this.fermaBattito()
    if (this.sessione) {
      try {
        await api.disponibilita(this.sessione.server, this.dispositivo, false, etichetta())
        const token = await api.chiediToken(this.sessione.server, this.dispositivo)
        await this.voice.unregister(token.token)
      } catch (e) {
        segnalaErrore(e, 'uscita')
      }
    }
    this.sessione = null
    this.aggiorna({ ...STATO_INIZIALE })
  }

  // ------------------------------------------------------------------
  // Chiamate in arrivo
  // ------------------------------------------------------------------
  private suInvito(invito: CallInvite) {
    const param = invito.getCustomParameters() as Record<string, string>
    this.invito = invito
    this.aggiorna({
      chiamata: {
        direzione: 'entrata',
        numero: param.caller || invito.getFrom() || '',
        nome: param.caller_name || '',
        logId: param.log_id || null,
        sid: invito.getCallSid(),
        fase: 'in-arrivo',
        inizio: null,
        muto: false,
        attesa: false,
        avvisi: [],
      },
    })
    invito.on(CallInvite.Event.Accepted, (call: Call) => {
      this.invito = null
      this.aggiornaChiamata({ fase: 'connessa', inizio: Date.now() })
      this.agganciaCall(call)
      const logId = this.stato.chiamata?.logId
      if (this.sessione && logId) {
        api.risposto(this.sessione.server, logId).catch((e) => segnalaErrore(e, 'risposto'))
      }
    })
    const chiudi = () => {
      this.invito = null
      this.aggiornaChiamata(null)
    }
    invito.on(CallInvite.Event.Rejected, chiudi)
    invito.on(CallInvite.Event.Cancelled, chiudi)
  }

  async rispondi() {
    await this.invito?.accept()
  }

  async rifiuta() {
    await this.invito?.reject()
  }

  // ------------------------------------------------------------------
  // Chiamate in uscita
  // ------------------------------------------------------------------
  async chiama(numero: string, nome = '') {
    if (!this.sessione || this.stato.chiamata) {
      return
    }
    const pulito = numero.replace(/[^\d+*#]/g, '')
    if (!pulito) {
      return
    }
    this.aggiorna({
      chiamata: {
        direzione: 'uscita',
        numero: pulito,
        nome,
        logId: null,
        fase: 'composizione',
        inizio: null,
        muto: false,
        attesa: false,
        avvisi: [],
      },
    })
    try {
      const token = await api.chiediToken(this.sessione.server, this.dispositivo)
      const call = await this.voice.connect(token.token, {
        params: { To: pulito },
        contactHandle: nome || pulito,
      })
      this.agganciaCall(call)
    } catch (e) {
      segnalaErrore(e, 'chiamata in uscita')
      this.aggiornaChiamata({ fase: 'finita' })
      setTimeout(() => this.aggiornaChiamata(null), 1500)
      throw e
    }
  }

  // ------------------------------------------------------------------
  // Chiamata in corso
  // ------------------------------------------------------------------
  private agganciaCall(call: Call) {
    this.call = call
    this.iniziaMisura(call)
    call.on(Call.Event.QualityWarningsChanged, (attuali: Call.QualityWarning[]) => {
      for (const a of attuali) {
        this.misura.avvisi.add(a)
      }
      this.aggiornaChiamata({ avvisi: [...attuali] })
    })
    call.on(Call.Event.Ringing, () => this.aggiornaChiamata({ fase: 'squillo', sid: call.getSid() }))
    call.on(Call.Event.Connected, () =>
      this.aggiornaChiamata({ fase: 'connessa', inizio: this.stato.chiamata?.inizio || Date.now(), sid: call.getSid() }),
    )
    call.on(Call.Event.Reconnecting, () => this.aggiornaChiamata({ fase: 'riconnessione' }))
    call.on(Call.Event.Reconnected, () => this.aggiornaChiamata({ fase: 'connessa' }))
    const fine = () => void this.chiusa(call)
    call.on(Call.Event.Disconnected, fine)
    call.on(Call.Event.ConnectFailure, fine)
  }

  private async chiusa(call: Call) {
    if (this.call !== call) {
      return
    }
    this.call = null
    const qualita = this.fineMisura()
    const chiamata = this.stato.chiamata
    this.aggiornaChiamata({ fase: 'finita', avvisi: [] })
    if (this.sessione && chiamata) {
      const durata = chiamata.inizio ? Math.round((Date.now() - chiamata.inizio) / 1000) : 0
      // Solo Odoo puo' scrivere la nota sul contatto e chiudere il log: il
      // telefono e' l'unico a sapere quando l'operatore ha riagganciato.
      api
        .chiamataFinita(this.sessione.server, {
          call_sid: chiamata.sid || call.getSid(),
          log_id: chiamata.logId,
          duration: durata,
          quality: qualita,
        })
        .catch((e) => segnalaErrore(e, 'fine chiamata'))
    }
    setTimeout(() => {
      this.aggiornaChiamata(null)
      // Durante la chiamata la registrazione non si tocca: si rifa' adesso.
      void this.registra('fine chiamata')
    }, 1500)
  }

  // ------------------------------------------------------------------
  // Qualita' dell'audio
  // ------------------------------------------------------------------
  private misura = {
    timer: null as ReturnType<typeof setInterval> | null,
    avvisi: new Set<string>(),
    mos: [] as number[],
    codec: '',
    perditaUscita: null as number | null,
    perditaEntrata: null as number | null,
    jitter: null as number | null,
    rtt: null as number | null,
  }

  private iniziaMisura(call: Call) {
    this.fineMisura()
    this.misura = { timer: null, avvisi: new Set(), mos: [], codec: '', perditaUscita: null, perditaEntrata: null, jitter: null, rtt: null }
    const m = this.misura
    const max = (a: number | null, b: number | undefined) => (typeof b === 'number' && isFinite(b) ? Math.max(a ?? b, b) : a)
    const percento = (persi: number, arrivati: number) => (persi + arrivati > 0 ? Math.round((persi / (persi + arrivati)) * 1000) / 10 : null)
    m.timer = setInterval(() => {
      if (this.call !== call || this.stato.chiamata?.fase !== 'connessa') {
        return
      }
      call
        .getStats()
        .then((r) => {
          const loc = r.localAudioTrackStats?.[0]
          const rem = r.remoteAudioTrackStats?.[0]
          if (loc) {
            m.codec = loc.codec || m.codec
            // I contatori sono cumulativi: l'ultimo campione vale per tutta la chiamata.
            m.perditaUscita = percento(loc.packetsLost || 0, loc.packetsSent || 0)
            m.jitter = max(m.jitter, loc.jitter)
            m.rtt = max(m.rtt, loc.roundTripTime)
          }
          if (rem) {
            m.perditaEntrata = percento(rem.packetsLost || 0, rem.packetsReceived || 0)
            m.jitter = max(m.jitter, rem.jitter)
            if (typeof rem.mos === 'number' && rem.mos > 0) {
              m.mos.push(rem.mos)
            }
          }
        })
        .catch(() => undefined)
    }, MISURA_MS)
  }

  private fineMisura(): Qualita | null {
    const m = this.misura
    if (m.timer) {
      clearInterval(m.timer)
      m.timer = null
    }
    if (!m.mos.length && !m.codec && !m.avvisi.size) {
      return null
    }
    const arrotonda = (n: number) => Math.round(n * 100) / 100
    return {
      platform: Platform.OS,
      codec: m.codec,
      samples: m.mos.length,
      warnings: [...m.avvisi],
      mos_min: m.mos.length ? arrotonda(Math.min(...m.mos)) : null,
      mos_avg: m.mos.length ? arrotonda(m.mos.reduce((a, b) => a + b, 0) / m.mos.length) : null,
      uplink_loss_pct: m.perditaUscita,
      downlink_loss_pct: m.perditaEntrata,
      jitter_max_ms: m.jitter,
      rtt_max_ms: m.rtt,
    }
  }

  async riaggancia() {
    if (this.call) {
      await this.call.disconnect()
    } else if (this.invito) {
      await this.invito.reject()
    } else {
      this.aggiornaChiamata(null)
    }
  }

  async muto() {
    if (!this.call || !this.stato.chiamata) {
      return
    }
    const ora = await this.call.mute(!this.stato.chiamata.muto)
    this.aggiornaChiamata({ muto: ora })
  }

  async attesa() {
    if (!this.call || !this.stato.chiamata) {
      return
    }
    const ora = await this.call.hold(!this.stato.chiamata.attesa)
    this.aggiornaChiamata({ attesa: ora })
  }

  async toni(cifre: string) {
    await this.call?.sendDigits(cifre)
  }

  async scegliAudio(dispositivo: AudioDevice) {
    await dispositivo.select()
    this.aggiorna({ audioScelto: dispositivo })
  }

  async trasferisci(collega: number): Promise<string> {
    if (!this.sessione || !this.stato.chiamata) {
      throw new Error(t('telefono.nessunaChiamata'))
    }
    return api.trasferisci(this.sessione.server, collega, {
      log_id: this.stato.chiamata.logId,
      call_sid: this.stato.chiamata.sid,
    })
  }
}

export const telefono = new Telefono()
