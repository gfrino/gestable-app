/**
 * La chiamata in corso: muto, tastierino, audio, attesa, trasferimento.
 *
 * Si apre da sola quando una chiamata parte o viene accettata e si chiude
 * quando finisce (vedi (tabs)/_layout.tsx). In alto chi c'e' dall'altra parte,
 * con la foto del contatto in Odoo (o della sua azienda) se ce l'ha, altrimenti
 * le iniziali. Sempre scura, come la schermata di chiamata del telefono.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { AudioDevice } from '@twilio/voice-react-native-sdk'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Animated, Easing, FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { t } from '../i18n'
import { colleghi, schedaContatto, type Collega, type SchedaContatto } from '../voip/api'
import { useApp, useTelefono } from '../voip/Contesto'
import { telefono, type Fase } from '../voip/telefono'
import { coloriChiamata, raggio, spazio, type Colori } from '../ui/tema'

// Chiavi dei testi, tradotti al momento di mostrarli (la lingua puo' cambiare).
const FASI: Record<Fase, string> = {
  composizione: 'telefono.fase.composizione',
  squillo: 'telefono.fase.squillo',
  'in-arrivo': 'telefono.fase.inArrivo',
  connessa: '',
  riconnessione: 'telefono.fase.riconnessione',
  finita: 'telefono.fase.finita',
}

const TONI = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']

function cronometro(inizio: number | null): string {
  if (!inizio) {
    return ''
  }
  const s = Math.max(0, Math.floor((Date.now() - inizio) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function nomeAudio(d: AudioDevice | null): string {
  if (!d) {
    return t('telefono.audio')
  }
  if (d.type === AudioDevice.Type.Speaker) {
    return t('telefono.vivavoce')
  }
  if (d.type === AudioDevice.Type.Earpiece) {
    return t('telefono.auricolare')
  }
  return d.name || t('telefono.bluetooth')
}

type PropsTasto = {
  icona: keyof typeof Ionicons.glyphMap
  testo: string
  attivo?: boolean
  onPress: () => void
  disabilitato?: boolean
  c: Colori
}

function Tasto({ icona, testo, attivo, onPress, disabilitato, c }: PropsTasto) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabilitato}
      style={s.azione}
      accessibilityRole="button"
      accessibilityLabel={testo}
      accessibilityState={{ selected: attivo, disabled: disabilitato }}
    >
      <View
        style={[
          s.azioneCerchio,
          { backgroundColor: attivo ? c.testo : 'rgba(255,255,255,0.10)', opacity: disabilitato ? 0.35 : 1 },
        ]}
      >
        <Ionicons name={icona} size={28} color={attivo ? c.sfondo : c.testo} />
      </View>
      <Text style={[s.azioneTesto, { color: c.testo2 }]} numberOfLines={1}>
        {testo}
      </Text>
    </Pressable>
  )
}

function iniziali(nome: string): string {
  const parole = nome.replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  if (!parole.length) {
    return ''
  }
  const prime = parole.length > 1 ? [parole[0], parole[parole.length - 1]] : [parole[0]]
  return prime.map((p) => p[0].toUpperCase()).join('')
}

const LATO_FOTO = 136
// Distanza fra il bordo alto (sotto la barra di stato) e il centro della foto.
const CENTRO_FOTO = 150
const ALONE = [900, 700, 520, 360, 240]

/** Foto (o iniziali) con due anelli che si allargano finche' la chiamata squilla. */
function Ritratto({ foto, nome, squilla, c }: { foto: string; nome: string; squilla: boolean; c: Colori }) {
  const [onda] = useState(() => new Animated.Value(0))

  useEffect(() => {
    if (!squilla) {
      onda.stopAnimation()
      onda.setValue(0)
      return
    }
    const giro = Animated.loop(
      Animated.timing(onda, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    )
    giro.start()
    return () => giro.stop()
  }, [squilla, onda])

  const anello = (ritardo: number) => {
    const v = onda.interpolate({ inputRange: [0, 1], outputRange: [ritardo, 1 + ritardo] })
    return {
      opacity: v.interpolate({ inputRange: [0, 0.2, 1, 2], outputRange: [0, 0.45, 0, 0], extrapolate: 'clamp' }),
      transform: [{ scale: v.interpolate({ inputRange: [0, 1, 2], outputRange: [1, 1.55, 1.55], extrapolate: 'clamp' }) }],
    }
  }
  const lettere = iniziali(nome)

  return (
    <View style={s.ritratto}>
      {squilla ? (
        <>
          <Animated.View pointerEvents="none" style={[s.anello, { borderColor: c.primario }, anello(0)]} />
          <Animated.View pointerEvents="none" style={[s.anello, { borderColor: c.primario }, anello(-0.5)]} />
        </>
      ) : null}
      {foto ? (
        <Image source={{ uri: foto }} style={s.foto} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[s.foto, s.fotoVuota, { backgroundColor: c.primarioTenue }]}>
          {lettere ? (
            <Text style={[s.lettere, { color: c.primario }]}>{lettere}</Text>
          ) : (
            <Ionicons name="person" size={60} color={c.primario} />
          )}
        </View>
      )}
    </View>
  )
}

const AVVISI_RETE = ['high-packet-loss', 'high-jitter', 'high-rtt', 'low-mos']

/** Cosa dire a chi parla quando l'SDK segnala un problema (microfono prima della rete). */
function avvisoQualita(avvisi: string[], muto: boolean, connessa: boolean): { icona: 'mic-off-outline' | 'cellular-outline'; testo: string } | null {
  if (!connessa || !avvisi.length) {
    return null
  }
  // Con il muto dell'app il microfono e' fermo apposta.
  if (!muto && avvisi.includes('constant-audio-input-level')) {
    return { icona: 'mic-off-outline', testo: t('telefono.avvisoMicrofono') }
  }
  if (avvisi.some((a) => AVVISI_RETE.includes(a))) {
    return { icona: 'cellular-outline', testo: t('telefono.avvisoRete') }
  }
  return null
}

export default function SchermataChiamata() {
  const c = coloriChiamata
  const margini = useSafeAreaInsets()
  const { sessione } = useApp()
  const { chiamata, audio, audioScelto } = useTelefono()
  const [trovata, setTrovata] = useState<{ numero: string; scheda: SchedaContatto | null }>({ numero: '', scheda: null })
  const numeroChiamata = chiamata?.numero || ''
  // Vale solo la scheda del numero di questa chiamata.
  const scheda = trovata.numero === numeroChiamata ? trovata.scheda : null

  // Nome, azienda e foto da Odoo: arrivano poco dopo l'apertura, intanto si
  // vede quello che ha detto il centralino.
  useEffect(() => {
    if (!sessione || !numeroChiamata) {
      return
    }
    let viva = true
    schedaContatto(sessione.server, numeroChiamata).then((r) => viva && setTrovata({ numero: numeroChiamata, scheda: r }))
    return () => {
      viva = false
    }
  }, [sessione, numeroChiamata])
  const [, setBattito] = useState(0)
  const [tastierino, setTastierino] = useState(false)
  const [toni, setToni] = useState('')
  const [lista, setLista] = useState<Collega[] | null>(null)
  const [sceltaAudio, setSceltaAudio] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => setBattito((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  if (!chiamata) {
    return <View style={{ flex: 1, backgroundColor: c.sfondo }} />
  }

  const connessa = chiamata.fase === 'connessa'
  const squilla = ['composizione', 'squillo', 'in-arrivo'].includes(chiamata.fase)
  const stato = connessa ? cronometro(chiamata.inizio) : FASI[chiamata.fase] ? t(FASI[chiamata.fase]) : ''
  const nome = scheda?.nome || chiamata.nome || ''
  const avviso = avvisoQualita(chiamata.avvisi, chiamata.muto, connessa)
  const colorePunto = chiamata.fase === 'riconnessione' ? c.ambra : connessa ? c.verde : c.testo3

  async function apriTrasferimento() {
    if (!sessione) {
      return
    }
    setLista([])
    try {
      setLista(await colleghi(sessione.server))
    } catch (e) {
      setLista(null)
      Alert.alert(t('telefono.trasferimento'), e instanceof Error ? e.message : String(e))
    }
  }

  async function trasferisciA(collega: Collega) {
    setLista(null)
    try {
      const nome = await telefono.trasferisci(collega.id)
      Alert.alert(t('telefono.passataTitolo'), t('telefono.passataTesto', { nome }))
    } catch (e) {
      Alert.alert(t('telefono.trasferimentoErrore'), e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <View style={[s.pagina, { backgroundColor: c.sfondo }]}>
      {scheda?.foto ? (
        <>
          <Image source={{ uri: scheda.foto }} style={StyleSheet.absoluteFill} blurRadius={60} resizeMode="cover" />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(14,16,24,0.72)' }]} />
        </>
      ) : (
        // Luce viola che sfuma: cerchi concentrici sulla foto, ognuno appena
        // visibile, cosi' il bordo non si vede.
        ALONE.map((lato) => (
          <View
            key={lato}
            pointerEvents="none"
            style={[
              s.alone,
              { width: lato, height: lato, borderRadius: lato / 2, top: margini.top + CENTRO_FOTO - lato / 2, backgroundColor: c.primario },
            ]}
          />
        ))
      )}
      <View style={[s.contenuto, { paddingTop: margini.top, paddingBottom: margini.bottom }]}>
      <View style={s.testa}>
        <View style={s.direzione}>
          <Ionicons
            name={chiamata.direzione === 'entrata' ? 'arrow-down' : 'arrow-up'}
            size={13}
            color={c.testo2}
            style={{ transform: [{ rotate: '45deg' }] }}
          />
          <Text style={[s.direzioneTesto, { color: c.testo2 }]} numberOfLines={1}>
            {chiamata.direzione === 'entrata' ? t('telefono.inArrivo') : t('telefono.inUscita')}
          </Text>
        </View>

        <Ritratto foto={scheda?.foto || ''} nome={nome} squilla={squilla} c={c} />

        <Text style={[s.nome, { color: c.testo }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
          {nome || chiamata.numero || t('telefono.sconosciuto')}
        </Text>
        {scheda?.azienda ? (
          <Text style={[s.azienda, { color: c.testo2 }]} numberOfLines={1}>
            {scheda.azienda}
          </Text>
        ) : null}
        {nome ? (
          <Text style={[s.numero, { color: c.testo3 }]} numberOfLines={1}>
            {chiamata.numero}
          </Text>
        ) : null}

        <View style={[s.pillola, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
          <View style={[s.punto, { backgroundColor: colorePunto }]} />
          <Text style={[s.stato, { color: chiamata.fase === 'riconnessione' ? c.ambra : c.testo }]}>
            {stato}
            {chiamata.attesa ? t('telefono.inAttesa') : ''}
          </Text>
        </View>
        {avviso ? (
          <View style={[s.avviso, { backgroundColor: 'rgba(245,166,35,0.16)' }]} accessibilityLiveRegion="polite">
            <Ionicons name={avviso.icona} size={16} color={c.ambra} />
            <Text style={[s.avvisoTesto, { color: c.testo }]}>{avviso.testo}</Text>
          </View>
        ) : null}
      </View>

      {tastierino ? (
        <View style={s.toni}>
          <Text style={[s.toniTesto, { color: c.testo }]} numberOfLines={1}>
            {toni}
          </Text>
          <View style={s.toniGriglia}>
            {TONI.map((tono) => (
              <Pressable
                key={tono}
                onPress={() => {
                  setToni((v) => v + tono)
                  void telefono.toni(tono)
                }}
                style={({ pressed }) => [s.tono, { backgroundColor: pressed ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)' }]}
              >
                <Text style={[s.tonoTesto, { color: c.testo }]}>{tono}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <View style={s.griglia}>
          <Tasto c={c} icona="mic-off" testo={t('telefono.muto')} attivo={chiamata.muto} onPress={() => void telefono.muto()} disabilitato={!connessa} />
          <Tasto c={c} icona="keypad" testo={t('telefono.tastierino')} onPress={() => setTastierino(true)} disabilitato={!connessa} />
          <Tasto
            c={c}
            icona={audioScelto?.type === AudioDevice.Type.Speaker ? 'volume-high' : 'volume-medium'}
            testo={nomeAudio(audioScelto)}
            attivo={audioScelto?.type === AudioDevice.Type.Speaker}
            onPress={() => setSceltaAudio(true)}
          />
          <Tasto c={c} icona="pause" testo={t('telefono.attesa')} attivo={chiamata.attesa} onPress={() => void telefono.attesa()} disabilitato={!connessa} />
          <Tasto c={c} icona="swap-horizontal" testo={t('telefono.trasferisci')} onPress={apriTrasferimento} disabilitato={!connessa || chiamata.direzione !== 'entrata'} />
        </View>
      )}

      <View style={s.piede}>
        {tastierino ? (
          <Pressable onPress={() => setTastierino(false)} style={s.lato} hitSlop={12}>
            <Text style={{ color: c.primario, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>
              {t('telefono.nascondi')}
            </Text>
          </Pressable>
        ) : (
          <View style={s.lato} />
        )}
        <Pressable
          onPress={() => void telefono.riaggancia()}
          style={({ pressed }) => [s.riaggancia, { backgroundColor: c.rosso, opacity: pressed ? 0.85 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={t('telefono.riaggancia')}
        >
          <Ionicons name="call" size={34} color="#FFFFFF" style={{ transform: [{ rotate: '135deg' }] }} />
        </Pressable>
        <View style={s.lato} />
      </View>

      </View>

      <Modal visible={sceltaAudio} transparent animationType="fade" onRequestClose={() => setSceltaAudio(false)}>
        <Pressable style={s.velo} onPress={() => setSceltaAudio(false)}>
          <View style={[s.foglio, { backgroundColor: c.superficie }]}>
            {audio.map((d) => (
              <Pressable
                key={d.uuid}
                style={s.foglioVoce}
                onPress={() => {
                  setSceltaAudio(false)
                  void telefono.scegliAudio(d)
                }}
              >
                <Text style={[s.foglioTesto, { color: c.testo }]}>{nomeAudio(d)}</Text>
                {audioScelto?.uuid === d.uuid ? <Ionicons name="checkmark" size={22} color={c.primario} /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={lista !== null} transparent animationType="slide" onRequestClose={() => setLista(null)}>
        <Pressable style={s.velo} onPress={() => setLista(null)}>
          <View style={[s.foglio, { backgroundColor: c.superficie, maxHeight: '70%' }]}>
            <Text style={[s.foglioTitolo, { color: c.testo }]}>{t('telefono.passaA')}</Text>
            {lista && lista.length === 0 ? <ActivityIndicator color={c.primario} style={{ margin: spazio.l }} /> : null}
            <FlatList
              data={lista || []}
              keyExtractor={(a) => String(a.id)}
              renderItem={({ item }) => (
                <Pressable style={s.foglioVoce} onPress={() => void trasferisciA(item)}>
                  <View style={[s.punto, { backgroundColor: item.available ? c.verde : c.testo3 }]} />
                  <Text style={[s.foglioTesto, { color: c.testo, flex: 1 }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={{ color: c.testo3 }}>{item.extension}</Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1, overflow: 'hidden' },
  contenuto: { flex: 1, paddingHorizontal: spazio.xl },
  // Luce viola dietro la foto quando la foto non c'e'.
  alone: { position: 'absolute', alignSelf: 'center', opacity: 0.045 },
  testa: { alignItems: 'center', paddingTop: spazio.xl, gap: spazio.xs },
  direzione: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spazio.l },
  direzioneTesto: { fontSize: 13, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  ritratto: { width: LATO_FOTO, height: LATO_FOTO, alignItems: 'center', justifyContent: 'center', marginBottom: spazio.l },
  anello: { position: 'absolute', width: LATO_FOTO, height: LATO_FOTO, borderRadius: LATO_FOTO / 2, borderWidth: 2 },
  foto: { width: LATO_FOTO, height: LATO_FOTO, borderRadius: LATO_FOTO / 2, borderWidth: 3, borderColor: 'rgba(255,255,255,0.14)' },
  fotoVuota: { alignItems: 'center', justifyContent: 'center' },
  lettere: { fontSize: 50, fontWeight: '600', letterSpacing: 1 },
  nome: { fontSize: 30, fontWeight: '700', textAlign: 'center', letterSpacing: -0.3 },
  azienda: { fontSize: 17, fontWeight: '500' },
  numero: { fontSize: 15, fontVariant: ['tabular-nums'], marginTop: 2 },
  pillola: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, paddingHorizontal: spazio.l, paddingVertical: 7, borderRadius: raggio.tondo, marginTop: spazio.l },
  stato: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  griglia: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignContent: 'center', rowGap: spazio.xl, columnGap: spazio.l },
  azione: { width: '28%', alignItems: 'center', gap: spazio.s },
  azioneCerchio: { width: 74, height: 74, borderRadius: 37, alignItems: 'center', justifyContent: 'center' },
  azioneTesto: { fontSize: 13, fontWeight: '500' },
  toni: { flex: 1, justifyContent: 'center' },
  toniTesto: { fontSize: 28, textAlign: 'center', minHeight: 36, marginBottom: spazio.l },
  toniGriglia: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spazio.m },
  tono: { width: '30%', aspectRatio: 1.6, borderRadius: raggio.l, alignItems: 'center', justifyContent: 'center' },
  tonoTesto: { fontSize: 28, fontWeight: '500' },
  piede: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spazio.xl },
  lato: { width: 90, alignItems: 'center' },
  riaggancia: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF5C61',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  velo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  foglio: { borderTopLeftRadius: raggio.l, borderTopRightRadius: raggio.l, paddingVertical: spazio.m, paddingBottom: spazio.xxl },
  foglioTitolo: { fontSize: 17, fontWeight: '700', paddingHorizontal: spazio.xl, paddingVertical: spazio.m },
  foglioVoce: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, paddingHorizontal: spazio.xl, paddingVertical: spazio.l },
  foglioTesto: { fontSize: 17 },
  punto: { width: 8, height: 8, borderRadius: 4 },
  avviso: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spazio.s,
    marginTop: spazio.m,
    marginHorizontal: spazio.xl,
    paddingHorizontal: spazio.m,
    paddingVertical: spazio.s,
    borderRadius: raggio.m,
    maxWidth: 420,
  },
  avvisoTesto: { flex: 1, fontSize: 14, lineHeight: 19 },
})
