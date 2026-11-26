/**
 * Foglio per scegliere da un elenco di Odoo (team, categoria, etichette, fase):
 * una voce sola (si chiude toccandola) o piu' voci (spunte, «Fine» per chiudere).
 * Con tante voci compare la ricerca.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { t } from '../i18n'
import { Foglio } from './Foglio'
import { raggio, spazio, useColori } from './tema'

export type Voce = { id: number; nome: string }

type Props = {
  aperto: boolean
  titolo: string
  voci: Voce[]
  scelte: number[]
  multipla?: boolean
  /** Voce «Nessuna» in cima (toglie la scelta). */
  vuota?: string
  chiudi: () => void
  scegli: (ids: number[]) => void
}

export function SceltaElenco({ aperto, titolo, voci, scelte, multipla, vuota, chiudi, scegli }: Props) {
  const c = useColori()
  const [testo, setTesto] = useState('')
  const q = testo.trim().toLowerCase()
  const lista = q ? voci.filter((v) => v.nome.toLowerCase().includes(q)) : voci
  const sel = new Set(scelte)

  function tocca(id: number | null) {
    if (!multipla) {
      scegli(id ? [id] : [])
      chiudi()
      return
    }
    if (id === null) {
      scegli([])
      return
    }
    scegli(sel.has(id) ? scelte.filter((x) => x !== id) : [...scelte, id])
  }

  return (
    <Foglio aperto={aperto} titolo={titolo} chiudi={chiudi} fatto={multipla ? t('comune.fine') : t('comune.chiudi')}>
      {voci.length > 8 ? (
        <View style={[s.cerca, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
          <Ionicons name="search" size={18} color={c.testo3} />
          <TextInput
            style={[s.campo, { color: c.testo }]}
            value={testo}
            onChangeText={setTesto}
            placeholder={t('calendario.cerca')}
            placeholderTextColor={c.testo3}
            autoCorrect={false}
          />
        </View>
      ) : null}
      <FlatList
        data={lista}
        keyExtractor={(v) => String(v.id)}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          vuota && !q ? (
            <Pressable onPress={() => tocca(null)} style={({ pressed }) => [s.riga, { backgroundColor: pressed ? c.superficie2 : 'transparent' }]}>
              <Text style={[s.nome, { color: c.testo2 }]}>{vuota}</Text>
              {!scelte.length ? <Ionicons name="checkmark" size={22} color={c.primario} /> : null}
            </Pressable>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => tocca(item.id)}
            style={({ pressed }) => [s.riga, { backgroundColor: pressed ? c.superficie2 : 'transparent' }]}
            accessibilityRole="button"
            accessibilityState={{ selected: sel.has(item.id) }}
          >
            <Text style={[s.nome, { color: c.testo }]} numberOfLines={1}>
              {item.nome}
            </Text>
            {sel.has(item.id) ? <Ionicons name={multipla ? 'checkmark-circle' : 'checkmark'} size={22} color={c.primario} /> : null}
          </Pressable>
        )}
      />
    </Foglio>
  )
}

const s = StyleSheet.create({
  cerca: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, margin: spazio.l, paddingHorizontal: spazio.m, borderRadius: raggio.m, borderWidth: 1 },
  campo: { flex: 1, fontSize: 16, paddingVertical: 10 },
  riga: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, paddingHorizontal: spazio.l, paddingVertical: 14 },
  nome: { flex: 1, fontSize: 17 },
})
