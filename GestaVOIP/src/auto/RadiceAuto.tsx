/**
 * CarPlay: componente senza finestra che la scena dell'auto avvia (anche con
 * l'app chiusa e l'iPhone bloccato). Raccoglie da Odoo quello che serve alla
 * guida e lo manda alle quattro schede native (modules/gestable-nativo,
 * CarPlayPonte.swift):
 *
 * - Telefono: preferiti (i numeri piu' chiamati, con la foto) e chiamate recenti;
 * - Agenda: gli appuntamenti di oggi e domani, con «Chiama» e «Indicazioni»;
 * - Messaggi: le chat di Discuss con i non letti (i testi non si mostrano alla guida);
 * - Contatti: i colleghi con l'interno e i contatti frequenti.
 *
 * Prima manda la copia salvata sul telefono, poi quella aggiornata. Un tocco
 * su un nome avvia la chiamata VoIP: CallKit la mostra sulla schermata di CarPlay.
 */

import { useEffect } from 'react'
import { caricaLingua, loc, t, tn } from '../i18n'
import { leggi, scrivi } from '../odoo/archivio'
import { eventi, giornoEsteso, oraBreve, type Evento } from '../odoo/calendario'
import { callKw } from '../odoo/client'
import { conversazioni, mioPartner, segnaLetta, type Conversazione } from '../odoo/lavoro'
import { conTelefono, leggiSessione, type Sessione } from '../odoo/sessione'
import { segnalaErrore } from '../ui/crash'
import { colleghi, registroChiamate, type Collega, type VoceRegistro } from '../voip/api'
import { telefono } from '../voip/telefono'
import {
  aggiornaAuto,
  ascolta,
  type AppuntamentoAuto,
  type ChatAuto,
  type ChiamataAuto,
  type DatiAuto,
  type GiornoAuto,
  type PersonaAuto,
  type StatoAuto,
} from '../../modules/gestable-nativo'

const OGNI_MS = 60_000
const MASSIMO = 12
const PREFERITI = 6
const COPIA = 'auto'
const MAGENTA = '#B33A7E'
const BLU = '#0F7AB6'

type M2o = [number, string] | false
type Partner = {
  id: number
  name: string
  function: string | false
  parent_id: M2o
  phone: string | false
  mobile: string | false
  street: string | false
  zip: string | false
  city: string | false
}

/** Le foto non cambiano spesso: una volta per persona finche' l'auto resta collegata. */
const foto = new Map<string, string>()

/** Solo foto vere: Odoo da' agli utenti senza foto un disegno SVG (meglio le iniziali). */
function fotoVera(b64: string | false | undefined): string {
  if (!b64) {
    return ''
  }
  return b64.startsWith('/9j/') || b64.startsWith('iVBOR') || b64.startsWith('UklGR') ? b64 : ''
}

async function caricaFoto(server: string, modello: 'res.partner' | 'res.users', ids: number[]): Promise<void> {
  const mancano = [...new Set(ids)].filter((id) => id && !foto.has(`${modello}:${id}`))
  if (!mancano.length) {
    return
  }
  const righe = await callKw<{ id: number; image_128: string | false }[]>(server, modello, 'read', [mancano, ['image_128']]).catch(
    () => [],
  )
  for (const id of mancano) {
    foto.set(`${modello}:${id}`, fotoVera(righe.find((r) => r.id === id)?.image_128))
  }
}

function fotoDi(modello: 'res.partner' | 'res.users', id: number | null | undefined): string {
  return id ? foto.get(`${modello}:${id}`) || '' : ''
}

function testiAuto(): Record<string, string> {
  const chiavi = [
    'telefono', 'agenda', 'messaggi', 'contatti', 'preferiti', 'recenti', 'vuoto', 'agendaVuota', 'messaggiVuoti',
    'contattiVuoti', 'inCorso', 'chiamaNome', 'indicazioni', 'indicazioniApri', 'segnaLetta', 'chiudi', 'nonLettiGuida',
    'nessunNuovo', 'colleghi', 'accedi', 'bloccatoTitolo', 'bloccato', 'senzaTelefono', 'caricamento',
  ]
  const testi: Record<string, string> = Object.fromEntries(chiavi.map((k) => [k, t(`auto.${k}`)]))
  testi.frequenti = t('auto.contattiFrequenti')
  return testi
}

function vuoti(stato: StatoAuto): DatiAuto {
  return { stato, recenti: [], preferiti: [], agenda: [], chat: [], colleghi: [], contatti: [], testi: testiAuto() }
}

function ora(d: Date): string {
  return d.toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' })
}

function quando(d: Date | null): string {
  if (!d) {
    return ''
  }
  if (d.toDateString() === new Date().toDateString()) {
    return ora(d)
  }
  return `${d.toLocaleDateString(loc(), { day: '2-digit', month: '2-digit' })} ${ora(d)}`
}

function dataRegistro(v: VoceRegistro): Date {
  return new Date(v.create_date.replace(' ', 'T') + 'Z')
}

/** «ticinoWEB, Rita Ispan» → «Rita Ispan». */
function nomePulito(nome: string): string {
  const parti = nome.split(', ')
  return (parti.length > 1 ? parti[parti.length - 1] : nome).trim()
}

function numeroDi(p: Partner | undefined): string {
  return p ? p.mobile || p.phone || '' : ''
}

function indirizzoDi(p: Partner | undefined): string {
  if (!p) {
    return ''
  }
  return [p.street, [p.zip, p.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
}

function persa(v: VoceRegistro): boolean {
  return v.direction === 'inbound' && (v.status === 'no-answer' || !v.duration)
}

// ---------------------------------------------------------------------------
// Schede
// ---------------------------------------------------------------------------

function recenti(voci: VoceRegistro[]): ChiamataAuto[] {
  return voci
    .filter((v) => v.caller_number)
    .slice(0, MASSIMO)
    .map((v) => {
      const mancata = persa(v)
      return {
        titolo: v.partner_id ? nomePulito(v.partner_id[1]) : v.caller_number || '',
        sottotitolo: [mancata ? t('auto.persa') : '', quando(dataRegistro(v))].filter(Boolean).join(' · '),
        numero: v.caller_number || '',
        tipo: mancata ? 'persa' : v.direction === 'inbound' ? 'entrata' : 'uscita',
        foto: fotoDi('res.partner', v.partner_id ? v.partner_id[0] : null),
      }
    })
}

/** I numeri piu' chiamati (o che chiamano di piu'), con il loro conteggio. */
function frequenti(voci: VoceRegistro[]): { voce: VoceRegistro; n: number }[] {
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
  return [...conta.values()].sort((a, b) => b.n - a.n)
}

function preferiti(voci: VoceRegistro[]): PersonaAuto[] {
  return frequenti(voci)
    .slice(0, PREFERITI)
    .map(({ voce, n }) => ({
      id: voce.partner_id ? voce.partner_id[0] : 0,
      nome: voce.partner_id ? nomePulito(voce.partner_id[1]) : voce.caller_number || '',
      sottotitolo: tn('auto.chiamate', n),
      dettaglio: voce.caller_number || '',
      numero: voce.caller_number || '',
      indirizzo: '',
      foto: fotoDi('res.partner', voce.partner_id ? voce.partner_id[0] : null),
    }))
}

function agenda(lista: Evento[], partner: Map<number, Partner>, io: number): GiornoAuto[] {
  const adesso = new Date()
  const giorni: GiornoAuto[] = []
  for (let k = 0; k < 2; k++) {
    const giorno = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate() + k)
    const chiave = `${giorno.getFullYear()}-${String(giorno.getMonth() + 1).padStart(2, '0')}-${String(giorno.getDate()).padStart(2, '0')}`
    const fine = new Date(giorno.getTime() + 86_400_000)
    const delGiorno = lista
      .filter((e) => (e.tuttoIlGiorno ? e.dal <= chiave && e.al >= chiave : e.inizio < fine && e.fine > giorno))
      // Oggi restano solo quelli non ancora finiti.
      .filter((e) => k > 0 || e.tuttoIlGiorno || e.fine > adesso)
      .sort((a, b) => Number(b.tuttoIlGiorno) - Number(a.tuttoIlGiorno) || a.inizio.getTime() - b.inizio.getTime())
    const voci: AppuntamentoAuto[] = delGiorno.map((e) => {
      const altri = (e.partnerIds || []).filter((id) => id !== io).map((id) => partner.get(id)).filter((p): p is Partner => !!p)
      const daChiamare = altri.find((p) => numeroDi(p))
      const nomi = altri.map((p) => nomePulito(p.name))
      const persone = nomi.length > 2 ? t('auto.eAltri', { nome: nomi[0], n: nomi.length - 1 }) : nomi.join(', ')
      const inCorso = !e.tuttoIlGiorno && e.inizio <= adesso && e.fine > adesso
      return {
        id: e.id,
        titolo: e.titolo,
        ora: e.tuttoIlGiorno ? '' : oraBreve(e.inizio),
        quando: e.tuttoIlGiorno ? t('auto.tuttoIlGiorno') : `${oraBreve(e.inizio)} – ${oraBreve(e.fine)}`,
        luogo: e.luogo,
        persone,
        numero: numeroDi(daChiamare),
        chiamaNome: daChiamare ? nomePulito(daChiamare.name).split(' ')[0] : '',
        colore: inCorso ? MAGENTA : k === 0 ? BLU : '#8346C2',
        inCorso,
      }
    })
    if (voci.length) {
      giorni.push({
        titolo: k === 0 ? t('auto.oggi') : t('auto.domani'),
        sottotitolo: `${giornoEsteso(giorno)} · ${tn('auto.appuntamenti', voci.length)}`,
        voci,
      })
    }
  }
  return giorni
}

function chat(lista: Conversazione[], partner: Map<number, Partner>): ChatAuto[] {
  return [...lista]
    .filter((c) => c.tipo === 'chat' || c.tipo === 'group' || c.tipo === 'channel')
    .sort(
      (a, b) =>
        Number(b.nonLetti > 0) - Number(a.nonLetti > 0) ||
        (b.ultimo?.data?.getTime() || 0) - (a.ultimo?.data?.getTime() || 0),
    )
    .slice(0, MASSIMO)
    .map((c) => {
      const q = quando(c.ultimo?.data || null)
      const dettaglio =
        c.nonLetti > 0
          ? [tn('auto.nonLetti', c.nonLetti), q].filter(Boolean).join(' · ')
          : c.ultimo
            ? t('auto.ultimoDa', { nome: c.ultimo.mio ? t('auto.tu') : nomePulito(c.ultimo.autore).split(' ')[0], quando: q })
            : ''
      return {
        id: c.id,
        nome: nomePulito(c.nome),
        nonLetti: c.nonLetti,
        dettaglio,
        gruppo: c.tipo !== 'chat',
        numero: c.partnerId ? numeroDi(partner.get(c.partnerId)) : '',
        foto: fotoDi('res.partner', c.partnerId),
      }
    })
}

function colleghiAuto(lista: Collega[]): PersonaAuto[] {
  return lista
    .filter((c) => c.extension)
    .sort((a, b) => Number(b.available) - Number(a.available) || a.name.localeCompare(b.name))
    .slice(0, MASSIMO)
    .map((c) => ({
      id: c.id,
      nome: c.name,
      sottotitolo: `${t('auto.interno', { n: c.extension })} · ${c.available ? t('auto.libero') : t('auto.occupato')}`,
      dettaglio: '',
      numero: c.extension,
      indirizzo: '',
      foto: fotoDi('res.users', c.id),
      disponibile: c.available,
    }))
}

/** Chi si chiama di piu' e chi si incontra oggi e domani. */
function contattiAuto(ordine: number[], partner: Map<number, Partner>): PersonaAuto[] {
  const visti = new Set<number>()
  const fuori: PersonaAuto[] = []
  for (const id of ordine) {
    const p = partner.get(id)
    if (!p || visti.has(id) || !numeroDi(p)) {
      continue
    }
    visti.add(id)
    const azienda = p.parent_id ? p.parent_id[1] : ''
    fuori.push({
      id,
      nome: nomePulito(p.name),
      sottotitolo: [p.function || '', azienda].filter(Boolean).join(' · ') || numeroDi(p),
      dettaglio: numeroDi(p),
      numero: numeroDi(p),
      indirizzo: indirizzoDi(p),
      foto: fotoDi('res.partner', id),
    })
    if (fuori.length >= MASSIMO) {
      break
    }
  }
  return fuori
}

// ---------------------------------------------------------------------------
// Raccolta da Odoo
// ---------------------------------------------------------------------------

async function raccogli(s: Sessione): Promise<DatiAuto> {
  const { server } = s
  const uid = s.utente.uid
  const oggi = new Date()
  oggi.setHours(0, 0, 0, 0)
  const dopodomani = new Date(oggi.getTime() + 2 * 86_400_000)
  const [voci, lista, discuss, team, io] = await Promise.all([
    registroChiamate(server, uid).then(
      (v) => {
        scrivi(server, uid, 'recenti', v)
        return v
      },
      () => leggi<VoceRegistro[]>(server, uid, 'recenti') || [],
    ),
    eventi(server, uid, oggi, dopodomani).catch(() => [] as Evento[]),
    conversazioni(server, uid).catch(() => [] as Conversazione[]),
    colleghi(server).catch(() => [] as Collega[]),
    mioPartner(server, uid).catch(() => 0),
  ])

  // Le persone da mostrare, nell'ordine in cui contano.
  const daRegistro = frequenti(voci).map(({ voce }) => (voce.partner_id ? voce.partner_id[0] : 0))
  const daAgenda = lista.flatMap((e) => e.partnerIds || [])
  const daChat = discuss.map((c) => c.partnerId || 0)
  const ids = [...new Set([...daRegistro, ...daAgenda, ...daChat])].filter((id) => id && id !== io).slice(0, 80)
  const righe = ids.length
    ? await callKw<Partner[]>(server, 'res.partner', 'read', [
        ids,
        ['name', 'function', 'parent_id', 'phone', 'mobile', 'street', 'zip', 'city'],
      ]).catch(() => [] as Partner[])
    : []
  const partner = new Map(righe.map((p) => [p.id, p]))
  const ordineContatti = [...daRegistro, ...daAgenda].filter((id) => id && id !== io)

  // Foto: solo quelle che compaiono sullo schermo, una volta sola.
  const conFoto = [
    ...voci.slice(0, MASSIMO).map((v) => (v.partner_id ? v.partner_id[0] : 0)),
    ...daChat,
    ...contattiAuto(ordineContatti, partner).map((p) => p.id),
  ]
  await Promise.all([caricaFoto(server, 'res.partner', conFoto), caricaFoto(server, 'res.users', team.map((c) => c.id))])

  return {
    stato: 'pronto',
    recenti: recenti(voci),
    preferiti: preferiti(voci),
    agenda: agenda(lista, partner, io),
    chat: chat(discuss, partner),
    colleghi: colleghiAuto(team),
    contatti: contattiAuto(ordineContatti, partner),
    testi: testiAuto(),
  }
}

/** Ultimo messaggio della chat, per segnarla letta fin li'. */
async function ultimoMessaggio(server: string, canale: number): Promise<number> {
  const r = await callKw<number[]>(server, 'mail.message', 'search', [[['model', '=', 'discuss.channel'], ['res_id', '=', canale]]], {
    order: 'id desc',
    limit: 1,
  })
  return r[0] || 0
}

export function RadiceAuto() {
  useEffect(() => {
    let vivo = true
    let avviato = false
    let sessione: Sessione | null = null

    async function aggiorna() {
      await caricaLingua()
      let s: Sessione | null
      try {
        s = await leggiSessione()
      } catch {
        // Portachiavi chiuso: iPhone mai sbloccato dall'accensione.
        await aggiornaAuto(vuoti('bloccato'))
        return
      }
      if (!vivo) {
        return
      }
      if (!s || !s.utente.uid) {
        await aggiornaAuto(vuoti('accesso'))
        return
      }
      if (!conTelefono(s)) {
        await aggiornaAuto(vuoti('senzaTelefono'))
        return
      }
      sessione = s
      // Con l'app chiusa il telefono non e' ancora collegato al centralino.
      if (!avviato) {
        avviato = true
        telefono.avvia(s).catch((e) => segnalaErrore(e, 'avvio telefono (CarPlay)'))
      }
      const copia = leggi<DatiAuto>(s.server, s.utente.uid, COPIA)
      if (copia?.stato === 'pronto') {
        await aggiornaAuto({ ...copia, testi: testiAuto() })
      }
      try {
        const dati = await raccogli(s)
        if (!vivo) {
          return
        }
        await aggiornaAuto(dati)
        // Copia senza foto: all'avvio successivo appare subito, le foto arrivano dopo.
        scrivi(s.server, s.utente.uid, COPIA, {
          ...dati,
          recenti: dati.recenti.map((x) => ({ ...x, foto: '' })),
          preferiti: dati.preferiti.map((x) => ({ ...x, foto: '' })),
          chat: dati.chat.map((x) => ({ ...x, foto: '' })),
          colleghi: dati.colleghi.map((x) => ({ ...x, foto: '' })),
          contatti: dati.contatti.map((x) => ({ ...x, foto: '' })),
        })
      } catch (e) {
        // Senza rete resta la copia salvata.
        if (!copia) {
          segnalaErrore(e, 'dati CarPlay')
        }
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
    const via3 = ascolta('onLettaAuto', ({ id }) => {
      const s = sessione
      if (!s) {
        return
      }
      ultimoMessaggio(s.server, id)
        .then((ultimo) => (ultimo ? segnaLetta(s.server, id, ultimo) : undefined))
        .then(() => aggiorna())
        .catch((e) => segnalaErrore(e, 'chat letta da CarPlay'))
    })
    return () => {
      vivo = false
      clearInterval(timer)
      via1()
      via2()
      via3()
    }
  }, [])

  return null
}
