/**
 * Griglia di icone che si riordina come la schermata Home dell'iPhone: tenendo
 * premuta un'icona si entra in modifica (le icone oscillano), si trascina
 * un'icona e le altre si spostano per farle posto; «Fine» esce. Con VoiceOver
 * ogni icona ha le azioni «Sposta prima» e «Sposta dopo».
 *
 * Solo React Native (PanResponder, Animated, LayoutAnimation): nessun modulo
 * nativo nuovo, cosi' arriva anche per OTA alle app gia' installate.
 */

import * as Haptics from 'expo-haptics'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AccessibilityInfo, Animated, LayoutAnimation, PanResponder, Pressable, StyleSheet, View } from 'react-native'
import { t } from '../i18n'

type Voce = { chiave: string; nome: string }

type Props<T extends Voce> = {
  voci: T[]
  colonne: number
  /** Larghezza di una colonna. */
  lato: number
  /** Altezza di una riga (icona, nome, spazio sotto). */
  altezza: number
  modifica: boolean
  entraInModifica: () => void
  apri: (v: T) => void
  /** Il nuovo ordine (chiavi), a trascinamento finito. */
  ordina: (chiavi: string[]) => void
  disegna: (v: T, sollevata: boolean) => ReactNode
}

type Punto = { x: number; y: number }

function sposta<T>(lista: T[], da: number, a: number): T[] {
  const nuova = [...lista]
  const [x] = nuova.splice(da, 1)
  nuova.splice(a, 0, x)
  return nuova
}

export function GrigliaApp<T extends Voce>({ voci, colonne, lato, altezza, modifica, entraInModifica, apri, ordina, disegna }: Props<T>) {
  const [ordine, setOrdine] = useState(() => voci.map((v) => v.chiave))
  const [visto, setVisto] = useState(voci)
  const [trascinata, setTrascinata] = useState<string | null>(null)
  const [pan] = useState(() => new Animated.ValueXY())
  const [oscilla] = useState(() => new Animated.Value(0))
  // Durante il trascinamento: l'ordine corrente, il punto di partenza e l'icona
  // trascinata (letti dagli eventi del dito, che arrivano piu' spesso dei disegni).
  const stato = useRef({ ordine: [] as string[], origine: { x: 0, y: 0 } as Punto, chiave: null as string | null })

  // Le app (o il loro ordine salvato) cambiano da fuori: si riparte da li'.
  if (voci !== visto && !trascinata) {
    setVisto(voci)
    setOrdine(voci.map((v) => v.chiave))
  }

  const righe = Math.max(1, Math.ceil(ordine.length / colonne))
  const posto = (i: number): Punto => ({ x: (i % colonne) * lato, y: Math.floor(i / colonne) * altezza })

  // Le icone oscillano in modifica (non con «Riduci movimento»).
  useEffect(() => {
    if (!modifica) {
      oscilla.setValue(0)
      return
    }
    let ciclo: Animated.CompositeAnimation | null = null
    let vivo = true
    void AccessibilityInfo.isReduceMotionEnabled().then((ridotto) => {
      if (!vivo || ridotto) {
        return
      }
      ciclo = Animated.loop(
        Animated.sequence([
          Animated.timing(oscilla, { toValue: 1, duration: 120, useNativeDriver: true }),
          Animated.timing(oscilla, { toValue: -1, duration: 240, useNativeDriver: true }),
          Animated.timing(oscilla, { toValue: 0, duration: 120, useNativeDriver: true }),
        ]),
      )
      ciclo.start()
    })
    return () => {
      vivo = false
      ciclo?.stop()
    }
  }, [modifica, oscilla])

  function inizia(chiave: string) {
    stato.current.ordine = ordine
    const i = ordine.indexOf(chiave)
    const origine = posto(i)
    stato.current.origine = origine
    stato.current.chiave = chiave
    pan.setValue(origine)
    setTrascinata(chiave)
    void Haptics.selectionAsync().catch(() => undefined)
  }

  function muovi(dx: number, dy: number) {
    const { origine, chiave } = stato.current
    if (!chiave) {
      return
    }
    const x = origine.x + dx
    const y = origine.y + dy
    pan.setValue({ x, y })
    const colonna = Math.min(colonne - 1, Math.max(0, Math.round(x / lato)))
    const riga = Math.min(righe - 1, Math.max(0, Math.round(y / altezza)))
    const lista = stato.current.ordine
    const dove = Math.min(lista.length - 1, riga * colonne + colonna)
    const ora = lista.indexOf(chiave)
    if (dove !== ora) {
      LayoutAnimation.configureNext(LayoutAnimation.create(180, 'easeInEaseOut', 'opacity'))
      const nuova = sposta(lista, ora, dove)
      stato.current.ordine = nuova
      setOrdine(nuova)
      void Haptics.selectionAsync().catch(() => undefined)
    }
  }

  function fine() {
    const { chiave } = stato.current
    if (!chiave) {
      return
    }
    stato.current.chiave = null
    const finale = stato.current.ordine
    Animated.spring(pan, { toValue: posto(finale.indexOf(chiave)), useNativeDriver: false, speed: 20, bounciness: 4 }).start(() => setTrascinata(null))
    ordina(finale)
  }

  // Azioni di VoiceOver: una posizione prima o dopo.
  function passo(chiave: string, verso: -1 | 1) {
    const i = ordine.indexOf(chiave)
    const dove = i + verso
    if (dove < 0 || dove >= ordine.length) {
      return
    }
    const nuova = sposta(ordine, i, dove)
    setOrdine(nuova)
    ordina(nuova)
  }

  const perChiave = new Map(voci.map((v) => [v.chiave, v]))

  return (
    <View style={{ height: righe * altezza }}>
      {ordine.map((chiave, i) => {
        const v = perChiave.get(chiave)
        if (!v) {
          return null
        }
        const sollevata = chiave === trascinata
        const p = posto(i)
        const giro = oscilla.interpolate({ inputRange: [-1, 1], outputRange: i % 2 ? ['2deg', '-2deg'] : ['-2deg', '2deg'] })
        return (
          <Tessera
            key={chiave}
            attiva={modifica}
            inizia={() => inizia(chiave)}
            muovi={muovi}
            fine={fine}
            stile={
              sollevata
                ? { position: 'absolute', left: pan.x, top: pan.y, width: lato, zIndex: 10, transform: [{ scale: 1.12 }] }
                : { position: 'absolute', left: p.x, top: p.y, width: lato }
            }
          >
            <Pressable
              onPress={() => (modifica ? undefined : apri(v))}
              onLongPress={() => {
                if (!modifica) {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined)
                  entraInModifica()
                }
              }}
              delayLongPress={400}
              style={({ pressed }) => [s.voce, { opacity: pressed && !modifica ? 0.7 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={v.nome}
              accessibilityHint={modifica ? t('gestable.trascinaAiuto') : t('gestable.tieniPremuto')}
              accessibilityActions={
                modifica
                  ? [
                      { name: 'prima', label: t('gestable.spostaPrima') },
                      { name: 'dopo', label: t('gestable.spostaDopo') },
                    ]
                  : [{ name: 'longpress', label: t('gestable.riordina') }]
              }
              onAccessibilityAction={(e) => {
                if (e.nativeEvent.actionName === 'prima') {
                  passo(chiave, -1)
                } else if (e.nativeEvent.actionName === 'dopo') {
                  passo(chiave, 1)
                } else if (e.nativeEvent.actionName === 'longpress') {
                  entraInModifica()
                }
              }}
            >
              <Animated.View style={modifica && !sollevata ? { transform: [{ rotate: giro }] } : undefined}>{disegna(v, sollevata)}</Animated.View>
            </Pressable>
          </Tessera>
        )
      })}
    </View>
  )
}

/**
 * Una casella della griglia. In modifica prende il dito appena si muove (anche
 * dopo la pressione lunga che ha aperto la modifica, che l'aveva il Pressable).
 */
function Tessera({
  attiva,
  inizia,
  muovi,
  fine,
  stile,
  children,
}: {
  attiva: boolean
  inizia: () => void
  muovi: (dx: number, dy: number) => void
  fine: () => void
  stile: object
  children: ReactNode
}) {
  // Le funzioni cambiano a ogni disegno: il PanResponder (creato una volta, se no
  // un trascinamento in corso perderebbe il suo stato) legge le ultime dal ref.
  const fn = useRef({ attiva, inizia, muovi, fine })
  useEffect(() => {
    fn.current = { attiva, inizia, muovi, fine }
  })
  // Il ref si legge solo negli eventi del dito, mai durante il disegno.
  // eslint-disable-next-line react-hooks/refs
  const [risponde] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => fn.current.attiva && Math.abs(g.dx) + Math.abs(g.dy) > 3,
      onPanResponderGrant: () => fn.current.inizia(),
      onPanResponderMove: (_, g) => fn.current.muovi(g.dx, g.dy),
      onPanResponderRelease: () => fn.current.fine(),
      onPanResponderTerminate: () => fn.current.fine(),
      onPanResponderTerminationRequest: () => false,
    }),
  )
  return (
    <Animated.View style={stile} {...risponde.panHandlers}>
      {children}
    </Animated.View>
  )
}

const s = StyleSheet.create({
  voce: { alignItems: 'center' },
})
