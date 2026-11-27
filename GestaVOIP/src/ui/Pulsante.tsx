import Ionicons from '@expo/vector-icons/Ionicons'
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native'
import { raggio, useColori } from './tema'

type Props = {
  testo: string
  onPress: () => void
  occupato?: boolean
  variante?: 'primario' | 'tenue' | 'pericolo'
  /** Icona dopo il testo (es. la freccia di «Odoo web view»). */
  icona?: keyof typeof Ionicons.glyphMap
}

/** Pulsante a tutta larghezza: etichetta corta, sempre su una riga. */
export function Pulsante({ testo, onPress, occupato, variante = 'primario', icona }: Props) {
  const c = useColori()
  const sfondo = variante === 'primario' ? c.primario : variante === 'pericolo' ? c.rossoTenue : c.superficie2
  const colore = variante === 'primario' ? c.primarioTesto : variante === 'pericolo' ? c.rosso : c.testo
  return (
    <Pressable
      onPress={onPress}
      disabled={occupato}
      accessibilityRole="button"
      style={({ pressed }) => [s.base, { backgroundColor: sfondo, opacity: pressed || occupato ? 0.75 : 1 }]}
    >
      {occupato ? (
        <ActivityIndicator color={colore} />
      ) : (
        <>
          <Text style={[s.testo, { color: colore }]} numberOfLines={1}>
            {testo}
          </Text>
          {icona ? <Ionicons name={icona} size={20} color={colore} /> : null}
        </>
      )}
    </Pressable>
  )
}

const s = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: raggio.m,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginTop: 8,
  },
  testo: { fontSize: 17, fontWeight: '600' },
})
