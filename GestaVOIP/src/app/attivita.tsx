/**
 * Le mie attivita' di Odoo: in ritardo, oggi, prossime. Un tocco apre il
 * record in Odoo, il segno di spunta la segna fatta.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { attivita as caricaAttivita, completaAttivita, percorsoRecord, type Attivita } from '../odoo/lavoro'
import { testoDaHtml } from '../odoo/testo'
import { inviaOdoo, rottaOdoo } from '../ui/comandiOdoo'
import { conTelefono } from '../odoo/sessione'
import { useMenu } from '../ui/MenuLaterale'
import { Testata } from '../ui/Testata'
import { raggio, spazio, useColori, type Colori } from '../ui/tema'
import { useApp } from '../voip/Contesto'

const SEZIONI: { stato: Attivita['stato']; titolo: string }[] = [
  { stato: 'overdue', titolo: 'In ritardo' },
  { stato: 'today', titolo: 'Oggi' },
  { stato: 'planned', titolo: 'Prossime' },
]

function quando(a: Attivita): string {
  if (!a.scadenza) {
    return ''
  }
  const oggi = new Date()
  oggi.setHours(12, 0, 0, 0)
  const giorni = Math.round((a.scadenza.getTime() - oggi.getTime()) / 86_400_000)
  if (giorni === 0) {
    return 'oggi'
  }
  if (giorni === -1) {
    return 'ieri'
  }
  if (giorni === 1) {
    return 'domani'
  }
  if (giorni < 0) {
    return `${-giorni} giorni fa`
  }
  if (giorni < 7) {
    return `tra ${giorni} giorni`
  }
  return a.scadenza.toLocaleDateString('it-CH', { day: 'numeric', month: 'short' })
}

function colore(stato: Attivita['stato'], c: Colori): string {
  return stato === 'overdue' ? c.rosso : stato === 'today' ? c.ambra : c.verde
}

export default function SchermataAttivita() {
  const c = useColori()
  const router = useRouter()
  const { sessione } = useApp()
  const { aggiorna } = useMenu()
  const [lista, setLista] = useState<Attivita[] | null>(null)
  const [errore, setErrore] = useState('')
  const [ricarica, setRicarica] = useState(false)
  const [fatte, setFatte] = useState<Set<number>>(new Set())
  const server = sessione?.server || ''
  const uid = sessione?.utente.uid || 0

  const carica = useCallback(async () => {
    if (!server) {
      return
    }
    try {
      setLista(await caricaAttivita(server, uid))
      setErrore('')
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e))
    }
  }, [server, uid])

  useFocusEffect(
    useCallback(() => {
      void carica()
    }, [carica]),
  )

  async function tiraGiu() {
    setRicarica(true)
    await carica()
    setRicarica(false)
  }

  async function segnaFatta(a: Attivita) {
    setFatte((s) => new Set(s).add(a.id))
    try {
      await completaAttivita(server, a.id)
      // La riga resta un attimo spuntata, poi sparisce.
      setTimeout(() => setLista((l) => (l ? l.filter((x) => x.id !== a.id) : l)), 450)
      aggiorna()
    } catch (e) {
      setFatte((s) => {
        const n = new Set(s)
        n.delete(a.id)
        return n
      })
      Alert.alert('Attività', e instanceof Error ? e.message : String(e))
    }
  }

  function apri(a: Attivita) {
    inviaOdoo({ tipo: 'apri', percorso: percorsoRecord(a.modello, a.recordId) })
    // dismissTo torna alla vista di Odoo che c'e' gia' (navigate ne aprirebbe
    // una seconda copia sopra, che riparte dalla home).
    router.dismissTo(rottaOdoo(conTelefono(sessione)))
  }

  // In ritardo: prima le piu' recenti (quelle vecchie di mesi servono meno);
  // oggi e prossime: in ordine di scadenza.
  const sezioni = SEZIONI.map((s) => {
    const righe = (lista || []).filter((a) => a.stato === s.stato)
    return { ...s, data: s.stato === 'overdue' ? [...righe].reverse() : righe }
  }).filter((s) => s.data.length)

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top']}>
      <Testata titolo="Attività" sottotitolo={lista ? `${lista.length} da fare` : undefined} />
      {errore && !lista ? (
        <Text style={[s.vuoto, { color: c.rosso }]}>{errore}</Text>
      ) : !lista ? (
        <ActivityIndicator style={{ marginTop: spazio.xxl }} color={c.primario} />
      ) : (
        <SectionList
          sections={sezioni}
          keyExtractor={(a) => String(a.id)}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: spazio.xxl }}
          refreshControl={<RefreshControl refreshing={ricarica} onRefresh={tiraGiu} tintColor={c.primario} />}
          ListEmptyComponent={
            <View style={s.vuotoBlocco}>
              <Ionicons name="sunny" size={56} color={c.ambra} />
              <Text style={[s.vuoto, { color: c.testo2, marginTop: spazio.s }]}>Nessuna attività: tutto fatto.</Text>
            </View>
          }
          renderSectionHeader={({ section }) => (
            <View style={s.sezione}>
              <View style={[s.sezionePunto, { backgroundColor: colore(section.stato, c) }]} />
              <Text style={[s.sezioneTitolo, { color: c.testo }]}>{section.titolo}</Text>
              <Text style={[s.sezioneNumero, { color: c.testo3 }]}>{section.data.length}</Text>
            </View>
          )}
          renderItem={({ item }) => {
            const fatta = fatte.has(item.id)
            const nota = testoDaHtml(item.nota).replace(/\s+/g, ' ')
            return (
              <Pressable
                onPress={() => apri(item)}
                style={({ pressed }) => [
                  s.scheda,
                  { backgroundColor: pressed ? c.superficie2 : c.superficie, borderColor: c.bordo, opacity: fatta ? 0.5 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityHint="Apre il record in Odoo"
              >
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={s.rigaSopra}>
                    <Text style={[s.tipo, { color: colore(item.stato, c) }]} numberOfLines={1}>
                      {item.tipo}
                    </Text>
                    <Text style={[s.quando, { color: colore(item.stato, c) }]}>{quando(item)}</Text>
                  </View>
                  <Text style={[s.titolo, { color: c.testo }]} numberOfLines={2}>
                    {item.riassunto || item.recordNome}
                  </Text>
                  <Text style={[s.record, { color: c.testo2 }]} numberOfLines={1}>
                    {item.modelloNome}
                    {item.riassunto && item.recordNome ? ` · ${item.recordNome}` : ''}
                  </Text>
                  {nota ? (
                    <Text style={[s.nota, { color: c.testo3 }]} numberOfLines={2}>
                      {nota}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => segnaFatta(item)}
                  disabled={fatta}
                  hitSlop={10}
                  style={[s.spunta, { borderColor: fatta ? c.verde : c.bordo, backgroundColor: fatta ? c.verde : 'transparent' }]}
                  accessibilityRole="button"
                  accessibilityLabel="Segna fatta"
                >
                  <Ionicons name="checkmark" size={20} color={fatta ? '#FFFFFF' : c.testo3} />
                </Pressable>
              </Pressable>
            )
          }}
        />
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1 },
  sezione: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, paddingHorizontal: spazio.l, paddingTop: spazio.l, paddingBottom: spazio.s },
  sezionePunto: { width: 9, height: 9, borderRadius: 5 },
  sezioneTitolo: { fontSize: 15, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  sezioneNumero: { fontSize: 14, fontWeight: '600' },
  scheda: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spazio.m,
    marginHorizontal: spazio.l,
    marginBottom: spazio.s,
    padding: spazio.m,
    borderRadius: raggio.l,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rigaSopra: { flexDirection: 'row', alignItems: 'center', gap: spazio.s },
  tipo: { flex: 1, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  quando: { fontSize: 12, fontWeight: '700' },
  titolo: { fontSize: 16, fontWeight: '600' },
  record: { fontSize: 13 },
  nota: { fontSize: 13, lineHeight: 18 },
  spunta: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  vuoto: { fontSize: 15, textAlign: 'center', marginTop: spazio.xl, paddingHorizontal: spazio.xl },
  vuotoBlocco: { alignItems: 'center', marginTop: spazio.xxl * 2 },
})
