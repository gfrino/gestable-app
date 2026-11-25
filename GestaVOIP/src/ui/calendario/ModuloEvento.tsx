/**
 * Il modulo di un appuntamento, nuovo o da modificare, con tutti i campi del
 * calendario di Odoo: titolo, quando (tutto il giorno, inizio, fine), persone
 * (organizzatore, invitati), dove (luogo, videochiamata), ripetizione,
 * promemoria, etichette, privacy, mostra come, calendario (Odoo 20),
 * descrizione e note interne (Odoo 19+).
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useRouter } from 'expo-router'
import { useEffect, useState, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  dettaglioEvento,
  GIORNI_SETTIMANA,
  giornoDi,
  giornoChiave,
  linkVideoOdoo,
  NOME_GIORNO,
  opzioniEvento,
  salvaEvento,
  settimanaDelMese,
  type Ambito,
  type Modulo,
  type Opzioni,
  type Persona,
  type Ripetizione,
  type Scheda,
  type TipoRipetizione,
} from '../../odoo/calendario'
import { mioPartner, urlAvatar } from '../../odoo/lavoro'
import { useApp } from '../../voip/Contesto'
import { Avatar } from '../Avatar'
import { Pulsante } from '../Pulsante'
import { Testata } from '../Testata'
import { raggio, spazio, useColori } from '../tema'
import { CercaPersone } from './CercaPersone'
import { SceltaGiorno, SceltaOra } from './Selettori'

const DURATE = [
  { minuti: 30, testo: '30 min' },
  { minuti: 60, testo: '1 h' },
  { minuti: 90, testo: '1 h 30' },
  { minuti: 120, testo: '2 h' },
  { minuti: 180, testo: '3 h' },
]

const TIPI: { tipo: TipoRipetizione; testo: string; unita: [string, string] }[] = [
  { tipo: 'daily', testo: 'Giorno', unita: ['giorno', 'giorni'] },
  { tipo: 'weekly', testo: 'Settimana', unita: ['settimana', 'settimane'] },
  { tipo: 'monthly', testo: 'Mese', unita: ['mese', 'mesi'] },
  { tipo: 'yearly', testo: 'Anno', unita: ['anno', 'anni'] },
]

const LETTERE: Record<string, string> = { mon: 'L', tue: 'M', wed: 'M', thu: 'G', fri: 'V', sat: 'S', sun: 'D' }
const ORDINALE: Record<string, string> = { '1': 'primo', '2': 'secondo', '3': 'terzo', '4': 'quarto', '-1': 'ultimo' }

const VIDEO_ODOO = 'calendar/join_videocall'

/** Prossima ora piena se il giorno e' oggi, altrimenti le 9. */
function inizioProposto(giorno: string | undefined): Date {
  const oggi = new Date()
  const d = giorno ? new Date(`${giorno}T09:00:00`) : new Date(oggi)
  if (!giorno || d.toDateString() === oggi.toDateString()) {
    const x = new Date(oggi)
    x.setMinutes(0, 0, 0)
    x.setHours(x.getHours() + 1)
    return x
  }
  return d
}

const ora = (d: Date) => d.toLocaleTimeString('it-CH', { hour: '2-digit', minute: '2-digit' })
const giornoBreve = (d: Date) => {
  const t = d.toLocaleDateString('it-CH', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function Chip({ testo, attivo, onPress }: { testo: string; attivo: boolean; onPress: () => void }) {
  const c = useColori()
  return (
    <Pressable
      onPress={onPress}
      style={[s.chip, { borderColor: attivo ? c.primario : c.bordo, backgroundColor: attivo ? c.primarioTenue : c.superficie }]}
      accessibilityRole="button"
      accessibilityState={{ selected: attivo }}
    >
      {attivo ? <Ionicons name="checkmark" size={15} color={c.primario} /> : null}
      <Text style={[s.chipTesto, { color: attivo ? c.primario : c.testo }]} numberOfLines={1}>
        {testo}
      </Text>
    </Pressable>
  )
}

function Sezione({ titolo, children, destra }: { titolo: string; children: ReactNode; destra?: ReactNode }) {
  const c = useColori()
  return (
    <View style={[s.scheda, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
      <View style={s.schedaTesta}>
        <Text style={[s.etichetta, { color: c.testo2 }]} numberOfLines={1}>
          {titolo}
        </Text>
        {destra}
      </View>
      {children}
    </View>
  )
}

function Bottone({ testo, onPress, icona, etichetta }: { testo: string; onPress: () => void; icona?: keyof typeof Ionicons.glyphMap; etichetta?: string }) {
  const c = useColori()
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.bottone, { backgroundColor: pressed ? c.superficie2 : c.sfondo, borderColor: c.bordo }]}
      accessibilityRole="button"
      accessibilityLabel={etichetta}
    >
      {icona ? <Ionicons name={icona} size={17} color={c.primario} /> : null}
      <Text style={[s.bottoneTesto, { color: c.testo }]} numberOfLines={1}>
        {testo}
      </Text>
    </Pressable>
  )
}

function Contatore({ valore, cambia, min = 1, max = 99 }: { valore: number; cambia: (n: number) => void; min?: number; max?: number }) {
  const c = useColori()
  const tasto = (icona: 'remove' | 'add', n: number, label: string) => (
    <Pressable
      onPress={() => cambia(Math.min(max, Math.max(min, n)))}
      hitSlop={6}
      style={({ pressed }) => [s.passo, { borderColor: c.bordo, backgroundColor: pressed ? c.superficie2 : c.sfondo }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icona} size={18} color={c.primario} />
    </Pressable>
  )
  return (
    <View style={s.contatore}>
      {tasto('remove', valore - 1, 'Meno')}
      <Text style={[s.contatoreTesto, { color: c.testo }]}>{valore}</Text>
      {tasto('add', valore + 1, 'Più')}
    </View>
  )
}

type Selettore = null | 'giornoInizio' | 'oraInizio' | 'giornoFine' | 'oraFine' | 'finoAl' | 'invitati' | 'organizzatore'

export function ModuloEvento({ id, giorno }: { id: number | null; giorno?: string }) {
  const c = useColori()
  const router = useRouter()
  const { sessione } = useApp()
  const server = sessione?.server || ''
  const uid = sessione?.utente.uid || 0

  const [opzioni, setOpzioni] = useState<Opzioni | null>(null)
  const [prima, setPrima] = useState<Scheda | null>(null)
  const [m, setM] = useState<Modulo | null>(null)
  const [organizzatore, setOrganizzatore] = useState<Persona | null>(null)
  const [errore, setErrore] = useState('')
  const [salvo, setSalvo] = useState(false)
  const [aperto, setAperto] = useState<Selettore>(null)

  useEffect(() => {
    let valido = true
    ;(async () => {
      const [o, io] = await Promise.all([opzioniEvento(server), mioPartner(server, uid)])
      if (id === null) {
        const inizio = inizioProposto(giorno)
        const nome = sessione?.utente.name || ''
        const modulo: Modulo = {
          titolo: '',
          tuttoIlGiorno: false,
          inizio,
          fine: new Date(inizio.getTime() + 3_600_000),
          invitati: [{ id: io, nome, email: sessione?.utente.login || '', azienda: '' }],
          organizzatoreId: uid,
          luogo: '',
          video: '',
          descrizione: '',
          note: '',
          etichette: [],
          promemoria: [],
          privacy: o.privacyFacoltativa ? '' : o.privacy[0]?.valore || '',
          mostraCome: 'busy',
          calendarioId: null,
          ripetizione: null,
        }
        if (valido) {
          setOpzioni(o)
          setM(modulo)
          setOrganizzatore({ id: uid, nome, email: '', azienda: '' })
        }
        return
      }
      const e = await dettaglioEvento(server, uid, id)
      if (!e) {
        throw new Error('Appuntamento non trovato.')
      }
      const modulo: Modulo = {
        titolo: e.titolo,
        tuttoIlGiorno: e.tuttoIlGiorno,
        inizio: e.tuttoIlGiorno ? new Date(`${e.dal}T09:00:00`) : e.inizio,
        fine: e.tuttoIlGiorno ? new Date(`${e.al}T10:00:00`) : e.fine,
        invitati: e.persone.filter((p) => p.partnerId).map((p) => ({ id: p.partnerId, nome: p.nome, email: p.email, azienda: '' })),
        organizzatoreId: e.organizzatoreId,
        luogo: e.luogo,
        video: e.video,
        descrizione: e.descrizione,
        note: e.note,
        etichette: e.etichette.map((x) => x.id),
        promemoria: e.promemoria.map((x) => x.id),
        privacy: e.privacy,
        mostraCome: e.mostraCome,
        calendarioId: e.calendario?.id ?? null,
        ripetizione: e.ripetizione,
      }
      if (valido) {
        setOpzioni(o)
        setPrima(e)
        setM(modulo)
        setOrganizzatore(e.organizzatoreId ? { id: e.organizzatoreId, nome: e.organizzatore, email: '', azienda: '' } : null)
      }
    })().catch((err: unknown) => valido && setErrore(err instanceof Error ? err.message : String(err)))
    return () => {
      valido = false
    }
  }, [server, uid, id, giorno, sessione?.utente.name, sessione?.utente.login])

  const titoloPagina = id === null ? 'Nuovo appuntamento' : 'Modifica'

  if (!m || !opzioni) {
    return (
      <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top', 'bottom']}>
        <Testata titolo={titoloPagina} />
        {errore ? (
          <Text style={[s.vuoto, { color: c.rosso }]}>{errore}</Text>
        ) : (
          <ActivityIndicator style={{ marginTop: spazio.xxl }} color={c.primario} />
        )}
      </SafeAreaView>
    )
  }

  const cambia = (parte: Partial<Modulo>) => setM((x) => (x ? { ...x, ...parte } : x))
  const durata = m.fine.getTime() - m.inizio.getTime()

  /** L'inizio si sposta: la fine lo segue con la stessa durata (come in Odoo). */
  function nuovoInizio(d: Date) {
    cambia({ inizio: d, fine: new Date(d.getTime() + Math.max(durata, m!.tuttoIlGiorno ? 0 : 15 * 60_000)) })
  }

  function nuovaFine(d: Date) {
    if (!m!.tuttoIlGiorno && d <= m!.inizio) {
      Alert.alert('Fine', 'La fine deve essere dopo l\'inizio.')
      return
    }
    if (m!.tuttoIlGiorno && giornoChiave(d) < giornoChiave(m!.inizio)) {
      Alert.alert('Fine', 'L\'ultimo giorno non può essere prima del primo.')
      return
    }
    cambia({ fine: d })
  }

  function rip(parte: Partial<Ripetizione>) {
    const base: Ripetizione = m!.ripetizione || {
      tipo: 'weekly',
      ogni: 1,
      fine: 'forever',
      volte: 10,
      finoAl: '',
      giorni: [giornoDi(m!.inizio)],
      mesePer: 'date',
    }
    cambia({ ripetizione: { ...base, ...parte } })
  }

  async function sceltaVideo(tipo: 'nessuna' | 'odoo' | 'link') {
    if (tipo === 'nessuna') {
      cambia({ video: '' })
    } else if (tipo === 'odoo') {
      if (!m!.video.includes(VIDEO_ODOO)) {
        try {
          cambia({ video: await linkVideoOdoo(server) })
        } catch (e) {
          Alert.alert('Videochiamata', e instanceof Error ? e.message : String(e))
        }
      }
    } else {
      cambia({ video: m!.video.includes(VIDEO_ODOO) ? '' : m!.video || 'https://' })
    }
  }

  async function salva(ambito?: Ambito) {
    if (!m!.titolo.trim()) {
      Alert.alert(titoloPagina, 'Scrivi il titolo.')
      return
    }
    // Una serie: a quali appuntamenti si applica la modifica.
    if (prima?.inSerie && !ambito) {
      Alert.alert('Appuntamento che si ripete', 'Quali appuntamenti vuoi modificare?', [
        { text: 'Solo questo', onPress: () => void salva('self_only') },
        { text: 'Questo e i successivi', onPress: () => void salva('future_events') },
        { text: 'Tutti', onPress: () => void salva('all_events') },
        { text: 'Annulla', style: 'cancel' },
      ])
      return
    }
    setSalvo(true)
    try {
      await salvaEvento(server, uid, id, m!, prima, ambito)
      router.back()
    } catch (e) {
      Alert.alert('Appuntamento non salvato', e instanceof Error ? e.message : String(e))
      setSalvo(false)
    }
  }

  const video = !m.video ? 'nessuna' : m.video.includes(VIDEO_ODOO) ? 'odoo' : 'link'
  const r = m.ripetizione
  const unita = r ? TIPI.find((t) => t.tipo === r.tipo)!.unita : ['', '']
  const campo = [s.campo, { backgroundColor: c.sfondo, borderColor: c.bordo, color: c.testo }]

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top', 'bottom']}>
      <Testata titolo={titoloPagina} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.contenuto} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <TextInput
            style={[s.campo, s.titolo, { backgroundColor: c.superficie, borderColor: c.bordo, color: c.testo }]}
            value={m.titolo}
            onChangeText={(t) => cambia({ titolo: t })}
            placeholder="Titolo"
            placeholderTextColor={c.testo3}
            autoFocus={id === null}
            returnKeyType="done"
            accessibilityLabel="Titolo"
          />

          <Sezione titolo="Quando">
            <View style={s.riga}>
              <Text style={[s.voce, { color: c.testo }]}>Tutto il giorno</Text>
              <Switch value={m.tuttoIlGiorno} onValueChange={(v) => cambia({ tuttoIlGiorno: v })} trackColor={{ true: c.primario }} />
            </View>
            <View style={s.riga}>
              <Text style={[s.voceCorta, { color: c.testo2 }]}>{m.tuttoIlGiorno ? 'Dal' : 'Inizio'}</Text>
              <Bottone testo={giornoBreve(m.inizio)} onPress={() => setAperto('giornoInizio')} etichetta="Giorno di inizio" />
              {!m.tuttoIlGiorno ? <Bottone testo={ora(m.inizio)} onPress={() => setAperto('oraInizio')} etichetta="Ora di inizio" /> : null}
            </View>
            <View style={s.riga}>
              <Text style={[s.voceCorta, { color: c.testo2 }]}>{m.tuttoIlGiorno ? 'Al' : 'Fine'}</Text>
              <Bottone testo={giornoBreve(m.fine)} onPress={() => setAperto('giornoFine')} etichetta="Giorno di fine" />
              {!m.tuttoIlGiorno ? <Bottone testo={ora(m.fine)} onPress={() => setAperto('oraFine')} etichetta="Ora di fine" /> : null}
            </View>
            {!m.tuttoIlGiorno ? (
              <View style={s.chips}>
                {DURATE.map((d) => (
                  <Chip
                    key={d.minuti}
                    testo={d.testo}
                    attivo={durata === d.minuti * 60_000}
                    onPress={() => cambia({ fine: new Date(m.inizio.getTime() + d.minuti * 60_000) })}
                  />
                ))}
              </View>
            ) : null}
          </Sezione>

          <Sezione titolo="Persone">
            <Pressable
              onPress={() => setAperto('organizzatore')}
              style={({ pressed }) => [s.persona, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel="Cambia organizzatore"
            >
              <Avatar url={organizzatore ? urlAvatar(server, 'res.users', organizzatore.id) : undefined} nome={organizzatore?.nome || '?'} lato={36} />
              <View style={{ flex: 1 }}>
                <Text style={[s.sotto, { color: c.testo2 }]}>Organizzatore</Text>
                <Text style={[s.nome, { color: c.testo }]} numberOfLines={1}>
                  {organizzatore?.nome || 'Nessuno'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.testo3} />
            </Pressable>
            <View style={[s.linea, { backgroundColor: c.bordo }]} />
            {m.invitati.map((p) => (
              <View key={p.id} style={s.persona}>
                <Avatar url={urlAvatar(server, 'res.partner', p.id)} nome={p.nome} lato={36} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.nome, { color: c.testo }]} numberOfLines={1}>
                    {p.nome}
                  </Text>
                  {p.email && p.email !== p.nome ? (
                    <Text style={[s.sotto, { color: c.testo2 }]} numberOfLines={1}>
                      {p.email}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => cambia({ invitati: m.invitati.filter((x) => x.id !== p.id) })}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Togli ${p.nome}`}
                >
                  <Ionicons name="close-circle" size={24} color={c.testo3} />
                </Pressable>
              </View>
            ))}
            <Bottone testo="Aggiungi invitati" icona="person-add-outline" onPress={() => setAperto('invitati')} />
          </Sezione>

          <Sezione titolo="Dove">
            <TextInput
              style={campo}
              value={m.luogo}
              onChangeText={(t) => cambia({ luogo: t })}
              placeholder="Luogo"
              placeholderTextColor={c.testo3}
              accessibilityLabel="Luogo"
            />
            {opzioni.haVideo ? (
              <>
                <Text style={[s.sotto, { color: c.testo2 }]}>Videochiamata</Text>
                <View style={s.chips}>
                  <Chip testo="Nessuna" attivo={video === 'nessuna'} onPress={() => void sceltaVideo('nessuna')} />
                  <Chip testo="Odoo" attivo={video === 'odoo'} onPress={() => void sceltaVideo('odoo')} />
                  <Chip testo="Altro link" attivo={video === 'link'} onPress={() => void sceltaVideo('link')} />
                </View>
                {video === 'link' ? (
                  <TextInput
                    style={campo}
                    value={m.video}
                    onChangeText={(t) => cambia({ video: t })}
                    placeholder="https://meet.google.com/..."
                    placeholderTextColor={c.testo3}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    accessibilityLabel="Link della videochiamata"
                  />
                ) : video === 'odoo' ? (
                  <Text style={[s.sotto, { color: c.testo3 }]} numberOfLines={1}>
                    {m.video}
                  </Text>
                ) : null}
              </>
            ) : null}
          </Sezione>

          {opzioni.haRipetizione ? (
            <Sezione
              titolo="Ripetizione"
              destra={
                <Switch
                  value={!!r}
                  onValueChange={(v) => (v ? rip({}) : cambia({ ripetizione: null }))}
                  trackColor={{ true: c.primario }}
                  accessibilityLabel="Si ripete"
                />
              }
            >
              {r ? (
                <>
                  <View style={s.chips}>
                    {TIPI.map((t) => (
                      <Chip key={t.tipo} testo={t.testo} attivo={r.tipo === t.tipo} onPress={() => rip({ tipo: t.tipo })} />
                    ))}
                  </View>
                  <View style={s.riga}>
                    <Text style={[s.voce, { color: c.testo }]}>Ogni</Text>
                    <Contatore valore={r.ogni} cambia={(n) => rip({ ogni: n })} />
                    <Text style={[s.voceCorta, { color: c.testo }]} numberOfLines={1}>
                      {r.ogni === 1 ? unita[0] : unita[1]}
                    </Text>
                  </View>
                  {r.tipo === 'weekly' ? (
                    <View style={s.giorni}>
                      {GIORNI_SETTIMANA.map((g) => {
                        const attivo = r.giorni.includes(g)
                        return (
                          <Pressable
                            key={g}
                            onPress={() => {
                              const giorni = attivo ? r.giorni.filter((x) => x !== g) : [...r.giorni, g]
                              rip({ giorni: giorni.length ? giorni : r.giorni })
                            }}
                            style={[s.giorno, { borderColor: attivo ? c.primario : c.bordo, backgroundColor: attivo ? c.primario : c.sfondo }]}
                            accessibilityRole="button"
                            accessibilityLabel={NOME_GIORNO[g]}
                            accessibilityState={{ selected: attivo }}
                          >
                            <Text style={[s.giornoTesto, { color: attivo ? c.primarioTesto : c.testo }]}>{LETTERE[g]}</Text>
                          </Pressable>
                        )
                      })}
                    </View>
                  ) : null}
                  {r.tipo === 'monthly' ? (
                    <View style={s.chips}>
                      <Chip testo={`Il giorno ${m.inizio.getDate()}`} attivo={r.mesePer === 'date'} onPress={() => rip({ mesePer: 'date' })} />
                      <Chip
                        testo={`Il ${ORDINALE[settimanaDelMese(m.inizio)]} ${NOME_GIORNO[giornoDi(m.inizio)]}`}
                        attivo={r.mesePer === 'day'}
                        onPress={() => rip({ mesePer: 'day' })}
                      />
                    </View>
                  ) : null}
                  <Text style={[s.sotto, { color: c.testo2 }]}>Fine</Text>
                  <View style={s.chips}>
                    <Chip testo="Mai" attivo={r.fine === 'forever'} onPress={() => rip({ fine: 'forever' })} />
                    <Chip testo="Dopo un numero di volte" attivo={r.fine === 'count'} onPress={() => rip({ fine: 'count' })} />
                    <Chip
                      testo="In una data"
                      attivo={r.fine === 'end_date'}
                      onPress={() => rip({ fine: 'end_date', finoAl: r.finoAl || giornoChiave(new Date(m.inizio.getTime() + 30 * 86_400_000)) })}
                    />
                  </View>
                  {r.fine === 'count' ? (
                    <View style={s.riga}>
                      <Contatore valore={r.volte} cambia={(n) => rip({ volte: n })} max={999} />
                      <Text style={[s.voce, { color: c.testo }]}>{r.volte === 1 ? 'volta' : 'volte'}</Text>
                    </View>
                  ) : r.fine === 'end_date' ? (
                    <View style={s.riga}>
                      <Text style={[s.voceCorta, { color: c.testo2 }]}>Fino al</Text>
                      <Bottone testo={giornoBreve(new Date(`${r.finoAl}T12:00:00`))} onPress={() => setAperto('finoAl')} />
                    </View>
                  ) : null}
                </>
              ) : (
                <Text style={[s.sotto, { color: c.testo3 }]}>Non si ripete</Text>
              )}
            </Sezione>
          ) : null}

          {opzioni.promemoria.length ? (
            <Sezione titolo="Promemoria">
              <View style={s.chips}>
                {opzioni.promemoria.map((p) => {
                  const attivo = m.promemoria.includes(p.id)
                  return (
                    <Chip
                      key={p.id}
                      testo={p.nome}
                      attivo={attivo}
                      onPress={() => cambia({ promemoria: attivo ? m.promemoria.filter((x) => x !== p.id) : [...m.promemoria, p.id] })}
                    />
                  )
                })}
              </View>
            </Sezione>
          ) : null}

          {opzioni.etichette.length ? (
            <Sezione titolo="Etichette">
              <View style={s.chips}>
                {opzioni.etichette.map((e) => {
                  const attivo = m.etichette.includes(e.id)
                  return (
                    <Chip
                      key={e.id}
                      testo={e.nome}
                      attivo={attivo}
                      onPress={() => cambia({ etichette: attivo ? m.etichette.filter((x) => x !== e.id) : [...m.etichette, e.id] })}
                    />
                  )
                })}
              </View>
            </Sezione>
          ) : null}

          <Sezione titolo="Visibilità">
            {opzioni.calendari.length > 1 ? (
              <>
                <Text style={[s.sotto, { color: c.testo2 }]}>Calendario</Text>
                <View style={s.chips}>
                  {opzioni.calendari.map((k) => (
                    <Chip key={k.id} testo={k.nome} attivo={m.calendarioId === k.id} onPress={() => cambia({ calendarioId: k.id })} />
                  ))}
                </View>
              </>
            ) : null}
            {opzioni.privacy.length ? (
              <>
                <Text style={[s.sotto, { color: c.testo2 }]}>Privacy</Text>
                <View style={s.chips}>
                  {opzioni.privacyFacoltativa ? (
                    <Chip testo="Predefinita" attivo={!m.privacy} onPress={() => cambia({ privacy: '' })} />
                  ) : null}
                  {opzioni.privacy.map((p) => (
                    <Chip key={p.valore} testo={p.nome} attivo={m.privacy === p.valore} onPress={() => cambia({ privacy: p.valore })} />
                  ))}
                </View>
              </>
            ) : null}
            {opzioni.mostraCome.length ? (
              <>
                <Text style={[s.sotto, { color: c.testo2 }]}>Mostra come</Text>
                <View style={s.chips}>
                  {opzioni.mostraCome.map((p) => (
                    <Chip key={p.valore} testo={p.nome} attivo={m.mostraCome === p.valore} onPress={() => cambia({ mostraCome: p.valore })} />
                  ))}
                </View>
              </>
            ) : null}
          </Sezione>

          <Sezione titolo="Descrizione">
            <TextInput
              style={[campo, s.area]}
              value={m.descrizione}
              onChangeText={(t) => cambia({ descrizione: t })}
              placeholder="Visibile agli invitati"
              placeholderTextColor={c.testo3}
              multiline
              textAlignVertical="top"
              accessibilityLabel="Descrizione"
            />
          </Sezione>

          {opzioni.haNote ? (
            <Sezione titolo="Note interne">
              <TextInput
                style={[campo, s.area]}
                value={m.note}
                onChangeText={(t) => cambia({ note: t })}
                placeholder="Solo per i colleghi"
                placeholderTextColor={c.testo3}
                multiline
                textAlignVertical="top"
                accessibilityLabel="Note interne"
              />
            </Sezione>
          ) : null}

          <Pulsante testo="Salva" onPress={() => void salva()} occupato={salvo} />
        </ScrollView>
      </KeyboardAvoidingView>

      <SceltaGiorno
        aperto={aperto === 'giornoInizio'}
        titolo={m.tuttoIlGiorno ? 'Primo giorno' : 'Giorno di inizio'}
        valore={m.inizio}
        chiudi={() => setAperto(null)}
        scegli={nuovoInizio}
      />
      <SceltaGiorno
        aperto={aperto === 'giornoFine'}
        titolo={m.tuttoIlGiorno ? 'Ultimo giorno' : 'Giorno di fine'}
        valore={m.fine}
        chiudi={() => setAperto(null)}
        scegli={nuovaFine}
      />
      <SceltaOra aperto={aperto === 'oraInizio'} titolo="Ora di inizio" valore={m.inizio} chiudi={() => setAperto(null)} scegli={nuovoInizio} />
      <SceltaOra aperto={aperto === 'oraFine'} titolo="Ora di fine" valore={m.fine} chiudi={() => setAperto(null)} scegli={nuovaFine} />
      {r ? (
        <SceltaGiorno
          aperto={aperto === 'finoAl'}
          titolo="Ultima ripetizione"
          valore={new Date(`${r.finoAl || giornoChiave(m.inizio)}T12:00:00`)}
          chiudi={() => setAperto(null)}
          scegli={(d) => rip({ finoAl: giornoChiave(d) })}
        />
      ) : null}
      <CercaPersone
        aperto={aperto === 'invitati'}
        server={server}
        tipo="invitati"
        scelti={m.invitati}
        chiudi={() => setAperto(null)}
        tocca={(p) =>
          setM((x) =>
            x ? { ...x, invitati: x.invitati.some((y) => y.id === p.id) ? x.invitati.filter((y) => y.id !== p.id) : [...x.invitati, p] } : x,
          )
        }
      />
      <CercaPersone
        aperto={aperto === 'organizzatore'}
        server={server}
        tipo="organizzatore"
        scelti={organizzatore ? [organizzatore] : []}
        chiudi={() => setAperto(null)}
        tocca={(p) => {
          setOrganizzatore(p)
          cambia({ organizzatoreId: p.id })
        }}
      />
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1 },
  contenuto: { padding: spazio.l, gap: spazio.m, paddingBottom: spazio.xxl },
  vuoto: { fontSize: 15, textAlign: 'center', marginTop: spazio.xl, paddingHorizontal: spazio.xl },
  campo: { borderWidth: 1, borderRadius: raggio.m, paddingHorizontal: spazio.m, paddingVertical: 12, fontSize: 16 },
  titolo: { fontSize: 20, fontWeight: '700', paddingHorizontal: spazio.l },
  area: { minHeight: 96 },
  scheda: { borderWidth: 1, borderRadius: raggio.l, padding: spazio.m, gap: spazio.m },
  schedaTesta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spazio.s, minHeight: 24 },
  etichetta: { flex: 1, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  riga: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, flexWrap: 'wrap' },
  voce: { flex: 1, fontSize: 16, fontWeight: '600' },
  voceCorta: { minWidth: 48, fontSize: 15, fontWeight: '600' },
  bottone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: raggio.m,
    borderWidth: 1,
  },
  bottoneTesto: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spazio.s },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1 },
  chipTesto: { fontSize: 14, fontWeight: '700' },
  persona: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, minHeight: 44 },
  nome: { fontSize: 15, fontWeight: '600' },
  sotto: { fontSize: 13 },
  linea: { height: StyleSheet.hairlineWidth },
  contatore: { flexDirection: 'row', alignItems: 'center', gap: spazio.s },
  passo: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  contatoreTesto: { minWidth: 32, textAlign: 'center', fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  giorni: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  giorno: { flex: 1, maxWidth: 44, aspectRatio: 1, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  giornoTesto: { fontSize: 15, fontWeight: '800' },
})
