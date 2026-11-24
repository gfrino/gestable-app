/**
 * Tastierino: si compone un numero, oppure si scrive un nome e si sceglie il
 * contatto da Odoo. Le cifre cercano anche fra i numeri salvati in Odoo.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import * as Haptics from 'expo-haptics'
import { useEffect, useRef, useState } from 'react'
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { cercaContatti, type Contatto } from '../../voip/api'
import { useApp } from '../../voip/Contesto'
import { telefono } from '../../voip/telefono'
import { StatoLinea } from '../../ui/StatoLinea'
import { raggio, spazio, useColori } from '../../ui/tema'

const TASTI: [string, string][] = [
  ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
  ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
  ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
  ['*', ''], ['0', '+'], ['#', ''],
]

export default function Tastierino() {
  const c = useColori()
  const { sessione } = useApp()
  const [testo, setTesto] = useState('')
  const [scelto, setScelto] = useState<Contatto | null>(null)
  const [trovati, setTrovati] = useState<{ termine: string; voci: Contatto[] }>({ termine: '', voci: [] })
  const ricerca = useRef(0)
  const termine = testo.trim()
  const cerca = !!sessione && termine.length >= 2 && !scelto

  // Ricerca nei contatti di Odoo: dopo una breve pausa, e solo l'ultima
  // risposta conta (chi digita veloce non vede risultati vecchi).
  useEffect(() => {
    if (!cerca || !sessione) {
      return
    }
    const mia = ++ricerca.current
    const timer = setTimeout(() => {
      cercaContatti(sessione.server, termine)
        .then((voci) => mia === ricerca.current && setTrovati({ termine, voci }))
        .catch(() => mia === ricerca.current && setTrovati({ termine, voci: [] }))
    }, 250)
    return () => clearTimeout(timer)
  }, [cerca, termine, sessione])

  // Si mostrano solo i risultati della ricerca corrente.
  const risultati = cerca && trovati.termine === termine ? trovati.voci : []

  function premi(cifra: string) {
    void Haptics.selectionAsync()
    setScelto(null)
    setTesto((t) => t + cifra)
  }

  function cancella() {
    setScelto(null)
    setTesto((t) => t.slice(0, -1))
  }

  async function chiama() {
    const numero = scelto?.number || testo
    if (!/\d/.test(numero)) {
      return
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    try {
      await telefono.chiama(numero, scelto?.name || '')
      setTesto('')
      setScelto(null)
    } catch (e) {
      Alert.alert('Chiamata non partita', e instanceof Error ? e.message : String(e))
    }
  }

  const tastoTesto = { color: c.testo }
  const cercaLettere = /[a-z]/i.test(testo)

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top']}>
      <View style={s.alto}>
        <StatoLinea />
      </View>

      <View style={s.display}>
        <TextInput
          style={[s.numero, { color: c.testo }]}
          value={scelto ? scelto.name : testo}
          onChangeText={(t) => {
            setScelto(null)
            setTesto(t)
          }}
          placeholder="Numero o nome"
          placeholderTextColor={c.testo3}
          autoCorrect={false}
          autoCapitalize="words"
          showSoftInputOnFocus={cercaLettere}
          textAlign="center"
          accessibilityLabel="Numero da chiamare"
        />
        {scelto ? (
          <Text style={[s.dettaglio, { color: c.testo2 }]} numberOfLines={1}>
            {scelto.number} · {scelto.label}
          </Text>
        ) : null}
      </View>

      {risultati.length > 0 ? (
        <FlatList
          style={[s.lista, { backgroundColor: c.superficie, borderColor: c.bordo }]}
          data={risultati}
          keyExtractor={(r) => r.key}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [s.voce, { backgroundColor: pressed ? c.superficie2 : 'transparent' }]}
              onPress={() => setScelto(item)}
            >
              <View style={{ flex: 1 }}>
                <Text style={[s.voceNome, { color: c.testo }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[s.voceSub, { color: c.testo2 }]} numberOfLines={1}>
                  {item.number}
                  {item.subtitle ? ` · ${item.subtitle}` : ''}
                </Text>
              </View>
              <Text style={[s.voceTipo, { color: c.testo3 }]}>{item.label}</Text>
            </Pressable>
          )}
        />
      ) : (
        <View style={s.griglia}>
          {TASTI.map(([cifra, lettere]) => (
            <Pressable
              key={cifra}
              onPress={() => premi(cifra)}
              onLongPress={cifra === '0' ? () => premi('+') : undefined}
              style={({ pressed }) => [s.tasto, { backgroundColor: pressed ? c.superficie2 : c.superficie }]}
              accessibilityRole="button"
              accessibilityLabel={cifra}
            >
              <Text style={[s.cifra, tastoTesto]}>{cifra}</Text>
              {lettere ? <Text style={[s.lettere, { color: c.testo3 }]}>{lettere}</Text> : null}
            </Pressable>
          ))}
        </View>
      )}

      <View style={s.azioni}>
        <View style={s.lato} />
        <Pressable
          onPress={chiama}
          style={({ pressed }) => [s.chiama, { backgroundColor: c.verde, opacity: pressed ? 0.8 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Chiama"
        >
          <Ionicons name="call" size={32} color="#FFFFFF" />
        </Pressable>
        <View style={s.lato}>
          {testo || scelto ? (
            <Pressable
              onPress={cancella}
              onLongPress={() => {
                setTesto('')
                setScelto(null)
              }}
              hitSlop={16}
              accessibilityRole="button"
              accessibilityLabel="Cancella"
            >
              <Ionicons name="backspace-outline" size={28} color={c.testo2} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1, paddingHorizontal: spazio.xl },
  alto: { paddingTop: spazio.m, alignItems: 'center' },
  display: { minHeight: 96, justifyContent: 'center', paddingVertical: spazio.l },
  numero: { fontSize: 34, fontWeight: '500', letterSpacing: 1 },
  dettaglio: { fontSize: 14, textAlign: 'center', marginTop: 4 },
  lista: { flex: 1, borderWidth: 1, borderRadius: raggio.l, marginBottom: spazio.m },
  voce: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spazio.l, paddingVertical: spazio.m, gap: spazio.m },
  voceNome: { fontSize: 16, fontWeight: '600' },
  voceSub: { fontSize: 13, marginTop: 2 },
  voceTipo: { fontSize: 12 },
  griglia: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignContent: 'center', rowGap: spazio.m },
  tasto: { width: '30%', aspectRatio: 1.45, borderRadius: raggio.l, alignItems: 'center', justifyContent: 'center' },
  cifra: { fontSize: 30, fontWeight: '500' },
  lettere: { fontSize: 11, letterSpacing: 1.5, marginTop: -2 },
  azioni: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spazio.l },
  lato: { width: 64, alignItems: 'center' },
  chiama: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
})
