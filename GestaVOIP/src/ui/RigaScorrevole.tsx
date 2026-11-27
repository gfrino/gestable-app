/**
 * Riga che si chiude scorrendo a sinistra, come le notifiche di iOS: sotto
 * compare l'azione (icona e testo), oltre un terzo della larghezza (o con uno
 * scatto veloce) la riga esce dallo schermo e parte `scorri`; meno di cosi'
 * torna al suo posto. Il tocco normale resta ai figli (Pressable).
 *
 * Solo JavaScript (PanResponder + Animated): nessuna libreria nativa, va
 * anche con un aggiornamento OTA. Con VoiceOver l'azione e' tra le «Azioni».
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, PanResponder, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { spazio } from './tema'

type Props = {
  children: ReactNode
  /** Testo dell'azione (sotto la riga e per VoiceOver). */
  testo: string
  icona: keyof typeof Ionicons.glyphMap
  colore: string
  scorri: () => void
  /** Mentre si scorre la lista non deve scorrere in verticale. */
  trascina?: (attivo: boolean) => void
}

export function RigaScorrevole({ children, testo, icona, colore, scorri, trascina }: Props) {
  const { width } = useWindowDimensions()
  const [x] = useState(() => new Animated.Value(0))
  // I valori cambiano a ogni render, il PanResponder si crea una volta sola.
  const ultimo = useRef({ width, scorri, trascina })
  useEffect(() => {
    ultimo.current = { width, scorri, trascina }
  })

  // Il ref si legge solo negli eventi del dito, mai durante il disegno.
  // eslint-disable-next-line react-hooks/refs
  const [risposta] = useState(() =>
    PanResponder.create({
      // Solo un movimento chiaramente orizzontale verso sinistra: il resto e' della lista.
      onMoveShouldSetPanResponder: (_, g) => g.dx < -10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderGrant: () => ultimo.current.trascina?.(true),
      onPanResponderMove: (_, g) => x.setValue(Math.min(0, g.dx)),
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, g) => {
        const { width: w, scorri: fai, trascina: tr } = ultimo.current
        tr?.(false)
        if (g.dx < -w / 3 || (g.vx < -0.8 && g.dx < -40)) {
          Animated.timing(x, { toValue: -w, duration: 180, useNativeDriver: true }).start(() => fai())
        } else {
          Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start()
        }
      },
      onPanResponderTerminate: () => {
        ultimo.current.trascina?.(false)
        Animated.spring(x, { toValue: 0, useNativeDriver: true }).start()
      },
    }),
  )

  // L'azione sotto si fa vedere man mano che la riga si sposta.
  const opacita = x.interpolate({ inputRange: [-80, -20, 0], outputRange: [1, 0.3, 0], extrapolate: 'clamp' })

  return (
    <View
      accessibilityActions={[{ name: 'scorri', label: testo }]}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === 'scorri' && scorri()}
    >
      <Animated.View style={[StyleSheet.absoluteFill, s.sotto, { backgroundColor: colore, opacity: opacita }]}>
        <Ionicons name={icona} size={22} color="#FFFFFF" />
        <Text style={s.testo} numberOfLines={1}>
          {testo}
        </Text>
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX: x }] }} {...risposta.panHandlers}>
        {children}
      </Animated.View>
    </View>
  )
}

const s = StyleSheet.create({
  sotto: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spazio.s, paddingHorizontal: spazio.xl },
  testo: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
})
