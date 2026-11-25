/** Barra in alto delle schermate aperte dal menu: indietro, titolo, azione a destra. */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useRouter } from 'expo-router'
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { spazio, useColori } from './tema'

export function Testata({ titolo, sottotitolo, destra, sinistra }: { titolo: string; sottotitolo?: string; destra?: ReactNode; sinistra?: ReactNode }) {
  const c = useColori()
  const router = useRouter()
  return (
    <View style={[s.barra, { borderBottomColor: c.bordo }]}>
      {sinistra ?? (
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          hitSlop={12}
          style={s.tasto}
          accessibilityRole="button"
          accessibilityLabel="Indietro"
        >
          <Ionicons name="chevron-back" size={28} color={c.primario} />
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[s.titolo, { color: c.testo }]} numberOfLines={1}>
          {titolo}
        </Text>
        {sottotitolo ? (
          <Text style={[s.sotto, { color: c.testo2 }]} numberOfLines={1}>
            {sottotitolo}
          </Text>
        ) : null}
      </View>
      {destra}
    </View>
  )
}

const s = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spazio.s,
    paddingHorizontal: spazio.m,
    paddingVertical: spazio.s,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tasto: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  titolo: { fontSize: 20, fontWeight: '700' },
  sotto: { fontSize: 13, marginTop: 1 },
})
