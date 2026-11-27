/**
 * Foglio che sale dal basso (scheda del telefono): titolo, «Fine» a destra,
 * contenuto. Su iPhone e' il foglio nativo (pageSheet), su Android a schermo
 * intero.
 */

import type { ReactNode } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { t } from '../i18n'
import { spazio, useColori } from './tema'

type Props = {
  aperto: boolean
  titolo: string
  chiudi: () => void
  children: ReactNode
  /** Testo del tasto a destra (di solito «Fine»). */
  fatto?: string
}

export function Foglio({ aperto, titolo, chiudi, children, fatto = t('comune.fine') }: Props) {
  const c = useColori()
  return (
    <Modal visible={aperto} animationType="slide" presentationStyle="pageSheet" onRequestClose={chiudi}>
      <SafeAreaProvider>
        <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top', 'bottom', 'left', 'right']}>
          <View style={[s.barra, { borderBottomColor: c.bordo }]}>
            <Text style={[s.titolo, { color: c.testo }]} numberOfLines={1}>
              {titolo}
            </Text>
            <Pressable onPress={chiudi} hitSlop={12} accessibilityRole="button" style={s.fatto}>
              <Text style={[s.fattoTesto, { color: c.primario }]} numberOfLines={1}>
                {fatto}
              </Text>
            </Pressable>
          </View>
          <View style={{ flex: 1 }}>{children}</View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1 },
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spazio.l,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spazio.m,
  },
  titolo: { flex: 1, fontSize: 18, fontWeight: '700' },
  fatto: { minHeight: 40, justifyContent: 'center' },
  fattoTesto: { fontSize: 17, fontWeight: '700' },
})
