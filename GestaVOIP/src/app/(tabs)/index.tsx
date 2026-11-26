/**
 * Tastierino: si compone un numero (le cifre propongono fino a due contatti di
 * Odoo sopra i tasti, senza mai coprirli), oppure con «Nome» si cerca un
 * contatto con la tastiera del telefono e lo si sceglie dalla lista.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import * as Haptics from 'expo-haptics'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Alert, FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { t } from '../../i18n'
import { cercaContatti, colleghi, type Collega, type Contatto } from '../../voip/api'
import { conTelefono } from '../../odoo/sessione'
import { useApp } from '../../voip/Contesto'
import { telefono } from '../../voip/telefono'
import { schedaAvvio, useAspetto, type Scheda } from '../../ui/Aspetto'
import { PulsanteMenu } from '../../ui/MenuLaterale'
import { StatoLinea } from '../../ui/StatoLinea'
import { raggio, spazio, useColori } from '../../ui/tema'

const TASTI: [string, string][] = [
  ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
  ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
  ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
  ['*', ''], ['0', '+'], ['#', ''],
]

// La scheda scelta come prima in Impostazioni si apre una volta sola, all'avvio:
// dopo, toccando Tastierino, si resta qui.
let avvioFatto = false

/**
 * All'avvio l'app apre sempre questa scheda («/»): da qui si passa alla prima
 * scheda scelta in Impostazioni; senza VOIP AI il tastierino non c'e' e si va
 * sulla prima scheda disponibile (Odoo, se non si e' scelto altro).
 */
export default function SchedaTastierino() {
  const { sessione } = useApp()
  const router = useRouter()
  const { aspetto } = useAspetto()
  const senza = !!sessione && !conTelefono(sessione)
  const prima = schedaAvvio(aspetto, !senza)
  const vai = prima !== 'index' && (senza || !avvioFatto)
  // Si decide una volta, quando la scheda si monta: se poi l'ordine cambia
  // (da Impostazioni) non si deve saltare via dalla schermata aperta.
  const salto = useRef<Exclude<Scheda, 'index'> | ''>(vai ? (prima as Exclude<Scheda, 'index'>) : '')
  // Il tastierino resta pronto per quando lo si tocca dopo l'avvio.
  const [pronto, setPronto] = useState(!vai)
  // <Redirect> qui non basta: alla prima navigazione dell'app viene ignorato.
  useEffect(() => {
    avvioFatto = true
    if (salto.current) {
      router.replace(`/${salto.current}`)
    }
    // Una volta sola, al montaggio: dopo il salto il tastierino si mostra quando lo si tocca.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPronto(true)
  }, [router])
  return senza || !pronto ? null : <Tastierino />
}

function Tastierino() {
  const c = useColori()
  const { sessione } = useApp()
  const [modo, setModo] = useState<'numero' | 'nome'>('numero')
  const [testo, setTesto] = useState('')
  const [nome, setNome] = useState('')
  const [scelto, setScelto] = useState<Contatto | null>(null)
  const [trovati, setTrovati] = useState<{ termine: string; voci: Contatto[] }>({ termine: '', voci: [] })
  const ricerca = useRef(0)
  // I colleghi con l'interno: compaiono per primi fra i suggerimenti.
  const [interni, setInterni] = useState<Collega[]>([])
  useEffect(() => {
    if (sessione) {
      colleghi(sessione.server)
        .then(setInterni)
        .catch(() => undefined)
    }
  }, [sessione])
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
  const q = termine.toLowerCase()
  const colleghiTrovati: Contatto[] =
    termine && !scelto
      ? interni
          .filter((x) => x.extension && (modo === 'nome' ? q.length >= 2 && x.name.toLowerCase().includes(q) : x.extension.startsWith(termine)))
          .map((x) => ({
            key: `int-${x.id}`,
            id: x.id,
            model: 'res.users' as const,
            name: x.name,
            subtitle: '',
            number: x.extension,
            label: t('schede.tipoInterno'),
          }))
      : []
  const risultati = [
    ...colleghiTrovati,
    ...(cerca && trovati.termine === termine ? trovati.voci : []).filter((v) => v.name.trim() && cifre(v.name) !== cifre(v.number)),
  ]

  function premi(cifra: string) {
    void Haptics.selectionAsync()
    setScelto(null)
    setTesto((x) => x + cifra)
  }

  function cancella() {
    setScelto(null)
    setTesto((x) => x.slice(0, -1))
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
      Alert.alert(t('schede.chiamataNonPartita'), e instanceof Error ? e.message : String(e))
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
              placeholder={t('schede.cercaNomeSegnaposto')}
              placeholderTextColor={c.testo3}
              autoFocus
              autoCorrect={false}
              autoCapitalize="words"
              returnKeyType="search"
              clearButtonMode="while-editing"
              accessibilityLabel={t('schede.cercaContatto')}
            />
          </View>
          <Pressable onPress={chiudiNome} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('schede.tornaTastierino')}>
            <Text style={[s.annulla, { color: c.primario }]} numberOfLines={1}>
              {t('schede.tastierino')}
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
                ? t('schede.scriviDueLettere')
                : trovati.termine === termine
                  ? t('schede.nessunoInOdoo')
                  : t('schede.cercoInOdoo')}
            </Text>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top']}>
      <View style={s.alto}>
        <View style={s.altoLato}>
          <PulsanteMenu />
        </View>
        <StatoLinea />
        <View style={s.altoLato} />
      </View>

      <View style={s.display}>
        <Text
          style={[s.numero, { color: scelto || testo ? c.testo : c.testo3 }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
          accessibilityLabel={t('schede.numeroDaChiamare')}
        >
          {scelto ? scelto.name : testo || t('schede.numero')}
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
            accessibilityLabel={t('schede.cercaPerNome')}
          >
            <Ionicons name="search" size={26} color={c.testo2} />
            <Text style={[s.latoTesto, { color: c.testo2 }]} numberOfLines={1}>
              {t('schede.nome')}
            </Text>
          </Pressable>
        </View>
        <Pressable
          onPress={chiama}
          style={({ pressed }) => [s.chiama, { backgroundColor: c.verde, opacity: pressed ? 0.8 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={t('schede.chiama')}
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
              accessibilityLabel={t('schede.cancella')}
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
  alto: { paddingTop: spazio.s, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  altoLato: { width: 44 },
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
