/**
 * Tastierino: si compone un numero (le cifre propongono fino a due contatti di
 * Odoo sopra i tasti, senza mai coprirli), oppure con «Nome» si cerca un
 * contatto con la tastiera del telefono e lo si sceglie dalla lista.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import * as Haptics from 'expo-haptics'
import { useEffect, useRef, useState } from 'react'
import { Alert, FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
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
  const [modo, setModo] = useState<'numero' | 'nome'>('numero')
  const [testo, setTesto] = useState('')
  const [nome, setNome] = useState('')
  const [scelto, setScelto] = useState<Contatto | null>(null)
  const [trovati, setTrovati] = useState<{ termine: string; voci: Contatto[] }>({ termine: '', voci: [] })
  const ricerca = useRef(0)
  // Con il tastierino si cerca fra i numeri da 3 cifre in su; con la ricerca
  // per nome dal secondo carattere.
  const termine = (modo === 'nome' ? nome : testo).trim()
  const minimo = modo === 'nome' ? 2 : 3
  const cerca = !!sessione && termine.length >= minimo && !scelto

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

  // Si mostrano solo i risultati della ricerca corrente, e solo le voci con un
  // nome vero: in Odoo ci sono record il cui nome e' il numero stesso
  // (chiamate da sconosciuti), che come suggerimento non dicono nulla.
  const cifre = (x: string) => x.replace(/\D/g, '')
  const risultati = (cerca && trovati.termine === termine ? trovati.voci : []).filter(
    (v) => v.name.trim() && cifre(v.name) !== cifre(v.number),
  )

  function premi(cifra: string) {
    void Haptics.selectionAsync()
    setScelto(null)
    setTesto((t) => t + cifra)
  }

  function cancella() {
    setScelto(null)
    setTesto((t) => t.slice(0, -1))
  }

  function scegli(voce: Contatto) {
    void Haptics.selectionAsync()
    setScelto(voce)
    setTesto(voce.number)
    setNome('')
    setModo('numero')
    Keyboard.dismiss()
  }

  function apriNome() {
    setScelto(null)
    setNome('')
    setModo('nome')
  }

  function chiudiNome() {
    Keyboard.dismiss()
    setNome('')
    setModo('numero')
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

  const voce = (item: Contatto, compatta: boolean) => (
    <Pressable
      key={item.key}
      style={({ pressed }) => [
        compatta ? s.suggerimento : s.voce,
        { backgroundColor: pressed ? c.superficie2 : compatta ? c.superficie : 'transparent' },
      ]}
      onPress={() => scegli(item)}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${item.number}`}
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
      <Text style={[s.voceTipo, { color: c.testo3 }]} numberOfLines={1}>
        {item.label}
      </Text>
    </Pressable>
  )

  if (modo === 'nome') {
    return (
      <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top']}>
        <View style={s.barraNome}>
          <View style={[s.campoNome, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
            <Ionicons name="search" size={18} color={c.testo3} />
            <TextInput
              style={[s.inputNome, { color: c.testo }]}
              value={nome}
              onChangeText={setNome}
              placeholder="Nome, azienda o numero"
              placeholderTextColor={c.testo3}
              autoFocus
              autoCorrect={false}
              autoCapitalize="words"
              returnKeyType="search"
              clearButtonMode="while-editing"
              accessibilityLabel="Cerca un contatto"
            />
          </View>
          <Pressable onPress={chiudiNome} hitSlop={12} accessibilityRole="button" accessibilityLabel="Torna al tastierino">
            <Text style={[s.annulla, { color: c.primario }]} numberOfLines={1}>
              Tastierino
            </Text>
          </Pressable>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {risultati.length > 0 ? (
            <FlatList
              style={[s.lista, { backgroundColor: c.superficie, borderColor: c.bordo }]}
              data={risultati}
              keyExtractor={(r) => r.key}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => voce(item, false)}
            />
          ) : (
            <Text style={[s.vuoto, { color: c.testo3 }]}>
              {termine.length < minimo
                ? 'Scrivi almeno due lettere del nome o dell\'azienda.'
                : trovati.termine === termine
                  ? 'Nessun contatto trovato in Odoo.'
                  : 'Cerco in Odoo…'}
            </Text>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top']}>
      <View style={s.alto}>
        <StatoLinea />
      </View>

      <View style={s.display}>
        <Text
          style={[s.numero, { color: scelto || testo ? c.testo : c.testo3 }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
          accessibilityLabel="Numero da chiamare"
        >
          {scelto ? scelto.name : testo || 'Numero'}
        </Text>
        {scelto ? (
          <Text style={[s.dettaglio, { color: c.testo2 }]} numberOfLines={1}>
            {scelto.number} · {scelto.label}
          </Text>
        ) : null}
      </View>

      {/* Al massimo due contatti, sopra i tasti: il tastierino resta sempre
          utilizzabile per finire di comporre il numero. */}
      <View style={s.suggerimenti}>{risultati.slice(0, 2).map((r) => voce(r, true))}</View>

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
            <Text style={[s.cifra, { color: c.testo }]}>{cifra}</Text>
            {lettere ? <Text style={[s.lettere, { color: c.testo3 }]}>{lettere}</Text> : null}
          </Pressable>
        ))}
      </View>

      <View style={s.azioni}>
        <View style={s.lato}>
          <Pressable
            onPress={apriNome}
            hitSlop={12}
            style={s.latoTasto}
            accessibilityRole="button"
            accessibilityLabel="Cerca un contatto per nome"
          >
            <Ionicons name="search" size={26} color={c.testo2} />
            <Text style={[s.latoTesto, { color: c.testo2 }]} numberOfLines={1}>
              Nome
            </Text>
          </Pressable>
        </View>
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
  numero: { fontSize: 34, fontWeight: '500', letterSpacing: 1, textAlign: 'center' },
  dettaglio: { fontSize: 14, textAlign: 'center', marginTop: 4 },
  // Altezza fissa (due righe): i tasti non si spostano sotto il dito mentre
  // arrivano o spariscono i suggerimenti.
  suggerimenti: { height: 124, gap: spazio.xs, justifyContent: 'flex-end', overflow: 'hidden' },
  suggerimento: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spazio.l, paddingVertical: spazio.s, gap: spazio.m, borderRadius: raggio.m },
  lista: { flex: 1, borderWidth: 1, borderRadius: raggio.l, marginBottom: spazio.m },
  barraNome: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, paddingVertical: spazio.m },
  campoNome: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spazio.s, borderWidth: 1, borderRadius: raggio.m, paddingHorizontal: spazio.m },
  inputNome: { flex: 1, fontSize: 17, paddingVertical: 12 },
  annulla: { fontSize: 16, fontWeight: '600' },
  vuoto: { fontSize: 15, textAlign: 'center', marginTop: spazio.xl },
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
  latoTasto: { alignItems: 'center', gap: 2 },
  latoTesto: { fontSize: 12, fontWeight: '600' },
  chiama: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
})
