/**
 * Un ticket dell'Helpdesk, tutto su una schermata: fase e priorita' in alto,
 * cliente con chiamata ed email, chi lo segue (team, assegnatario, categoria,
 * etichette), descrizione, ore con il timer, e la conversazione con risposta al
 * cliente o nota interna (anche con foto). Ogni modifica va subito in Odoo.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  ActionSheetIOS,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import { scansionaScontrino, scegliFotoScontrino } from '../../../modules/gestable-nativo'
import { t } from '../../i18n'
import {
  aggiorna,
  aggiungiOre,
  avviaTimer,
  conversazione,
  elenco,
  fasi as caricaFasi,
  fermaTimer,
  ore as caricaOre,
  scrivi,
  seguiTicket,
  struttura,
  ticket as caricaTicket,
  type DettaglioTicket,
  type Fase,
  type Messaggio,
  type Modifica,
  type RigaOre,
  type Scelta,
  type Struttura,
} from '../../odoo/helpdesk'
import { percorsoRecord, urlAvatar } from '../../odoo/lavoro'
import { quandoBreve } from '../../odoo/testo'
import { Avatar } from '../../ui/Avatar'
import { Caricamento } from '../../ui/Caricamento'
import { CercaPersone } from '../../ui/calendario/CercaPersone'
import { chiamaNumero } from '../../ui/chiama'
import { inviaOdoo, rottaOdoo } from '../../ui/comandiOdoo'
import { Foglio } from '../../ui/Foglio'
import { colorePriorita, oreMinuti, quantoFa } from '../../ui/formatoHelpdesk'
import { Pulsante } from '../../ui/Pulsante'
import { SceltaElenco } from '../../ui/SceltaElenco'
import { Testata } from '../../ui/Testata'
import { raggio, spazio, useColori } from '../../ui/tema'
import { useApp } from '../../voip/Contesto'

type Elenco = 'team' | 'categoria' | 'etichette'
type Persone = 'cliente' | 'assegnato'

const TEMPI = [0.25, 0.5, 1, 1.5, 2]

function oggiIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** «1:30», «1,5» o «90m» → ore decimali. */
function leggiOre(testo: string): number {
  const x = testo.trim().toLowerCase()
  const hm = /^(\d+):(\d{1,2})$/.exec(x)
  if (hm) {
    return Number(hm[1]) + Number(hm[2]) / 60
  }
  const min = /^(\d+)\s*m/.exec(x)
  if (min) {
    return Number(min[1]) / 60
  }
  const n = parseFloat(x.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function errore(titolo: string, e: unknown) {
  Alert.alert(titolo, e instanceof Error ? e.message : String(e))
}

export default function SchedaTicket() {
  const c = useColori()
  const router = useRouter()
  const { id: idTesto } = useLocalSearchParams<{ id: string }>()
  const id = Number(idTesto)
  const { sessione } = useApp()
  const server = sessione?.server || ''
  const uid = sessione?.utente.uid || 0

  const [tk, setTk] = useState<DettaglioTicket | null>(null)
  const [st, setSt] = useState<Struttura | null>(null)
  const [elencoFasi, setElencoFasi] = useState<Fase[]>([])
  const [messaggi, setMessaggi] = useState<Messaggio[] | null>(null)
  const [righeOre, setRigheOre] = useState<RigaOre[]>([])
  const [problema, setProblema] = useState('')

  const [tutta, setTutta] = useState(false)
  const [foglioElenco, setFoglioElenco] = useState<Elenco | null>(null)
  const [voci, setVoci] = useState<Scelta[]>([])
  const [foglioPersone, setFoglioPersone] = useState<Persone | null>(null)
  const [modifica, setModifica] = useState(false)
  const [titolo, setTitolo] = useState('')
  const [descrizione, setDescrizione] = useState('')
  const [foglioOre, setFoglioOre] = useState(false)
  const [tempo, setTempo] = useState('')
  const [cosa, setCosa] = useState('')
  const [allegato, setAllegato] = useState<{ id: number; nome: string } | null>(null)

  const [nota, setNota] = useState(false)
  const [testo, setTesto] = useState('')
  const [foto, setFoto] = useState<string[]>([])
  const [occupato, setOccupato] = useState('')
  const [ora, setOra] = useState(() => Date.now())

  const ricarica = useCallback(async () => {
    if (!server || !id) {
      return
    }
    try {
      const [s, r] = await Promise.all([struttura(server), caricaTicket(server, id)])
      setSt(s)
      setTk(r)
      setProblema('')
      if (r) {
        const [f, m, o] = await Promise.all([
          caricaFasi(server, r.teamId).catch(() => [] as Fase[]),
          conversazione(server, id).catch(() => [] as Messaggio[]),
          s.ore ? caricaOre(server, id).catch(() => [] as RigaOre[]) : Promise.resolve([] as RigaOre[]),
        ])
        setElencoFasi(f)
        setMessaggi(m)
        setRigheOre(o)
      }
    } catch (e) {
      setProblema(e instanceof Error ? e.message : String(e))
    }
  }, [server, id])

  useFocusEffect(
    useCallback(() => {
      void ricarica()
    }, [ricarica]),
  )

  // Il timer in corso si aggiorna ogni 30 secondi.
  const inCorso = righeOre.find((r) => r.inCorso)?.inCorso || null
  useEffect(() => {
    if (!inCorso) {
      return
    }
    const x = setInterval(() => setOra(Date.now()), 30_000)
    return () => clearInterval(x)
  }, [inCorso])

  async function cambia(m: Modifica, ottimista?: Partial<DettaglioTicket>) {
    if (!tk) {
      return
    }
    const prima = tk
    if (ottimista) {
      setTk({ ...tk, ...ottimista })
    }
    try {
      await aggiorna(server, tk.id, m)
      await ricarica()
    } catch (e) {
      setTk(prima)
      errore(t('helpdesk.nonSalvato'), e)
    }
  }

  async function apriElenco(cosa: Elenco) {
    setVoci([])
    setFoglioElenco(cosa)
    setVoci(await elenco(server, cosa).catch(() => []))
  }

  function scegliElenco(ids: number[]) {
    if (!tk || !foglioElenco) {
      return
    }
    const nome = (i: number) => voci.find((v) => v.id === i)?.nome || ''
    if (foglioElenco === 'team') {
      void cambia({ teamId: ids[0] || false }, { teamId: ids[0] || null, team: ids[0] ? nome(ids[0]) : '' })
    } else if (foglioElenco === 'categoria') {
      void cambia({ categoriaId: ids[0] || false }, { categoria: ids[0] ? { id: ids[0], nome: nome(ids[0]) } : null })
    } else {
      void cambia({ etichette: ids }, { etichette: ids.map((i) => ({ id: i, nome: nome(i) })) })
    }
  }

  function apriInOdoo() {
    inviaOdoo({ tipo: 'apri', percorso: percorsoRecord('helpdesk.ticket', id) })
    router.dismissTo(rottaOdoo())
  }

  async function segui() {
    if (!tk) {
      return
    }
    const nuovo = !tk.segue
    setTk({ ...tk, segue: nuovo })
    try {
      await seguiTicket(server, uid, tk.id, nuovo)
    } catch (e) {
      setTk({ ...tk })
      errore(t('helpdesk.nonSalvato'), e)
    }
  }

  async function timer() {
    if (!tk) {
      return
    }
    setOccupato('timer')
    try {
      if (tk.timer === 'stop') {
        await fermaTimer(server, tk.id)
      } else {
        await avviaTimer(server, tk, '')
      }
      await ricarica()
    } catch (e) {
      errore(t('helpdesk.oreNonSalvate'), e)
    }
    setOccupato('')
  }

  async function registraOre() {
    if (!tk) {
      return
    }
    const n = leggiOre(tempo)
    if (n <= 0) {
      return
    }
    setOccupato('ore')
    try {
      await aggiungiOre(server, tk, n, cosa, oggiIso())
      setFoglioOre(false)
      setTempo('')
      setCosa('')
      await ricarica()
    } catch (e) {
      errore(t('helpdesk.oreNonSalvate'), e)
    }
    setOccupato('')
  }

  async function salvaTesto() {
    if (!titolo.trim()) {
      Alert.alert(t('helpdesk.nonSalvato'), t('helpdesk.scriviTitolo'))
      return
    }
    setModifica(false)
    await cambia({ titolo, descrizione }, { titolo: titolo.trim(), descrizione })
  }

  function aggiungiFoto() {
    const prendi = async (fonte: 'scanner' | 'galleria') => {
      try {
        const nuove = fonte === 'scanner' ? await scansionaScontrino() : await scegliFotoScontrino()
        setFoto((f) => [...f, ...nuove])
      } catch (e) {
        errore(t('helpdesk.aggiungiFoto'), e)
      }
    }
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [t('helpdesk.fotoScanner'), t('helpdesk.fotoGalleria'), t('comune.annulla')], cancelButtonIndex: 2 },
        (i) => {
          if (i === 0) {
            void prendi('scanner')
          } else if (i === 1) {
            void prendi('galleria')
          }
        },
      )
    } else {
      void prendi('galleria')
    }
  }

  async function invia() {
    if (!tk || (!testo.trim() && !foto.length)) {
      return
    }
    setOccupato('invia')
    try {
      await scrivi(server, tk.id, testo, nota, foto)
      setTesto('')
      setFoto([])
      setMessaggi(await conversazione(server, tk.id).catch(() => messaggi))
    } catch (e) {
      errore(t('helpdesk.nonInviato'), e)
    }
    setOccupato('')
  }

  if (!tk) {
    return (
      <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top']}>
        <Testata titolo={t('helpdesk.ticket')} />
        {problema ? <Text style={[s.problema, { color: c.rosso }]}>{problema}</Text> : <Caricamento style={{ marginTop: spazio.xxl }} />}
      </SafeAreaView>
    )
  }

  const mio = tk.assegnato?.[0] === uid
  const conOre = !!st?.ore
  const conTimer = !!st?.timer && tk.timer !== null && !!tk.progetto
  const minutiTimer = inCorso ? Math.max(0, Math.round((ora - inCorso.getTime()) / 60_000)) : 0

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top']}>
      <Testata
        titolo={tk.numero || t('helpdesk.ticket')}
        sottotitolo={tk.team || undefined}
        destra={
          <Pressable
            onPress={() => void segui()}
            hitSlop={10}
            style={s.tasto}
            accessibilityRole="switch"
            accessibilityState={{ checked: tk.segue }}
            accessibilityLabel={tk.segue ? t('helpdesk.seguito') : t('helpdesk.segui')}
          >
            <Ionicons name={tk.segue ? 'notifications' : 'notifications-outline'} size={24} color={tk.segue ? c.primario : c.testo2} />
          </Pressable>
        }
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.contenuto} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          {/* Titolo e priorita' */}
          <Pressable
            onPress={() => {
              setTitolo(tk.titolo)
              setDescrizione(tk.descrizione)
              setModifica(true)
            }}
            accessibilityRole="button"
            accessibilityHint={t('helpdesk.modifica')}
          >
            <Text style={[s.titolo, { color: c.testo }]}>{tk.titolo}</Text>
          </Pressable>
          <View style={s.sottoTitolo}>
            <View style={s.stelle} accessibilityLabel={t('helpdesk.priorita')}>
              {[1, 2, 3].map((n) => (
                <Pressable
                  key={n}
                  onPress={() => void cambia({ priorita: tk.priorita === n ? n - 1 : n }, { priorita: tk.priorita === n ? n - 1 : n })}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('helpdesk.priorita')} ${n}`}
                >
                  <Ionicons name={tk.priorita >= n ? 'star' : 'star-outline'} size={22} color={tk.priorita >= n ? colorePriorita(tk.priorita, c) : c.testo3} />
                </Pressable>
              ))}
            </View>
            <Text style={[s.quando, { color: c.testo3 }]}>{quantoFa(tk.creato)}</Text>
          </View>

          {tk.chiuso ? (
            <View style={[s.avviso, { backgroundColor: c.verdeTenue }]}>
              <Ionicons name="checkmark-circle" size={18} color={c.verde} />
              <Text style={[s.avvisoTesto, { color: c.verde }]}>{t('helpdesk.chiusoNota')}</Text>
            </View>
          ) : null}

          {/* Fasi */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.fasi} style={s.fasiRiga}>
            {elencoFasi.map((f) => {
              const attiva = f.id === tk.faseId
              return (
                <Pressable
                  key={f.id}
                  onPress={() => !attiva && void cambia({ faseId: f.id }, { faseId: f.id, fase: f.nome, chiuso: f.chiusa })}
                  style={[s.fase, { backgroundColor: attiva ? c.primario : c.superficie, borderColor: attiva ? c.primario : c.bordo }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: attiva }}
                >
                  {f.chiusa ? <Ionicons name="checkmark-done" size={14} color={attiva ? '#FFFFFF' : c.testo2} /> : null}
                  <Text style={[s.faseTesto, { color: attiva ? '#FFFFFF' : c.testo }]} numberOfLines={1}>
                    {f.nome}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>

          {/* Cliente */}
          <Sezione titolo={t('helpdesk.cliente')}>
            <Pressable onPress={() => setFoglioPersone('cliente')} style={s.riga} accessibilityRole="button">
              {tk.clienteId ? <Avatar nome={tk.cliente} lato={40} url={urlAvatar(server, 'res.partner', tk.clienteId)} logo={tk.clienteAzienda} /> : <Avatar nome="?" lato={40} icona="person-outline" />}
              <View style={{ flex: 1 }}>
                <Text style={[s.valore, { color: tk.cliente ? c.testo : c.testo3 }]} numberOfLines={1}>
                  {tk.cliente || t('helpdesk.nessunCliente')}
                </Text>
                {tk.email ? (
                  <Text style={[s.sotto, { color: c.testo2 }]} numberOfLines={1}>
                    {tk.email}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.testo3} />
            </Pressable>
            {tk.telefono || tk.email || tk.clienteId ? (
              <View style={s.azioni}>
                {tk.telefono ? <Azione icona="call" testo={t('helpdesk.chiama')} onPress={() => chiamaNumero(sessione, tk.telefono, tk.cliente)} /> : null}
                {tk.email ? <Azione icona="mail" testo={t('helpdesk.email')} onPress={() => void Linking.openURL(`mailto:${tk.email}`)} /> : null}
                {tk.clienteId ? (
                  <Azione
                    icona="person-circle"
                    testo={t('helpdesk.scheda')}
                    onPress={() => router.push({ pathname: '/contatti/[id]', params: { id: String(tk.clienteId) } })}
                  />
                ) : null}
              </View>
            ) : null}
          </Sezione>

          {/* Chi lo segue */}
          <Sezione>
            <Campo etichetta={t('helpdesk.assegnato')} onPress={() => setFoglioPersone('assegnato')}>
              {tk.assegnato ? (
                <View style={s.persona}>
                  <Avatar nome={tk.assegnato[1]} lato={26} url={urlAvatar(server, 'res.users', tk.assegnato[0])} />
                  <Text style={[s.valore, { color: c.testo, flexShrink: 1 }]} numberOfLines={1}>
                    {tk.assegnato[1]}
                  </Text>
                </View>
              ) : (
                <Text style={[s.valore, { color: c.testo3 }]}>{t('helpdesk.nonAssegnato')}</Text>
              )}
            </Campo>
            {!mio ? (
              <Pressable
                onPress={() => void cambia({ assegnato: uid }, { assegnato: [uid, sessione?.utente.name || ''] })}
                style={({ pressed }) => [s.aMe, { backgroundColor: pressed ? c.primario : c.primarioTenue }]}
                accessibilityRole="button"
              >
                <Ionicons name="hand-left" size={16} color={c.primario} />
                <Text style={[s.aMeTesto, { color: c.primario }]} numberOfLines={1}>
                  {t('helpdesk.assegnaAMe')}
                </Text>
              </Pressable>
            ) : null}
            <Campo etichetta={t('helpdesk.team')} valore={tk.team} onPress={() => void apriElenco('team')} />
            {st?.categoria ? <Campo etichetta={t('helpdesk.categoria')} valore={tk.categoria?.nome} onPress={() => void apriElenco('categoria')} /> : null}
            <Campo etichetta={t('helpdesk.etichette')} onPress={() => void apriElenco('etichette')}>
              {tk.etichette.length ? (
                <View style={s.etichette}>
                  {tk.etichette.map((e) => (
                    <View key={e.id} style={[s.etichetta, { backgroundColor: c.superficie2 }]}>
                      <Text style={[s.etichettaTesto, { color: c.testo }]} numberOfLines={1}>
                        {e.nome}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[s.valore, { color: c.testo3 }]}>{t('helpdesk.nessuna')}</Text>
              )}
            </Campo>
            {tk.canale ? <Campo etichetta={t('helpdesk.canale')} valore={tk.canale} /> : null}
            {tk.progetto ? <Campo etichetta={t('helpdesk.progetto')} valore={tk.progetto.nome} /> : null}
            {tk.attivita ? <Campo etichetta={t('helpdesk.attivitaProgetto')} valore={tk.attivita.nome} /> : null}
            {tk.vendite.length ? <Campo etichetta={t('helpdesk.vendite')} valore={tk.vendite.map((v) => v.nome).join(', ')} /> : null}
          </Sezione>

          {/* Descrizione */}
          {tk.descrizione ? (
            <Sezione titolo={t('helpdesk.descrizione')}>
              <Text style={[s.descrizione, { color: c.testo }]} numberOfLines={tutta ? undefined : 8} selectable>
                {tk.descrizione}
              </Text>
              {tk.descrizione.length > 360 || tk.descrizione.split('\n').length > 8 ? (
                <Pressable onPress={() => setTutta(!tutta)} hitSlop={8} accessibilityRole="button">
                  <Text style={[s.link, { color: c.primario }]}>{tutta ? t('helpdesk.mostraMeno') : t('helpdesk.mostraTutto')}</Text>
                </Pressable>
              ) : null}
            </Sezione>
          ) : null}

          {/* Ore */}
          {conOre ? (
            <Sezione titolo={t('helpdesk.ore')}>
              <Text style={[s.valore, { color: c.testo }]}>
                {tk.orePreviste
                  ? t('helpdesk.oreFattePreviste', { fatte: oreMinuti(tk.oreFatte), previste: oreMinuti(tk.orePreviste) })
                  : t('helpdesk.oreFatte', { fatte: oreMinuti(tk.oreFatte) })}
              </Text>
              {tk.orePreviste ? (
                <View style={[s.barra, { backgroundColor: c.superficie2 }]}>
                  <View
                    style={[
                      s.barraPiena,
                      { width: `${Math.min(100, (tk.oreFatte / tk.orePreviste) * 100)}%`, backgroundColor: tk.oreFatte > tk.orePreviste ? c.rosso : c.primario },
                    ]}
                  />
                </View>
              ) : null}
              {tk.progetto ? (
                <View style={{ marginTop: spazio.m }}>
                  {conTimer ? (
                    <Pulsante
                      testo={tk.timer === 'stop' ? t('helpdesk.fermaTimer') : t('helpdesk.avviaTimer')}
                      variante={tk.timer === 'stop' ? 'pericolo' : 'primario'}
                      occupato={occupato === 'timer'}
                      onPress={() => void timer()}
                    />
                  ) : null}
                  {inCorso ? (
                    <Text style={[s.timer, { color: c.rosso }]}>{t('helpdesk.timerInCorso', { tempo: oreMinuti(minutiTimer / 60) })}</Text>
                  ) : null}
                  <Pulsante testo={t('helpdesk.registraOre')} variante="tenue" onPress={() => setFoglioOre(true)} />
                </View>
              ) : (
                <Text style={[s.sotto, { color: c.testo2, marginTop: spazio.s }]}>{t('helpdesk.oreSenzaProgetto')}</Text>
              )}
              {righeOre.length ? (
                <View style={{ marginTop: spazio.s }}>
                  {righeOre.slice(0, 8).map((r) => (
                    <View key={r.id} style={[s.rigaOre, { borderColor: c.bordo }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.sotto, { color: c.testo }]} numberOfLines={1}>
                          {r.descrizione || r.persona}
                        </Text>
                        <Text style={[s.piccolo, { color: c.testo3 }]} numberOfLines={1}>
                          {[r.data.split('-').reverse().join('.'), r.descrizione ? r.persona : ''].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <Text style={[s.oreNumero, { color: r.inCorso ? c.rosso : c.testo }]}>{r.inCorso ? '●' : oreMinuti(r.ore)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </Sezione>
          ) : null}

          {/* Conversazione */}
          <Sezione titolo={t('helpdesk.conversazione')}>
            <View style={[s.segmenti, { backgroundColor: c.superficie2 }]}>
              {[false, true].map((n) => (
                <Pressable
                  key={String(n)}
                  onPress={() => setNota(n)}
                  style={[s.segmento, nota === n && { backgroundColor: n ? '#F4B400' : c.primario }]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: nota === n }}
                >
                  <Ionicons name={n ? 'lock-closed' : 'mail'} size={14} color={nota === n ? '#FFFFFF' : c.testo2} />
                  <Text style={[s.segmentoTesto, { color: nota === n ? '#FFFFFF' : c.testo2 }]} numberOfLines={1}>
                    {n ? t('helpdesk.nota') : t('helpdesk.rispondi')}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={testo}
              onChangeText={setTesto}
              placeholder={nota ? t('helpdesk.scriviNota') : t('helpdesk.scriviRisposta')}
              placeholderTextColor={c.testo3}
              multiline
              style={[s.composer, { color: c.testo, backgroundColor: nota ? 'rgba(244,180,0,0.10)' : c.sfondo, borderColor: c.bordo }]}
            />
            {foto.length ? (
              <ScrollView horizontal contentContainerStyle={{ gap: spazio.s, paddingVertical: spazio.s }}>
                {foto.map((f, i) => (
                  <Pressable key={f} onPress={() => setFoto(foto.filter((_, j) => j !== i))} accessibilityLabel={t('comune.elimina')}>
                    <Image source={{ uri: f }} style={s.miniFoto} />
                    <View style={[s.togli, { backgroundColor: c.rosso }]}>
                      <Ionicons name="close" size={12} color="#FFFFFF" />
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            <View style={s.invioRiga}>
              <Pressable
                onPress={aggiungiFoto}
                hitSlop={8}
                style={[s.tondo, { backgroundColor: c.superficie2 }]}
                accessibilityRole="button"
                accessibilityLabel={t('helpdesk.aggiungiFoto')}
              >
                <Ionicons name="camera" size={20} color={c.testo} />
              </Pressable>
              <Text style={[s.piccolo, { flex: 1, color: c.testo3 }]} numberOfLines={2}>
                {nota ? t('helpdesk.notaAvviso') : t('helpdesk.rispostaAvviso')}
              </Text>
              <Pressable
                onPress={() => void invia()}
                disabled={occupato === 'invia' || (!testo.trim() && !foto.length)}
                style={[s.invia, { backgroundColor: nota ? '#F4B400' : c.primario, opacity: !testo.trim() && !foto.length ? 0.4 : 1 }]}
                accessibilityRole="button"
              >
                {occupato === 'invia' ? <Caricamento dimensione={18} /> : <Ionicons name="send" size={16} color="#FFFFFF" />}
                <Text style={s.inviaTesto} numberOfLines={1}>
                  {t('helpdesk.invia')}
                </Text>
              </Pressable>
            </View>

            {messaggi === null ? (
              <Caricamento style={{ marginTop: spazio.l }} />
            ) : messaggi.length === 0 ? (
              <Text style={[s.sotto, { color: c.testo3, marginTop: spazio.m }]}>{t('helpdesk.nessunMessaggio')}</Text>
            ) : (
              messaggi.map((m) => (
                <View key={m.id} style={[s.messaggio, { borderColor: c.bordo }]}>
                  <Avatar nome={m.autore || '?'} lato={32} url={m.autoreId ? urlAvatar(server, 'res.partner', m.autoreId) : undefined} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={s.messaggioTesta}>
                      <Text style={[s.autore, { color: c.testo }]} numberOfLines={1}>
                        {m.autore}
                      </Text>
                      {m.nota ? (
                        <View style={[s.bollino, { backgroundColor: 'rgba(244,180,0,0.18)' }]}>
                          <Text style={[s.bollinoTesto, { color: '#B07F00' }]}>{t('helpdesk.notaInterna')}</Text>
                        </View>
                      ) : m.email ? (
                        <View style={[s.bollino, { backgroundColor: c.primarioTenue }]}>
                          <Text style={[s.bollinoTesto, { color: c.primario }]}>{t('helpdesk.viaEmail')}</Text>
                        </View>
                      ) : null}
                      <Text style={[s.piccolo, { color: c.testo3, marginLeft: 'auto' }]}>{quandoBreve(m.data)}</Text>
                    </View>
                    {m.testo ? (
                      <Text style={[s.messaggioTesto, { color: c.testo }]} selectable>
                        {m.testo}
                      </Text>
                    ) : null}
                    {m.tracciamento ? <Text style={[s.piccolo, { color: c.testo2 }]}>{m.tracciamento}</Text> : null}
                    {m.allegati.length ? (
                      <View style={s.allegati}>
                        {m.allegati.map((a) =>
                          a.tipo.startsWith('image/') ? (
                            <Pressable key={a.id} onPress={() => setAllegato(a)} accessibilityLabel={a.nome}>
                              <Image source={{ uri: `${server}/web/image/${a.id}?width=240` }} style={[s.miniFoto, { backgroundColor: c.superficie2 }]} />
                            </Pressable>
                          ) : (
                            <Pressable
                              key={a.id}
                              onPress={() => setAllegato(a)}
                              style={[s.file, { backgroundColor: c.superficie2 }]}
                              accessibilityRole="button"
                            >
                              <Ionicons name="document-attach" size={16} color={c.primario} />
                              <Text style={[s.piccolo, { color: c.testo, maxWidth: 180 }]} numberOfLines={1}>
                                {a.nome}
                              </Text>
                            </Pressable>
                          ),
                        )}
                      </View>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </Sezione>

          <Pulsante testo={t('helpdesk.apriInOdoo')} variante="tenue" onPress={apriInOdoo} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Fogli */}
      <SceltaElenco
        aperto={foglioElenco !== null}
        titolo={foglioElenco === 'team' ? t('helpdesk.team') : foglioElenco === 'categoria' ? t('helpdesk.categoria') : t('helpdesk.etichette')}
        voci={voci}
        scelte={
          foglioElenco === 'team'
            ? tk.teamId
              ? [tk.teamId]
              : []
            : foglioElenco === 'categoria'
              ? tk.categoria
                ? [tk.categoria.id]
                : []
              : tk.etichette.map((e) => e.id)
        }
        multipla={foglioElenco === 'etichette'}
        vuota={foglioElenco === 'etichette' ? undefined : t('helpdesk.nessuna')}
        chiudi={() => setFoglioElenco(null)}
        scegli={scegliElenco}
      />

      <CercaPersone
        aperto={foglioPersone !== null}
        server={server}
        tipo={foglioPersone === 'cliente' ? 'invitati' : 'organizzatore'}
        titolo={foglioPersone === 'cliente' ? t('helpdesk.cliente') : t('helpdesk.assegnato')}
        singolo
        scelti={[]}
        chiudi={() => setFoglioPersone(null)}
        tocca={(p) => {
          if (foglioPersone === 'cliente') {
            void cambia({ clienteId: p.id }, { clienteId: p.id, cliente: p.nome, email: p.email, clienteAzienda: !!p.eAzienda })
          } else {
            void cambia({ assegnato: p.id }, { assegnato: [p.id, p.nome] })
          }
          setFoglioPersone(null)
        }}
      />

      <Foglio aperto={modifica} titolo={t('helpdesk.modifica')} chiudi={() => setModifica(false)} fatto={t('comune.salva')}>
        <ScrollView contentContainerStyle={s.foglio} keyboardShouldPersistTaps="handled">
          <Text style={[s.etichettaCampo, { color: c.testo2 }]}>{t('helpdesk.titoloTicket')}</Text>
          <TextInput value={titolo} onChangeText={setTitolo} style={[s.input, { color: c.testo, backgroundColor: c.superficie, borderColor: c.bordo }]} />
          <Text style={[s.etichettaCampo, { color: c.testo2 }]}>{t('helpdesk.descrizione')}</Text>
          <TextInput
            value={descrizione}
            onChangeText={setDescrizione}
            multiline
            style={[s.input, s.area, { color: c.testo, backgroundColor: c.superficie, borderColor: c.bordo }]}
          />
          <Pulsante testo={t('comune.salva')} onPress={() => void salvaTesto()} />
        </ScrollView>
      </Foglio>

      <Foglio aperto={foglioOre} titolo={t('helpdesk.registraOre')} chiudi={() => setFoglioOre(false)} fatto={t('comune.chiudi')}>
        <ScrollView contentContainerStyle={s.foglio} keyboardShouldPersistTaps="handled">
          <Text style={[s.etichettaCampo, { color: c.testo2 }]}>{t('helpdesk.quanteOre')}</Text>
          <View style={s.tempi}>
            {TEMPI.map((x) => {
              const scelto = Math.abs(leggiOre(tempo) - x) < 0.001
              return (
                <Pressable
                  key={x}
                  onPress={() => setTempo(oreMinuti(x))}
                  style={[s.tempo, { backgroundColor: scelto ? c.primario : c.superficie, borderColor: scelto ? c.primario : c.bordo }]}
                  accessibilityRole="button"
                >
                  <Text style={[s.tempoTesto, { color: scelto ? '#FFFFFF' : c.testo }]}>{oreMinuti(x)}</Text>
                </Pressable>
              )
            })}
          </View>
          <TextInput
            value={tempo}
            onChangeText={setTempo}
            placeholder="0:45"
            placeholderTextColor={c.testo3}
            keyboardType="numbers-and-punctuation"
            style={[s.input, { color: c.testo, backgroundColor: c.superficie, borderColor: c.bordo }]}
          />
          <Text style={[s.etichettaCampo, { color: c.testo2 }]}>{t('helpdesk.cosaHaiFatto')}</Text>
          <TextInput
            value={cosa}
            onChangeText={setCosa}
            multiline
            style={[s.input, s.area, { color: c.testo, backgroundColor: c.superficie, borderColor: c.bordo }]}
          />
          <Pulsante testo={t('helpdesk.registraOre')} occupato={occupato === 'ore'} onPress={() => void registraOre()} />
        </ScrollView>
      </Foglio>

      <Foglio aperto={allegato !== null} titolo={allegato?.nome || ''} chiudi={() => setAllegato(null)} fatto={t('comune.chiudi')}>
        {allegato ? (
          <WebView
            source={{ uri: `${server}/web/content/${allegato.id}` }}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            startInLoadingState
            renderLoading={() => <Caricamento style={StyleSheet.absoluteFill} />}
            style={{ flex: 1, backgroundColor: c.sfondo }}
          />
        ) : null}
      </Foglio>
    </SafeAreaView>
  )
}

function Sezione({ titolo, children }: { titolo?: string; children: ReactNode }) {
  const c = useColori()
  return (
    <View style={[s.sezione, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
      {titolo ? <Text style={[s.sezioneTitolo, { color: c.testo2 }]}>{titolo}</Text> : null}
      {children}
    </View>
  )
}

function Campo({ etichetta, valore, onPress, children }: { etichetta: string; valore?: string; onPress?: () => void; children?: ReactNode }) {
  const c = useColori()
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={s.campo} accessibilityRole={onPress ? 'button' : 'text'}>
      <Text style={[s.etichettaRiga, { color: c.testo2 }]} numberOfLines={1}>
        {etichetta}
      </Text>
      <View style={s.campoValore}>
        {children ?? (
          <Text style={[s.valore, { color: valore ? c.testo : c.testo3, textAlign: 'right' }]} numberOfLines={2}>
            {valore || t('helpdesk.nessuna')}
          </Text>
        )}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={c.testo3} /> : null}
    </Pressable>
  )
}

function Azione({ icona, testo, onPress }: { icona: keyof typeof Ionicons.glyphMap; testo: string; onPress: () => void }) {
  const c = useColori()
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.azione, { backgroundColor: pressed ? c.superficie2 : c.primarioTenue }]}
      accessibilityRole="button"
    >
      <Ionicons name={icona} size={20} color={c.primario} />
      <Text style={[s.azioneTesto, { color: c.primario }]} numberOfLines={1}>
        {testo}
      </Text>
    </Pressable>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1 },
  tasto: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  problema: { fontSize: 15, textAlign: 'center', marginTop: spazio.xl, paddingHorizontal: spazio.xl },
  contenuto: { padding: spazio.l, paddingBottom: spazio.xxl * 2, gap: spazio.m },
  titolo: { fontSize: 22, fontWeight: '800', lineHeight: 28 },
  sottoTitolo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -spazio.xs },
  stelle: { flexDirection: 'row', gap: spazio.xs },
  quando: { fontSize: 13 },
  avviso: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, padding: spazio.m, borderRadius: raggio.m },
  avvisoTesto: { fontSize: 15, fontWeight: '700' },
  fasiRiga: { marginHorizontal: -spazio.l },
  fasi: { gap: spazio.s, paddingHorizontal: spazio.l },
  fase: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, height: 36, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  faseTesto: { fontSize: 14, fontWeight: '600' },
  sezione: { padding: spazio.m, borderRadius: raggio.l, borderWidth: StyleSheet.hairlineWidth, gap: spazio.s },
  sezioneTitolo: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  riga: { flexDirection: 'row', alignItems: 'center', gap: spazio.m },
  valore: { fontSize: 16, fontWeight: '600' },
  sotto: { fontSize: 14 },
  piccolo: { fontSize: 12 },
  azioni: { flexDirection: 'row', gap: spazio.s, marginTop: spazio.xs },
  azione: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: spazio.s, borderRadius: raggio.m },
  azioneTesto: { fontSize: 12, fontWeight: '700' },
  campo: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, minHeight: 44 },
  etichettaRiga: { fontSize: 15, width: 110 },
  campoValore: { flex: 1, alignItems: 'flex-end' },
  persona: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, maxWidth: '100%' },
  aMe: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spazio.s, height: 40, borderRadius: 20 },
  aMeTesto: { fontSize: 15, fontWeight: '700' },
  etichette: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 4 },
  etichetta: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, maxWidth: 160 },
  etichettaTesto: { fontSize: 12, fontWeight: '600' },
  descrizione: { fontSize: 15, lineHeight: 22 },
  link: { fontSize: 15, fontWeight: '700' },
  barra: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barraPiena: { height: 6, borderRadius: 3 },
  timer: { fontSize: 14, fontWeight: '700', textAlign: 'center', marginBottom: spazio.m },
  rigaOre: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, paddingVertical: spazio.s, borderTopWidth: StyleSheet.hairlineWidth },
  oreNumero: { fontSize: 15, fontWeight: '700' },
  segmenti: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  segmento: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, borderRadius: 10 },
  segmentoTesto: { fontSize: 14, fontWeight: '700' },
  composer: { minHeight: 90, maxHeight: 220, fontSize: 16, padding: spazio.m, borderRadius: raggio.m, borderWidth: StyleSheet.hairlineWidth, textAlignVertical: 'top' },
  miniFoto: { width: 72, height: 72, borderRadius: raggio.m },
  togli: { position: 'absolute', top: -4, right: -4, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  invioRiga: { flexDirection: 'row', alignItems: 'center', gap: spazio.s },
  tondo: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  invia: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 40, borderRadius: 20 },
  inviaTesto: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  messaggio: { flexDirection: 'row', gap: spazio.s, paddingTop: spazio.m, marginTop: spazio.s, borderTopWidth: StyleSheet.hairlineWidth },
  messaggioTesta: { flexDirection: 'row', alignItems: 'center', gap: spazio.s },
  autore: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  bollino: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  bollinoTesto: { fontSize: 11, fontWeight: '700' },
  messaggioTesto: { fontSize: 15, lineHeight: 21 },
  allegati: { flexDirection: 'row', flexWrap: 'wrap', gap: spazio.s },
  file: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 32, borderRadius: 16 },
  foglio: { padding: spazio.l, gap: spazio.s },
  etichettaCampo: { fontSize: 14, fontWeight: '600', marginTop: spazio.s },
  input: { fontSize: 16, padding: spazio.m, borderRadius: raggio.m, borderWidth: StyleSheet.hairlineWidth },
  area: { minHeight: 140, textAlignVertical: 'top' },
  tempi: { flexDirection: 'row', flexWrap: 'wrap', gap: spazio.s },
  tempo: { paddingHorizontal: 16, height: 40, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  tempoTesto: { fontSize: 16, fontWeight: '700' },
})
