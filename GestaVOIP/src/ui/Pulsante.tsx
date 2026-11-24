import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native'
import { raggio, useColori } from './tema'

type Props = {
  testo: string
  onPress: () => void
  occupato?: boolean
  variante?: 'primario' | 'tenue' | 'pericolo'
}

/** Pulsante a tutta larghezza: etichetta corta, sempre su una riga. */
export function Pulsante({ testo, onPress, occupato, variante = 'primario' }: Props) {
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
        <Text style={[s.testo, { color: colore }]} numberOfLines={1}>
          {testo}
        </Text>
      )}
    </Pressable>
  )
}

const s = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: raggio.m,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginTop: 8,
  },
  testo: { fontSize: 17, fontWeight: '600' },
})
