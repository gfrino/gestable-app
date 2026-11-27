/**
 * Calendario: i miei appuntamenti di Odoo, per giorno, settimana o mese.
 *
 * In alto il periodo, sotto il selettore Giorno / Settimana / Mese con le
 * frecce per andare avanti e indietro. Giorno: i giorni della settimana (si
 * scorrono di lato, il pallino dice dove c'e' qualcosa) e gli appuntamenti del
 * giorno scelto. Settimana: i sette giorni uno sotto l'altro. Mese: la griglia;
 * toccare un giorno lo apre nella vista Giorno. Il tasto Calendario in basso,
 * toccato di nuovo, torna a oggi. La vista scelta si ricorda.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect, useNavigation, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AppState,
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
import { lingua, loc, t } from '../../i18n'
import { delGiorno, eventi, giornoChiave, giornoEsteso, lettereGiorni, type Evento } from '../../odoo/calendario'
import { PulsanteMenu } from '../../ui/MenuLaterale'
import { raggio, spazio, useColori } from '../../ui/tema'
import { useApp } from '../../voip/Contesto'
import { APP } from '../../odoo/capacita'
import { RichiedeApp } from '../../ui/RichiedeApp'
import { leggi, scrivi } from '../../odoo/archivio'
import { Caricamento } from '../../ui/Caricamento'
import { CartaEvento, lunedi, NumeroGiorno, piuGiorni, settimaneDelMese, VistaMese, VistaSettimana } from '../../ui/calendario/Viste'

const SETTIMANE = 52 // avanti e indietro da oggi
const SETTIMANA_MS = 7 * 86_400_000

type Vista = 'giorno' | 'settimana' | 'mese'
const VISTE: Vista[] = ['giorno', 'settimana', 'mese']

function inizioGiorno(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Lo stesso giorno del mese «n» mesi dopo (il 31 diventa l'ultimo del mese). */
function piuMesi(d: Date, n: number): Date {
  const ultimo = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate()
  return new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), ultimo))
}

function maiuscola(x: string): string {
  return x.charAt(0).toUpperCase() + x.slice(1)
}

/** «23–29 novembre», «30 nov – 6 dic»; in inglese «Nov 23–29», «Nov 30 – Dec 6». */
function titoloSettimana(inizio: Date, annoOggi: number): string {
  const fine = piuGiorni(inizio, 6)
  const mese = (d: Date, f: 'long' | 'short') => d.toLocaleDateString(loc(), { month: f }).replace('.', '')
  const stesso = inizio.getMonth() === fine.getMonth()
  let x: string
  if (lingua() === 'it') {
    x = stesso
      ? `${inizio.getDate()}–${fine.getDate()} ${mese(fine, 'long')}`
      : `${inizio.getDate()} ${mese(inizio, 'short')} – ${fine.getDate()} ${mese(fine, 'short')}`
  } else {
    x = stesso
      ? `${mese(inizio, 'short')} ${inizio.getDate()}–${fine.getDate()}`
      : `${mese(inizio, 'short')} ${inizio.getDate()} – ${mese(fine, 'short')} ${fine.getDate()}`
  }
  return maiuscola(fine.getFullYear() !== annoOggi ? `${x} ${fine.getFullYear()}` : x)
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

  const [vista, setVista] = useState<Vista>(() => {
    const v = leggi<Vista>(server, uid, 'calendarioVista')
    return v && VISTE.includes(v) ? v : 'giorno'
  })

  // Oggi cambia anche ad app aperta: la scheda resta montata per giorni (tornando
  // all'app la mattina dopo «Oggi» portava a ieri). Si ricalcola ogni minuto e
  // quando l'app torna in primo piano.
  const [oggi, setOggi] = useState(() => inizioGiorno(new Date()))
  const oggiRef = useRef(oggi)
  const lunediOggi = useMemo(() => lunedi(oggi), [oggi])
  // Il giorno scelto: tiene il posto in tutte e tre le viste.
  const [scelto, setScelto] = useState(() => oggi)

  /** La settimana di «d» nella striscia dei giorni (SETTIMANE = questa). */
  const paginaDi = useCallback(
    (d: Date) => SETTIMANE + Math.round((lunedi(d).getTime() - lunediOggi.getTime()) / SETTIMANA_MS),
    [lunediOggi],
  )
  const entro = useCallback((d: Date) => paginaDi(d) >= 0 && paginaDi(d) <= SETTIMANE * 2, [paginaDi])
  const pagina = paginaDi(scelto)

  // Le tre settimane attorno a oggi: si salvano sul telefono e all'apertura si
  // vedono subito, mentre arrivano quelle aggiornate da Odoo.
  const vicine = useMemo(
    () => [-1, 0, 1].map((x) => giornoChiave(piuGiorni(lunediOggi, x * 7))),
    [lunediOggi],
  )
  const [perSettimana, setPerSettimana] = useState<Record<string, Evento[]>>(() => {
    const copia = leggi<Record<string, Evento[]>>(server, uid, 'calendario') || {}
    return Object.fromEntries(vicine.filter((k) => copia[k]).map((k) => [k, copia[k]]))
  })
  useEffect(() => {
    if (vicine.every((k) => perSettimana[k])) {
      scrivi(server, uid, 'calendario', Object.fromEntries(vicine.map((k) => [k, perSettimana[k]])))
    }
  }, [perSettimana, vicine, server, uid])
  const [errore, setErrore] = useState('')
  const [ricarica, setRicarica] = useState(false)
  const striscia = useRef<FlatList<number>>(null)
  // La pagina che la striscia mostra davvero (per seguirla quando il giorno cambia con le frecce).
  const paginaStriscia = useRef(pagina)
  // L'ora corrente, per «Ora» e per gli appuntamenti gia' passati: si aggiorna ogni minuto.
  const [adesso, setAdesso] = useState(() => Date.now())

  /** Aggiorna l'ora; se il giorno e' cambiato torna a oggi. Restituisce oggi. */
  const aggiornaOggi = useCallback((): Date => {
    const ora = Date.now()
    setAdesso(ora)
    const d = inizioGiorno(new Date(ora))
    if (d.getTime() !== oggiRef.current.getTime()) {
      oggiRef.current = d
      setOggi(d)
      setScelto(d)
      paginaStriscia.current = SETTIMANE
      striscia.current?.scrollToIndex({ index: SETTIMANE, animated: false })
    }
    return d
  }, [])

  useEffect(() => {
    const t = setInterval(aggiornaOggi, 60_000)
    const via = AppState.addEventListener('change', (stato) => {
      if (stato === 'active') {
        aggiornaOggi()
      }
    })
    return () => {
      clearInterval(t)
      via.remove()
    }
  }, [aggiornaOggi])

  // Le settimane che servono alla vista: quella scelta e le vicine (si scorre
  // senza attese) oppure tutte quelle del mese.
  const chiaveMese = `${scelto.getFullYear()}-${scelto.getMonth()}`
  const chiaveSettimana = giornoChiave(lunedi(scelto))
  const servono = useMemo(() => {
    const lista =
      vista === 'mese'
        ? settimaneDelMese(scelto)
        : [-7, 0, 7].map((n) => piuGiorni(lunedi(scelto), n))
    return lista.map(giornoChiave)
    // Cambiano solo con la settimana o il mese, non con il giorno.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, vista === 'mese' ? chiaveMese : chiaveSettimana])

  // Settimane gia' chieste a Odoo e non ancora arrivate: non si chiedono due volte.
  const inCorso = useRef(new Set<string>())
  const carica = useCallback(
    async (chiavi: string[]) => {
      const nuove = chiavi.filter((k) => !inCorso.current.has(k))
      if (!server || !nuove.length) {
        return
      }
      nuove.forEach((k) => inCorso.current.add(k))
      try {
        const lunedi = nuove.map((k) => new Date(`${k}T00:00:00`)).sort((x, y) => x.getTime() - y.getTime())
        const lista = await eventi(server, uid, lunedi[0], piuGiorni(lunedi[lunedi.length - 1], 7))
        setPerSettimana((prima) => {
          const nuovo = { ...prima }
          for (const s of lunedi) {
            const fine = piuGiorni(s, 7)
            nuovo[giornoChiave(s)] = lista.filter((e) => e.inizio < fine && e.fine > s)
          }
          return nuovo
        })
        setErrore('')
      } catch (e) {
        setErrore(e instanceof Error ? e.message : String(e))
      } finally {
        nuove.forEach((k) => inCorso.current.delete(k))
      }
    },
    [server, uid],
  )

  // Quelle che mancano si caricano appena servono.
  useEffect(() => {
    const mancano = servono.filter((k) => !perSettimana[k])
    if (mancano.length) {
      void carica(mancano)
    }
  }, [servono, perSettimana, carica])

  // Al ritorno sulla scheda si aggiornano quelle che si vedono.
  const servonoRef = useRef(servono)
  useEffect(() => {
    servonoRef.current = servono
  }, [servono])
  useFocusEffect(
    useCallback(() => {
      void carica(servonoRef.current)
    }, [carica]),
  )

  const vaiAOggi = useCallback(() => {
    setScelto(aggiornaOggi())
  }, [aggiornaOggi])

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

  // Nella vista Giorno la striscia segue il giorno scelto (frecce, «Oggi», mese).
  useEffect(() => {
    if (vista === 'giorno' && paginaStriscia.current !== pagina) {
      paginaStriscia.current = pagina
      striscia.current?.scrollToIndex({ index: pagina, animated: true })
    }
  }, [vista, pagina])

  function cambiaVista(v: Vista) {
    if (v === 'giorno') {
      // La striscia rinasce gia' sulla settimana giusta (initialScrollIndex).
      paginaStriscia.current = pagina
    }
    setVista(v)
    scrivi(server, uid, 'calendarioVista', v)
  }

  function apriGiorno(d: Date) {
    setScelto(inizioGiorno(d))
    cambiaVista('giorno')
  }

  function apriEvento(id: number) {
    router.push({ pathname: '/calendario/[id]', params: { id: String(id) } })
  }

  const passo = (n: number) => (vista === 'giorno' ? piuGiorni(scelto, n) : vista === 'settimana' ? piuGiorni(scelto, 7 * n) : piuMesi(scelto, n))
  const prima = passo(-1)
  const dopo = passo(1)

  function finitoScorrere(ev: NativeSyntheticEvent<NativeScrollEvent>) {
    const p = Math.round(ev.nativeEvent.contentOffset.x / width)
    paginaStriscia.current = p
    if (p === pagina) {
      return
    }
    // Stesso giorno della settimana nella settimana nuova (oggi, se e' questa).
    const g = (scelto.getDay() + 6) % 7
    setScelto(p === SETTIMANE ? oggi : piuGiorni(lunediOggi, (p - SETTIMANE) * 7 + g))
  }

  async function tiraGiu() {
    setRicarica(true)
    await carica(servono)
    setRicarica(false)
  }

  const settimana = perSettimana[chiaveSettimana]
  const delScelto = settimana ? delGiorno(settimana, scelto) : null
  const titolo =
    vista === 'settimana'
      ? titoloSettimana(lunedi(scelto), oggi.getFullYear())
      : maiuscola(scelto.toLocaleDateString(loc(), { month: 'long', year: 'numeric' }))
  const aiuto =
    vista === 'giorno'
      ? [t('calendario.giornoPrima'), t('calendario.giornoDopo')]
      : vista === 'settimana'
        ? [t('calendario.settimanaPrima'), t('calendario.settimanaDopo')]
        : [t('calendario.mesePrima'), t('calendario.meseDopo')]
  const nomeVista = { giorno: t('calendario.tipoGiorno'), settimana: t('calendario.tipoSettimana'), mese: t('calendario.tipoMese') }
  const aggiorna = <RefreshControl refreshing={ricarica} onRefresh={tiraGiu} tintColor={c.primario} />

  function freccia(verso: 'back' | 'forward', a: Date, etichetta: string) {
    const ok = entro(a)
    return (
      <Pressable
        onPress={() => setScelto(a)}
        disabled={!ok}
        hitSlop={6}
        style={({ pressed }) => [s.freccia, { backgroundColor: pressed ? c.superficie2 : c.superficie, borderColor: c.bordo, opacity: ok ? 1 : 0.4 }]}
        accessibilityRole="button"
        accessibilityLabel={etichetta}
      >
        <Ionicons name={`chevron-${verso}`} size={20} color={c.primario} />
      </Pressable>
    )
  }

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top']}>
      <View style={s.testa}>
        <PulsanteMenu />
        <Text style={[s.mese, { color: c.testo }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {titolo}
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

      <View style={s.comandi}>
        {freccia('back', prima, aiuto[0])}
        <View style={[s.segmenti, { backgroundColor: c.superficie }]} accessibilityRole="tablist" accessibilityLabel={t('calendario.vista')}>
          {VISTE.map((v) => {
            const attivo = v === vista
            return (
              <Pressable
                key={v}
                onPress={() => cambiaVista(v)}
                style={[s.segmento, attivo && { backgroundColor: c.primarioTenue }]}
                accessibilityRole="tab"
                accessibilityState={{ selected: attivo }}
              >
                <Text
                  style={[s.segmentoTesto, { color: attivo ? c.primario : c.testo2 }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {nomeVista[v]}
                </Text>
              </Pressable>
            )
          })}
        </View>
        {freccia('forward', dopo, aiuto[1])}
      </View>

      {vista === 'settimana' ? (
        <VistaSettimana
          inizio={lunedi(scelto)}
          dati={settimana}
          errore={errore}
          adesso={adesso}
          larghezzaOre={larghezzaOre}
          oggi={oggi}
          onGiorno={apriGiorno}
          onEvento={apriEvento}
          refreshControl={aggiorna}
        />
      ) : vista === 'mese' ? (
        <VistaMese mese={scelto} perSettimana={perSettimana} scelto={scelto} errore={errore} oggi={oggi} onGiorno={apriGiorno} refreshControl={aggiorna} />
      ) : (
        <>
          <FlatList
            ref={striscia}
            data={Array.from({ length: SETTIMANE * 2 + 1 }, (_, i) => i)}
            keyExtractor={(i) => String(i)}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={Math.min(Math.max(pagina, 0), SETTIMANE * 2)}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onMomentumScrollEnd={finitoScorrere}
            style={s.striscia}
            windowSize={3}
            renderItem={({ item }) => {
              const inizio = piuGiorni(lunediOggi, (item - SETTIMANE) * 7)
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
                        <NumeroGiorno
                          numero={giorno.getDate()}
                          dimensione={17}
                          minimo={38}
                          sfondo={eScelto ? c.primario : undefined}
                          colore={eScelto ? c.primarioTesto : eOggi ? c.primario : c.testo}
                          grassetto={eScelto || eOggi}
                        />
                        <View style={[s.punto, { backgroundColor: pieno ? (eScelto ? c.primario : c.testo3) : 'transparent' }]} />
                      </Pressable>
                    )
                  })}
                </View>
              )
            }}
          />

          <View style={[s.linea, { backgroundColor: c.bordo }]} />

          <ScrollView contentContainerStyle={s.agenda} refreshControl={aggiorna}>
            <Text style={[s.giornoTitolo, { color: c.testo }]}>{giornoEsteso(scelto)}</Text>
            {errore && !delScelto ? (
              <Text style={[s.vuoto, { color: c.rosso }]}>{errore}</Text>
            ) : !delScelto ? (
              <Caricamento style={{ marginTop: spazio.xl }} />
            ) : !delScelto.length ? (
              <View style={s.vuotoBlocco}>
                <Ionicons name="calendar-clear-outline" size={48} color={c.testo3} />
                <Text style={[s.vuoto, { color: c.testo2 }]}>{t('calendario.nessunAppuntamento')}</Text>
              </View>
            ) : (
              delScelto.map((e) => (
                <CartaEvento key={e.id} evento={e} adesso={adesso} larghezzaOre={larghezzaOre} onPress={() => apriEvento(e.id)} />
              ))
            )}
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1 },
  testa: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, paddingHorizontal: spazio.m, paddingVertical: spazio.s },
  mese: { flex: 1, fontSize: 26, fontWeight: '800', letterSpacing: -0.3 },
  // Il tasto non si stringe mai (con il testo grande diventava «O…»): si rimpicciolisce il titolo.
  oggi: { flexShrink: 0, minHeight: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  oggiTesto: { fontSize: 15, fontWeight: '700' },
  piu: { flexShrink: 0, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  comandi: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, paddingHorizontal: spazio.m, paddingBottom: spazio.s },
  freccia: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  segmenti: { flex: 1, flexDirection: 'row', padding: 4, borderRadius: raggio.m },
  segmento: { flex: 1, paddingVertical: 8, paddingHorizontal: 4, borderRadius: raggio.s, alignItems: 'center' },
  segmentoTesto: { fontSize: 13, fontWeight: '600', letterSpacing: 0.1 },
  striscia: { flexGrow: 0 },
  settimana: { flexDirection: 'row', paddingHorizontal: spazio.s, paddingBottom: spazio.s },
  giorno: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 },
  lettera: { fontSize: 12, fontWeight: '700' },
  punto: { width: 5, height: 5, borderRadius: 3 },
  linea: { height: StyleSheet.hairlineWidth },
  agenda: { padding: spazio.l, paddingBottom: spazio.xxl, gap: spazio.s },
  giornoTitolo: { fontSize: 17, fontWeight: '700', marginBottom: spazio.xs },
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
