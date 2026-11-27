/**
 * Foglio per scegliere un valore cercandolo in Odoo (azienda, paese,
 * venditore, termini di pagamento...): la ricerca parte mentre si scrive.
 * Una scelta chiude il foglio; con `multipla` si spuntano piu' voci
 * (etichette) e si chiude con «Fine». «Nessuno» svuota il campo.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useEffect, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { t } from '../i18n'
import { Caricamento } from './Caricamento'
import { Foglio } from './Foglio'
import { raggio, spazio, useColori } from './tema'

export type Opzione = { id: number; nome: string; valore?: string }

type Props = {
  aperto: boolean
  titolo: string
  cerca: (testo: string) => Promise<Opzione[]>
  /** Gli id gia' scelti (spunta). */
  scelti: number[]
  multipla?: boolean
  /** Testo della voce che svuota il campo; senza, la voce non c'e'. */
  vuota?: string
  chiudi: () => void
  scegli: (o: Opzione | null) => void
  /** Se c'e': con un testo che non si trova, «Crea "testo"» crea la voce e la sceglie. */
  crea?: (nome: string) => Promise<Opzione>
}

export function SceltaRicerca({ aperto, titolo, cerca, scelti, multipla, vuota, chiudi, scegli, crea }: Props) {
  const c = useColori()
  const [testo, setTesto] = useState('')
  const [lista, setLista] = useState<Opzione[] | null>(null)
  const [errore, setErrore] = useState('')

  useEffect(() => {
    if (!aperto) {
      return
    }
    let vivo = true
    const x = setTimeout(
      () => {
        cerca(testo)
          .then((r) => vivo && (setLista(r), setErrore('')))
          .catch((e: unknown) => vivo && setErrore(e instanceof Error ? e.message : String(e)))
      },
      testo ? 300 : 0,
    )
    return () => {
      vivo = false
      clearTimeout(x)
    }
    // cerca cambia a ogni disegno del genitore: conta solo il testo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aperto, testo])

  const presi = new Set(scelti)

  // Chiudendo (o scegliendo, che chiude) si riparte da zero la volta dopo.
  function azzera() {
    setTesto('')
    setLista(null)
  }
  function chiudiTutto() {
    azzera()
    chiudi()
  }
  function prendi(o: Opzione | null) {
    if (!multipla) {
      azzera()
    }
    scegli(o)
  }

  return (
    <Foglio aperto={aperto} titolo={titolo} chiudi={chiudiTutto} fatto={multipla ? t('comune.fine') : t('comune.chiudi')}>
      <View style={[s.cerca, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
        <Ionicons name="search" size={18} color={c.testo3} />
        <TextInput
          style={[s.campo, { color: c.testo }]}
          value={testo}
          onChangeText={setTesto}
          placeholder={t('calendario.cerca')}
          placeholderTextColor={c.testo3}
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>
      {errore ? (
        <Text style={[s.vuoto, { color: c.rosso }]}>{errore}</Text>
      ) : !lista ? (
        <Caricamento style={{ marginTop: spazio.xl }} />
      ) : (
        <FlatList
          data={lista}
          keyExtractor={(o) => `${o.id}-${o.valore || ''}`}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={
            vuota && !testo ? (
              <Pressable onPress={() => prendi(null)} style={({ pressed }) => [s.riga, { backgroundColor: pressed ? c.superficie2 : 'transparent' }]} accessibilityRole="button">
                <Text style={[s.nome, { color: c.testo2 }]}>{vuota}</Text>
                {!scelti.length ? <Ionicons name="checkmark" size={22} color={c.primario} /> : null}
              </Pressable>
            ) : null
          }
          ListEmptyComponent={testo.trim() && crea ? null : <Text style={[s.vuoto, { color: c.testo3 }]}>{t('schede.nessunRisultato')}</Text>}
          ListFooterComponent={
            crea && testo.trim() && !lista.some((o) => o.nome.toLowerCase() === testo.trim().toLowerCase()) ? (
              <Pressable
                onPress={() =>
                  void crea(testo)
                    .then((o) => {
                      setLista((l) => (l ? [o, ...l] : [o]))
                      prendi(o)
                    })
                    .catch((e: unknown) => setErrore(e instanceof Error ? e.message : String(e)))
                }
                style={({ pressed }) => [s.riga, { backgroundColor: pressed ? c.superficie2 : 'transparent' }]}
                accessibilityRole="button"
              >
                <Ionicons name="add-circle" size={22} color={c.primario} />
                <Text style={[s.nome, { color: c.primario }]} numberOfLines={2}>
                  {t('schede.creaVoce', { nome: testo.trim() })}
                </Text>
              </Pressable>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => prendi(item)}
              style={({ pressed }) => [s.riga, { backgroundColor: pressed ? c.superficie2 : 'transparent' }]}
              accessibilityRole={multipla ? 'checkbox' : 'button'}
              accessibilityState={{ checked: presi.has(item.id) }}
            >
              <Text style={[s.nome, { color: c.testo }]} numberOfLines={2}>
                {item.nome}
              </Text>
              {presi.has(item.id) ? <Ionicons name={multipla ? 'checkmark-circle' : 'checkmark'} size={22} color={c.primario} /> : null}
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
  riga: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, paddingHorizontal: spazio.l, paddingVertical: 14 },
  nome: { flex: 1, fontSize: 17 },
  vuoto: { fontSize: 15, textAlign: 'center', marginTop: spazio.xl, paddingHorizontal: spazio.xl },
})
