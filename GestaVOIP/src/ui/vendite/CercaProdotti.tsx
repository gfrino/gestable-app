/**
 * Foglio per scegliere un prodotto da vendere: ricerca per nome, codice o
 * codice a barre, con foto, codice e prezzo di listino. Toccandolo si sceglie.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useEffect, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { t } from '../../i18n'
import { cercaProdotti, immagineProdotto, type Prodotto } from '../../odoo/vendite'
import { Avatar } from '../Avatar'
import { Caricamento } from '../Caricamento'
import { Foglio } from '../Foglio'
import { importo } from '../formatoVendite'
import { raggio, spazio, useColori } from '../tema'

type Props = {
  aperto: boolean
  server: string
  valuta: string
  chiudi: () => void
  scegli: (p: Prodotto) => void
}

export function CercaProdotti({ aperto, server, valuta, chiudi, scegli }: Props) {
  const c = useColori()
  const [testo, setTesto] = useState('')
  const [lista, setLista] = useState<Prodotto[] | null>(null)
  const [errore, setErrore] = useState('')

  useEffect(() => {
    if (!aperto) {
      return
    }
    let vivo = true
    const x = setTimeout(
      () => {
        cercaProdotti(server, testo)
          .then((r) => {
            if (vivo) {
              setLista(r)
              setErrore('')
            }
          })
          .catch((e: unknown) => vivo && setErrore(e instanceof Error ? e.message : String(e)))
      },
      testo ? 300 : 0,
    )
    return () => {
      vivo = false
      clearTimeout(x)
    }
  }, [aperto, server, testo])

  function chiudiTutto() {
    setTesto('')
    chiudi()
  }

  return (
    <Foglio aperto={aperto} titolo={t('vendite.aggiungiProdotto')} chiudi={chiudiTutto} fatto={t('comune.chiudi')}>
      <View style={[s.cerca, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
        <Ionicons name="search" size={18} color={c.testo3} />
        <TextInput
          style={[s.campo, { color: c.testo }]}
          value={testo}
          onChangeText={setTesto}
          placeholder={t('vendite.cercaProdotto')}
          placeholderTextColor={c.testo3}
          autoCorrect={false}
          autoFocus
          clearButtonMode="while-editing"
        />
      </View>
      {errore ? (
        <Text style={[s.errore, { color: c.rosso }]}>{errore}</Text>
      ) : !lista ? (
        <Caricamento style={{ marginTop: spazio.xl }} />
      ) : (
        <FlatList
          data={lista}
          keyExtractor={(p) => String(p.id)}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={<Text style={[s.errore, { color: c.testo3 }]}>{t('vendite.nessunProdotto')}</Text>}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                setTesto('')
                scegli(item)
              }}
              style={({ pressed }) => [s.riga, { backgroundColor: pressed ? c.superficie2 : 'transparent' }]}
              accessibilityRole="button"
            >
              <Avatar url={immagineProdotto(server, item.id)} nome={item.nome} lato={44} logo icona="cube-outline" />
              <View style={{ flex: 1 }}>
                <Text style={[s.nome, { color: c.testo }]} numberOfLines={2}>
                  {item.nome}
                </Text>
                <Text style={[s.sotto, { color: c.testo2 }]} numberOfLines={1}>
                  {[importo(item.prezzo, valuta), item.unita].filter(Boolean).join(' / ')}
                </Text>
              </View>
              <Ionicons name="add-circle" size={26} color={c.primario} />
            </Pressable>
          )}
        />
      )}
    </Foglio>
  )
}

const s = StyleSheet.create({
  cerca: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, margin: spazio.l, paddingHorizontal: spazio.m, borderRadius: raggio.m, borderWidth: 1 },
  campo: { flex: 1, fontSize: 16, paddingVertical: 10 },
  errore: { fontSize: 15, textAlign: 'center', marginTop: spazio.xl, paddingHorizontal: spazio.xl },
  riga: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, paddingHorizontal: spazio.l, paddingVertical: spazio.s, minHeight: 60 },
  nome: { fontSize: 16, fontWeight: '600' },
  sotto: { fontSize: 14, marginTop: 2 },
})
