/**
 * Schermata vuota (tutto letto, niente da fare): un cerchio tenue con l'icona
 * nel colore del tema, un titolo e una riga di spiegazione. Uguale in tutte le
 * liste dell'app.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { spazio, useColori } from './tema'

type Props = {
  icona: keyof typeof Ionicons.glyphMap
  titolo: string
  testo?: string
  /** Pulsanti o altro sotto il testo. */
  children?: ReactNode
}

export function StatoVuoto({ icona, titolo, testo, children }: Props) {
  const c = useColori()
  return (
    <View style={s.blocco} accessibilityRole="summary">
      <View style={[s.alone, { backgroundColor: c.primarioTenue }]}>
        <View style={[s.cerchio, { backgroundColor: c.superficie, shadowColor: c.primario }]}>
          <Ionicons name={icona} size={34} color={c.primario} />
        </View>
      </View>
      <Text style={[s.titolo, { color: c.testo }]}>{titolo}</Text>
      {testo ? <Text style={[s.testo, { color: c.testo2 }]}>{testo}</Text> : null}
      {children ? <View style={s.azioni}>{children}</View> : null}
    </View>
  )
}

const s = StyleSheet.create({
  blocco: { alignItems: 'center', paddingHorizontal: spazio.xl, marginTop: spazio.xxl * 2 },
  alone: { width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center', marginBottom: spazio.l },
  cerchio: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  titolo: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  testo: { fontSize: 15, lineHeight: 21, textAlign: 'center', marginTop: spazio.xs },
  azioni: { alignSelf: 'stretch', marginTop: spazio.l },
})
