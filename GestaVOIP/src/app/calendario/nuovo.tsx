/**
 * Nuovo appuntamento nel calendario di Odoo: titolo, giorno, ora, durata,
 * luogo, note. Giorno e ora si cambiano con le frecce (passi di 15 minuti):
 * niente selettori nativi, l'app resta aggiornabile senza build.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { creaEvento, giornoEsteso } from '../../odoo/calendario'
import { Pulsante } from '../../ui/Pulsante'
import { Testata } from '../../ui/Testata'
import { raggio, spazio, useColori } from '../../ui/tema'
import { useApp } from '../../voip/Contesto'

const DURATE = [
  { minuti: 15, testo: '15 min' },
  { minuti: 30, testo: '30 min' },
  { minuti: 60, testo: '1 h' },
  { minuti: 90, testo: '1 h 30' },
  { minuti: 120, testo: '2 h' },
  { minuti: 180, testo: '3 h' },
]

/** Prossima ora piena se il giorno e' oggi, altrimenti le 9. */
function inizioProposto(giorno: string | undefined): Date {
  const oggi = new Date()
  const d = giorno ? new Date(`${giorno}T09:00:00`) : new Date(oggi)
  if (!giorno || d.toDateString() === oggi.toDateString()) {
    const x = new Date(oggi)
    x.setMinutes(0, 0, 0)
    x.setHours(x.getHours() + 1)
    return x
  }
  return d
}

export default function NuovoAppuntamento() {
  const c = useColori()
  const router = useRouter()
  const { giorno } = useLocalSearchParams<{ giorno?: string }>()
  const { sessione } = useApp()
  const [titolo, setTitolo] = useState('')
  const [inizio, setInizio] = useState(() => inizioProposto(giorno))
  const [minuti, setMinuti] = useState(60)
  const [tuttoIlGiorno, setTuttoIlGiorno] = useState(false)
  const [luogo, setLuogo] = useState('')
  const [nota, setNota] = useState('')
  const [salva, setSalva] = useState(false)

  function sposta(minutiDiPiu: number) {
    setInizio((d) => new Date(d.getTime() + minutiDiPiu * 60_000))
  }

  async function conferma() {
    if (!titolo.trim()) {
      Alert.alert('Nuovo appuntamento', 'Scrivi il titolo.')
      return
    }
    if (!sessione) {
      return
    }
    setSalva(true)
    try {
      await creaEvento(sessione.server, sessione.utente.uid, { titolo, inizio, minuti, tuttoIlGiorno, luogo, nota })
      router.back()
    } catch (e) {
      Alert.alert('Appuntamento non salvato', e instanceof Error ? e.message : String(e))
      setSalva(false)
    }
  }

  const fine = new Date(inizio.getTime() + minuti * 60_000)
  const ora = (d: Date) => d.toLocaleTimeString('it-CH', { hour: '2-digit', minute: '2-digit' })
  const campo = [s.campo, { backgroundColor: c.superficie, borderColor: c.bordo, color: c.testo }]
  const freccia = (icona: 'chevron-back' | 'chevron-forward', onPress: () => void, etichetta: string) => (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [s.freccia, { backgroundColor: pressed ? c.superficie2 : c.superficie, borderColor: c.bordo }]}
      accessibilityRole="button"
      accessibilityLabel={etichetta}
    >
      <Ionicons name={icona} size={20} color={c.primario} />
    </Pressable>
  )

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top', 'bottom']}>
      <Testata titolo="Nuovo appuntamento" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.contenuto} keyboardShouldPersistTaps="handled">
          <TextInput
            style={[campo, s.titolo]}
            value={titolo}
            onChangeText={setTitolo}
            placeholder="Titolo"
            placeholderTextColor={c.testo3}
            autoFocus
            returnKeyType="done"
            accessibilityLabel="Titolo"
          />

          <View style={[s.scheda, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
            <View style={s.riga}>
              {freccia('chevron-back', () => sposta(-24 * 60), 'Giorno prima')}
              <Text style={[s.valore, { color: c.testo }]} numberOfLines={1}>
                {giornoEsteso(inizio)}
              </Text>
              {freccia('chevron-forward', () => sposta(24 * 60), 'Giorno dopo')}
            </View>

            <View style={[s.separatore, { backgroundColor: c.bordo }]} />
            <View style={s.riga}>
              <Text style={[s.etichetta, { color: c.testo }]}>Tutto il giorno</Text>
              <Switch value={tuttoIlGiorno} onValueChange={setTuttoIlGiorno} trackColor={{ true: c.primario }} />
            </View>

            {!tuttoIlGiorno ? (
              <>
                <View style={[s.separatore, { backgroundColor: c.bordo }]} />
                <View style={s.riga}>
                  {freccia('chevron-back', () => sposta(-15), '15 minuti prima')}
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={[s.ora, { color: c.testo }]}>
                      {ora(inizio)} – {ora(fine)}
                    </Text>
                    {fine.toDateString() !== inizio.toDateString() ? (
                      <Text style={[s.nota, { color: c.ambra }]}>finisce il giorno dopo</Text>
                    ) : null}
                  </View>
                  {freccia('chevron-forward', () => sposta(15), '15 minuti dopo')}
                </View>
                <View style={s.durate}>
                  {DURATE.map((d) => {
                    const attiva = d.minuti === minuti
                    return (
                      <Pressable
                        key={d.minuti}
                        onPress={() => setMinuti(d.minuti)}
                        style={[s.durata, { borderColor: attiva ? c.primario : c.bordo, backgroundColor: attiva ? c.primarioTenue : 'transparent' }]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: attiva }}
                      >
                        <Text style={[s.durataTesto, { color: attiva ? c.primario : c.testo2 }]} numberOfLines={1}>
                          {d.testo}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </>
            ) : null}
          </View>

          <TextInput
            style={campo}
            value={luogo}
            onChangeText={setLuogo}
            placeholder="Luogo (facoltativo)"
            placeholderTextColor={c.testo3}
            accessibilityLabel="Luogo"
          />
          <TextInput
            style={[campo, s.note]}
            value={nota}
            onChangeText={setNota}
            placeholder="Note (facoltative)"
            placeholderTextColor={c.testo3}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Note"
          />

          <Pulsante testo="Salva" onPress={conferma} occupato={salva} />
          <Text style={[s.nota, { color: c.testo3, textAlign: 'center' }]}>
            L&apos;appuntamento va nel tuo calendario di Odoo. Per invitare altri, aprilo in Odoo.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1 },
  contenuto: { padding: spazio.l, gap: spazio.m, paddingBottom: spazio.xxl },
  campo: { borderWidth: 1, borderRadius: raggio.m, paddingHorizontal: spazio.l, paddingVertical: 13, fontSize: 16 },
  titolo: { fontSize: 20, fontWeight: '700' },
  scheda: { borderWidth: 1, borderRadius: raggio.l, padding: spazio.m, gap: spazio.m },
  riga: { flexDirection: 'row', alignItems: 'center', gap: spazio.m },
  separatore: { height: StyleSheet.hairlineWidth },
  freccia: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  valore: { flex: 1, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  etichetta: { flex: 1, fontSize: 16, fontWeight: '600' },
  ora: { fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  nota: { fontSize: 13 },
  durate: { flexDirection: 'row', flexWrap: 'wrap', gap: spazio.s },
  durata: { paddingHorizontal: 14, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  durataTesto: { fontSize: 14, fontWeight: '700' },
  note: { minHeight: 100 },
})
