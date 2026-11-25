/**
 * Caricamento con la «G» del logo GestABLE al posto della rotellina: fa un
 * giro, rallenta e si ferma un attimo quando torna dritto, poi riparte; a
 * ogni giro cambia colore (i colori del tema, partendo da quello scelto); lo
 * spicchio interno resta della stessa tinta, piu' chiaro, come nel logo.
 *
 * L'animazione gira sul thread nativo (useNativeDriver): non pesa sul
 * JavaScript che intanto carica i dati. Con «Riduci movimento» attivo il logo
 * resta fermo e cambia solo colore.
 */

import { useEffect, useMemo, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, useColorScheme, View, type StyleProp, type ViewStyle } from 'react-native'
import { t } from '../i18n'
import { COLORI_TEMA, useAspetto, type ColoreTema } from './Aspetto'

const ANELLO = require('../../assets/caricamento-g.png') as number
const SPICCHIO = require('../../assets/caricamento-g-spicchio.png') as number

const GIRO_MS = 900
const PAUSA_MS = 280

type Props = {
  /** Lato del logo in punti (48 per una schermata intera). */
  dimensione?: number
  style?: StyleProp<ViewStyle>
}

export function Caricamento({ dimensione = 48, style }: Props) {
  const scuro = useColorScheme() === 'dark'
  const { colore } = useAspetto().aspetto
  // Il colore scelto per primo, poi gli altri del tema, e il verde delle chiamate.
  const colori = useMemo(() => {
    const ordine = [colore, ...(Object.keys(COLORI_TEMA) as ColoreTema[]).filter((x) => x !== colore)]
    const tinte = ordine.map((x) => COLORI_TEMA[x][scuro ? 'scuro' : 'chiaro'][0])
    tinte.splice(1, 0, scuro ? '#1FBB67' : '#17A35A')
    return tinte
  }, [colore, scuro])

  // Il valore animato vive quanto il componente (useState, non un ref letto durante il render).
  const [giro] = useState(() => new Animated.Value(0))
  const [indice, setIndice] = useState(0)

  useEffect(() => {
    let attivo = true
    let animazione: Animated.CompositeAnimation | null = null

    function prossimo(fermo: boolean) {
      if (!attivo) {
        return
      }
      giro.setValue(0)
      animazione = fermo
        ? Animated.delay(GIRO_MS + PAUSA_MS)
        : Animated.sequence([
            Animated.timing(giro, {
              toValue: 1,
              duration: GIRO_MS,
              easing: Easing.inOut(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.delay(PAUSA_MS),
          ])
      animazione.start(({ finished }) => {
        if (finished && attivo) {
          setIndice((i) => i + 1)
          prossimo(fermo)
        }
      })
    }

    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((ridotto) => prossimo(ridotto))

    return () => {
      attivo = false
      animazione?.stop()
    }
  }, [giro])

  const rotazione = useMemo(() => giro.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }), [giro])

  const tinta = colori[indice % colori.length]

  return (
    <View
      style={[s.centro, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('comune.caricamento')}
    >
      <Animated.View style={{ width: dimensione, height: dimensione, transform: [{ rotate: rotazione }] }}>
        <Image source={ANELLO} style={[s.strato, { width: dimensione, height: dimensione, tintColor: tinta }]} />
        <Image source={SPICCHIO} style={[s.strato, { width: dimensione, height: dimensione, tintColor: tinta, opacity: 0.55 }]} />
      </Animated.View>
    </View>
  )
}

const s = StyleSheet.create({
  centro: { alignItems: 'center', justifyContent: 'center' },
  strato: { position: 'absolute', top: 0, left: 0 },
})
