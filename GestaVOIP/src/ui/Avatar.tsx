/**
 * Foto di un contatto o di un utente di Odoo, con le iniziali se non c'e'.
 *
 * Odoo da' un disegno SVG a chi non ha la foto: React Native non lo disegna e
 * l'immagine va in errore, quindi restano le iniziali.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useState } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { useColori } from './tema'

export function iniziali(nome: string): string {
  const parole = nome.replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  if (!parole.length) {
    return ''
  }
  const prime = parole.length > 1 ? [parole[0], parole[parole.length - 1]] : [parole[0]]
  return prime.map((p) => p[0].toUpperCase()).join('')
}

type Props = {
  url?: string
  nome: string
  lato?: number
  icona?: keyof typeof Ionicons.glyphMap
  /** Loghi di aziende: quadrato arrotondato su bianco, logo intero (il cerchio lo taglierebbe). */
  logo?: boolean
}

export function Avatar({ url, nome, lato = 44, icona, logo }: Props) {
  const c = useColori()
  const [rotta, setRotta] = useState('')
  const forma = { width: lato, height: lato, borderRadius: logo ? lato * 0.24 : lato / 2 }
  const lettere = iniziali(nome)

  if (url && rotta !== url && logo) {
    return (
      <View style={[forma, s.logo, { padding: lato * 0.12 }]}>
        <Image
          source={{ uri: url }}
          style={s.logoImmagine}
          resizeMode="contain"
          onError={() => setRotta(url)}
          accessibilityIgnoresInvertColors
        />
      </View>
    )
  }
  if (url && rotta !== url) {
    return (
      <Image
        source={{ uri: url }}
        style={[forma, { backgroundColor: c.superficie2 }]}
        onError={() => setRotta(url)}
        accessibilityIgnoresInvertColors
      />
    )
  }
  return (
    <View style={[forma, s.vuoto, { backgroundColor: c.primarioTenue }]}>
      {icona || !lettere ? (
        <Ionicons name={icona || 'person'} size={lato * 0.5} color={c.primario} />
      ) : (
        <Text style={{ color: c.primario, fontSize: lato * 0.38, fontWeight: '700' }}>{lettere}</Text>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  vuoto: { alignItems: 'center', justifyContent: 'center' },
  logo: { backgroundColor: '#FFFFFF', overflow: 'hidden' },
  logoImmagine: { width: '100%', height: '100%' },
})
