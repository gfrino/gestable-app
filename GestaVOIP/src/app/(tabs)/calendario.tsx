/**
 * Calendario: i miei appuntamenti di Odoo, una settimana alla volta.
 *
 * In alto il mese e i giorni della settimana (si scorrono di lato, il pallino
 * dice dove c'e' qualcosa), sotto gli appuntamenti del giorno scelto. Il tasto
 * Calendario in basso, toccato di nuovo, torna a oggi.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect, useNavigation, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { lingua, loc, t, tn } from '../../i18n'
import { delGiorno, eventi, giornoChiave, giornoEsteso, lettereGiorni, oraBreve, type Evento } from '../../odoo/calendario'
import { PulsanteMenu } from '../../ui/MenuLaterale'
import { raggio, spazio, useColori } from '../../ui/tema'
import { useApp } from '../../voip/Contesto'
import { APP } from '../../odoo/capacita'
import { RichiedeApp } from '../../ui/RichiedeApp'

const SETTIMANE = 52 // avanti e indietro da oggi

function lunedi(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const g = (x.getDay() + 6) % 7 // lunedi' = 0
  x.setDate(x.getDate() - g)
  return x
}

function piuGiorni(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function VistaCalendario() {
  const c = useColori()
  const router = useRouter()
  const navigation = useNavigation()
  const { width, fontScale } = useWindowDimensions()
  // Colonna delle ore larga quanto «00:00» (in inglese «12:30 PM») con la
  // dimensione del testo scelta nelle impostazioni del telefono (con il testo
  // grande andava a capo).
  const larghezzaOre = Math.ceil((lingua() === 'it' ? 58 : 86) * Math.max(1, fontScale))
  const { sessione } = useApp()
  const server = sessione?.server || ''
  const uid = sessione?.utente.uid || 0

  const oggi = useMemo(() => new Date(), [])
  const lunediOggi = useMemo(() => lunedi(oggi), [oggi])
  const [scelto, setScelto] = useState(() => new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate()))
  const [pagina, setPagina] = useState(SETTIMANE)
  const [perSettimana, setPerSettimana] = useState<Record<string, Evento[]>>({})
  const [errore, setErrore] = useState('')
  const [ricarica, setRicarica] = useState(false)
  const striscia = useRef<FlatList<number>>(null)
  // L'ora corrente, per «Ora» e per gli appuntamenti gia' passati: si aggiorna ogni minuto.
  const [adesso, setAdesso] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAdesso(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  const inizioSettimana = useCallback((p: number) => piuGiorni(lunediOggi, (p - SETTIMANE) * 7), [lunediOggi])

  // Tre settimane per volta (quella vista e le vicine): si scorre senza attese.
  const caricaSettimane = useCallback(
    async (p: number, forza = false) => {
      if (!server) {
        return
      }
      const pagine = [p - 1, p, p + 1].filter((x) => forza || !perSettimana[giornoChiave(inizioSettimana(x))])
      if (!pagine.length) {
        return
      }
      try {
        const da = inizioSettimana(Math.min(...pagine))
        const a = piuGiorni(inizioSettimana(Math.max(...pagine)), 7)
        const lista = await eventi(server, uid, da, a)
        setPerSettimana((prima) => {
          const nuovo = { ...prima }
          for (const x of pagine) {
            const s = inizioSettimana(x)
            const fine = piuGiorni(s, 7)
            nuovo[giornoChiave(s)] = lista.filter((e) => e.inizio < fine && e.fine > s)
          }
          return nuovo
        })
        setErrore('')
      } catch (e) {
        setErrore(e instanceof Error ? e.message : String(e))
      }
    },
    [server, uid, perSettimana, inizioSettimana],
  )

  useFocusEffect(
    useCallback(() => {
      void caricaSettimane(pagina, true)
      // Solo al ritorno sulla scheda: lo scorrimento ha il suo caricamento.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [server, uid]),
  )

  const vaiAOggi = useCallback(() => {
    setScelto(new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate()))
    setPagina(SETTIMANE)
    striscia.current?.scrollToIndex({ index: SETTIMANE, animated: true })
  }, [oggi])

  // Il tasto Calendario, toccato quando si e' gia' qui, torna a oggi.
  useEffect(
    () =>
      navigation.addListener('tabPress' as never, () => {
        if (navigation.isFocused()) {
          vaiAOggi()
        }
      }),
    [navigation, vaiAOggi],
  )

  function finitoScorrere(ev: NativeSyntheticEvent<NativeScrollEvent>) {
    const p = Math.round(ev.nativeEvent.contentOffset.x / width)
    if (p === pagina) {
      return
    }
    setPagina(p)
    // Stesso giorno della settimana nella settimana nuova (oggi, se e' questa).
    const g = (scelto.getDay() + 6) % 7
    setScelto(p === SETTIMANE ? new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate()) : piuGiorni(inizioSettimana(p), g))
    void caricaSettimane(p)
  }

  async function tiraGiu() {
    setRicarica(true)
    await caricaSettimane(pagina, true)
    setRicarica(false)
  }

  const settimana = perSettimana[giornoChiave(inizioSettimana(pagina))]
  const delScelto = settimana ? delGiorno(settimana, scelto) : null
  const titoloMese = scelto.toLocaleDateString(loc(), { month: 'long', year: 'numeric' })

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top']}>
      <View style={s.testa}>
        <PulsanteMenu />
        <Text style={[s.mese, { color: c.testo }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {titoloMese.charAt(0).toUpperCase() + titoloMese.slice(1)}
        </Text>
        <Pressable
          onPress={vaiAOggi}
          style={({ pressed }) => [s.oggi, { backgroundColor: pressed ? c.superficie2 : c.superficie, borderColor: c.bordo }]}
          accessibilityRole="button"
        >
          <Text style={[s.oggiTesto, { color: c.primario }]} numberOfLines={1}>
            {t('calendario.oggi')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: '/calendario/nuovo', params: { giorno: giornoChiave(scelto) } })}
          hitSlop={8}
          style={({ pressed }) => [s.piu, { backgroundColor: c.primario, opacity: pressed ? 0.85 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={t('calendario.nuovo')}
        >
          <Ionicons name="add" size={24} color={c.primarioTesto} />
        </Pressable>
      </View>

      <FlatList
        ref={striscia}
        data={Array.from({ length: SETTIMANE * 2 + 1 }, (_, i) => i)}
        keyExtractor={(i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={SETTIMANE}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={finitoScorrere}
        style={s.striscia}
        windowSize={3}
        renderItem={({ item }) => {
          const inizio = inizioSettimana(item)
          const conEventi = perSettimana[giornoChiave(inizio)] || []
          return (
            <View style={[s.settimana, { width }]}>
              {lettereGiorni().map((lettera, g) => {
                const giorno = piuGiorni(inizio, g)
                const chiave = giornoChiave(giorno)
                const eScelto = chiave === giornoChiave(scelto)
                const eOggi = chiave === giornoChiave(oggi)
                const pieno = delGiorno(conEventi, giorno).length > 0
                return (
                  <Pressable key={chiave} onPress={() => setScelto(giorno)} style={s.giorno} accessibilityRole="button">
                    <Text style={[s.lettera, { color: g > 4 ? c.testo3 : c.testo2 }]}>{lettera}</Text>
                    <View style={[s.numero, eScelto && { backgroundColor: c.primario }]}>
                      <Text
                        style={[
                          s.numeroTesto,
                          { color: eScelto ? c.primarioTesto : eOggi ? c.primario : c.testo },
                          (eScelto || eOggi) && { fontWeight: '800' },
                        ]}
                      >
                        {giorno.getDate()}
                      </Text>
                    </View>
                    <View style={[s.punto, { backgroundColor: pieno ? (eScelto ? c.primario : c.testo3) : 'transparent' }]} />
                  </Pressable>
                )
              })}
            </View>
          )
        }}
      />

      <View style={[s.linea, { backgroundColor: c.bordo }]} />

      <ScrollView
        contentContainerStyle={s.agenda}
        refreshControl={<RefreshControl refreshing={ricarica} onRefresh={tiraGiu} tintColor={c.primario} />}
      >
        <Text style={[s.giornoTitolo, { color: c.testo }]}>
          {giornoEsteso(scelto)}
        </Text>
        {errore && !delScelto ? (
          <Text style={[s.vuoto, { color: c.rosso }]}>{errore}</Text>
        ) : !delScelto ? (
          <ActivityIndicator style={{ marginTop: spazio.xl }} color={c.primario} />
        ) : !delScelto.length ? (
          <View style={s.vuotoBlocco}>
            <Ionicons name="calendar-clear-outline" size={48} color={c.testo3} />
            <Text style={[s.vuoto, { color: c.testo2 }]}>{t('calendario.nessunAppuntamento')}</Text>
          </View>
        ) : (
          delScelto.map((e) => {
            const inCorso = !e.tuttoIlGiorno && e.inizio.getTime() <= adesso && adesso < e.fine.getTime()
            const passato = !e.tuttoIlGiorno && e.fine.getTime() < adesso
            return (
              <Pressable
                key={e.id}
                onPress={() => router.push({ pathname: '/calendario/[id]', params: { id: String(e.id) } })}
                style={({ pressed }) => [
                  s.evento,
                  { backgroundColor: pressed ? c.superficie2 : c.superficie, borderColor: inCorso ? c.primario : c.bordo, opacity: passato ? 0.6 : 1 },
                ]}
              >
                <View style={[s.ore, { width: larghezzaOre }]}>
                  {e.tuttoIlGiorno ? (
                    <Text style={[s.tutto, { color: c.primario }]}>{t('calendario.tuttoIlGiorno')}</Text>
                  ) : (
                    <>
                      <Text style={[s.oraInizio, { color: c.testo }]} numberOfLines={1}>
                        {oraBreve(e.inizio)}
                      </Text>
                      <Text style={[s.oraFine, { color: c.testo3 }]} numberOfLines={1}>
                        {oraBreve(e.fine)}
                      </Text>
                    </>
                  )}
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={s.rigaTitolo}>
                    <Text style={[s.titolo, { color: c.testo }]} numberOfLines={2}>
                      {e.titolo}
                    </Text>
                    {inCorso ? (
                      <View style={[s.ora, { backgroundColor: c.verdeTenue }]}>
                        <Text style={[s.oraTesto, { color: c.verde }]}>{t('calendario.adesso')}</Text>
                      </View>
                    ) : null}
                  </View>
                  {e.luogo ? (
                    <View style={s.dettaglio}>
                      <Ionicons name="location-outline" size={14} color={c.testo2} />
                      <Text style={[s.dettaglioTesto, { color: c.testo2 }]} numberOfLines={1}>
                        {e.luogo}
                      </Text>
                    </View>
                  ) : null}
                  {e.video ? (
                    <View style={s.dettaglio}>
                      <Ionicons name="videocam-outline" size={14} color={c.testo2} />
                      <Text style={[s.dettaglioTesto, { color: c.testo2 }]}>{t('calendario.videochiamata')}</Text>
                    </View>
                  ) : null}
                  {e.partecipanti > 1 ? (
                    <View style={s.dettaglio}>
                      <Ionicons name="people-outline" size={14} color={c.testo2} />
                      <Text style={[s.dettaglioTesto, { color: c.testo2 }]}>{tn('calendario.partecipanti', e.partecipanti)}</Text>
                    </View>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={c.testo3} />
              </Pressable>
            )
          })
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1 },
  testa: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, paddingHorizontal: spazio.m, paddingVertical: spazio.s },
  mese: { flex: 1, fontSize: 26, fontWeight: '800', letterSpacing: -0.3 },
  oggi: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  oggiTesto: { fontSize: 15, fontWeight: '700' },
  piu: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  striscia: { flexGrow: 0 },
  settimana: { flexDirection: 'row', paddingHorizontal: spazio.s, paddingBottom: spazio.s },
  giorno: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 },
  lettera: { fontSize: 12, fontWeight: '700' },
  numero: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  numeroTesto: { fontSize: 17, fontWeight: '600' },
  punto: { width: 5, height: 5, borderRadius: 3 },
  linea: { height: StyleSheet.hairlineWidth },
  agenda: { padding: spazio.l, paddingBottom: spazio.xxl, gap: spazio.s },
  giornoTitolo: { fontSize: 17, fontWeight: '700', marginBottom: spazio.xs },
  evento: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, padding: spazio.m, borderRadius: raggio.l, borderWidth: 1 },
  ore: { alignItems: 'flex-start' },
  oraInizio: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  oraFine: { fontSize: 13, fontVariant: ['tabular-nums'], marginTop: 2 },
  tutto: { fontSize: 12, fontWeight: '700', lineHeight: 15 },
  rigaTitolo: { flexDirection: 'row', alignItems: 'center', gap: spazio.s },
  titolo: { flex: 1, fontSize: 16, fontWeight: '700' },
  ora: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  oraTesto: { fontSize: 11, fontWeight: '800' },
  dettaglio: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dettaglioTesto: { flex: 1, fontSize: 13 },
  vuoto: { fontSize: 15, textAlign: 'center', marginTop: spazio.s },
  vuotoBlocco: { alignItems: 'center', marginTop: spazio.xxl },
})

export default function Calendario() {
  return (
    <RichiedeApp xmlid={APP.calendario} app={t('calendario.app')} titolo={t('calendario.titolo')} icona="calendar">
      <VistaCalendario />
    </RichiedeApp>
  )
}
