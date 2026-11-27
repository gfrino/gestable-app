/**
 * Barra in alto delle schermate aperte dal menu: indietro, titolo, azione a destra.
 * Quando la stessa schermata e' una scheda in basso (Messaggi, Attivita', Spese
 * spostati dal menu), al posto di «indietro» c'e' il pulsante del menu ≡.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useRouter } from 'expo-router'
import { createContext, useContext, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { t } from '../i18n'
import { PulsanteMenu } from './MenuLaterale'
import { spazio, useColori } from './tema'

/** Vero dentro app/(tabs)/scheda-*.tsx: la schermata e' una scheda, non si torna indietro. */
export const InScheda = createContext(false)

export function Testata({ titolo, sottotitolo, destra, sinistra }: { titolo: string; sottotitolo?: string; destra?: ReactNode; sinistra?: ReactNode }) {
  const c = useColori()
  const router = useRouter()
  const scheda = useContext(InScheda)
  return (
    <View style={[s.barra, { borderBottomColor: c.bordo }]}>
      {sinistra ?? (scheda ? <PulsanteMenu /> : (
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          hitSlop={12}
          style={s.tasto}
          accessibilityRole="button"
          accessibilityLabel={t('comune.indietro')}
        >
          <Ionicons name="chevron-back" size={28} color={c.primario} />
        </Pressable>
      ))}
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
