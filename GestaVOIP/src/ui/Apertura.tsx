/**
 * Apertura dell'app: la schermata di avvio nativa mostra la «G» al centro;
 * quando l'app e' pronta la stessa «G» (stesso posto, stessa misura) si
 * ritrae appena e poi si ingrandisce fino a riempire lo schermo, mentre lo
 * sfondo svanisce e scopre la prima schermata.
 *
 * La schermata nativa resta finche' non si e' pronti (preventAutoHideAsync in
 * app/_layout.tsx); se qualcosa non arriva, dopo qualche secondo si apre lo stesso.
 */

import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, StyleSheet, useColorScheme } from 'react-native'

const G = require('../../assets/splash-g.png') as number
// Stessa misura della schermata nativa (imageWidth in app.config.js).
const LATO = 120
const MASSIMO_MS = 5000

let pronta = false
const ascoltatori = new Set<() => void>()

/** La prima schermata e' pronta: l'apertura puo' partire. */
export function segnalaPronta() {
  if (!pronta) {
    pronta = true
    ascoltatori.forEach((fn) => fn())
  }
}

export function Apertura() {
  const scuro = useColorScheme() === 'dark'
  const [via, setVia] = useState(false)
  const [v] = useState(() => new Animated.Value(0))

  useEffect(() => {
    let partita = false
    function parti() {
      if (partita) {
        return
      }
      partita = true
      SplashScreen.hideAsync()
        .catch(() => undefined)
        .then(() => AccessibilityInfo.isReduceMotionEnabled().catch(() => false))
        .then((ridotto) => {
          const animazione = ridotto
            ? Animated.timing(v, { toValue: 1, duration: 250, useNativeDriver: true })
            : Animated.sequence([
                Animated.timing(v, { toValue: 0.15, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
                Animated.timing(v, { toValue: 1, duration: 560, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
              ])
          animazione.start(() => setVia(true))
        })
    }
    if (pronta) {
      parti()
    } else {
      ascoltatori.add(parti)
    }
    const scorta = setTimeout(parti, MASSIMO_MS)
    return () => {
      ascoltatori.delete(parti)
      clearTimeout(scorta)
    }
  }, [v])

  if (via) {
    return null
  }

  const scala = v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [1, 0.86, 28] })
  const velo = v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1, 0] })

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, s.velo, { backgroundColor: scuro ? '#0E1018' : '#F6F7FB', opacity: velo }]}
    >
      <Animated.Image source={G} style={{ width: LATO, height: LATO, transform: [{ scale: scala }] }} />
    </Animated.View>
  )
}

const s = StyleSheet.create({
  velo: { alignItems: 'center', justifyContent: 'center', zIndex: 1000, elevation: 1000 },
})
