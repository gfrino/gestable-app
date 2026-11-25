/** Un appuntamento: quando, dove, videochiamata, partecipanti, la mia risposta. */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { dettaglioEvento, ETICHETTE_STATO, rispondi, type DettaglioEvento, type Partecipante } from '../../odoo/calendario'
import { percorsoRecord, urlAvatar } from '../../odoo/lavoro'
import { testoDaHtml } from '../../odoo/testo'
import { Avatar } from '../../ui/Avatar'
import { inviaOdoo, rottaOdoo } from '../../ui/comandiOdoo'
import { Pulsante } from '../../ui/Pulsante'
import { Testata } from '../../ui/Testata'
import { raggio, spazio, useColori, type Colori } from '../../ui/tema'
import { useApp } from '../../voip/Contesto'

function coloreStato(stato: Partecipante['stato'], c: Colori): string {
  return stato === 'accepted' ? c.verde : stato === 'declined' ? c.rosso : stato === 'tentative' ? c.ambra : c.testo3
}

function quando(e: DettaglioEvento): string {
  const giorno = (d: Date) => d.toLocaleDateString('it-CH', { weekday: 'long', day: 'numeric', month: 'long' })
  const ora = (d: Date) => d.toLocaleTimeString('it-CH', { hour: '2-digit', minute: '2-digit' })
  if (e.tuttoIlGiorno) {
    return e.dal === e.al ? `${giorno(e.inizio)} · tutto il giorno` : `dal ${giorno(e.inizio)} al ${giorno(e.fine)}`
  }
  if (e.inizio.toDateString() === e.fine.toDateString()) {
    return `${giorno(e.inizio)} · ${ora(e.inizio)}–${ora(e.fine)}`
  }
  return `${giorno(e.inizio)} ${ora(e.inizio)} – ${giorno(e.fine)} ${ora(e.fine)}`
}

export default function Appuntamento() {
  const c = useColori()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { sessione } = useApp()
  const [e, setE] = useState<DettaglioEvento | null>(null)
  const [errore, setErrore] = useState('')
  const [invio, setInvio] = useState('')
  const server = sessione?.server || ''
  const uid = sessione?.utente.uid || 0

  const carica = useCallback(async () => {
    try {
      const d = await dettaglioEvento(server, uid, Number(id))
      if (d) {
        setE(d)
      } else {
        setErrore('Appuntamento non trovato.')
      }
    } catch (err) {
      setErrore(err instanceof Error ? err.message : String(err))
    }
  }, [server, uid, id])

  useFocusEffect(
    useCallback(() => {
      void carica()
    }, [carica]),
  )

  async function risposta(p: Partecipante, stato: 'accepted' | 'tentative' | 'declined') {
    setInvio(stato)
    try {
      await rispondi(server, p.id, stato)
      await carica()
    } catch (err) {
      Alert.alert('Risposta non inviata', err instanceof Error ? err.message : String(err))
    } finally {
      setInvio('')
    }
  }

  function apriVideo(url: string) {
    // Le stanze di Odoo (Discuss) hanno un indirizzo relativo al server.
    const completo = /^https?:/i.test(url) ? url : `${server}${url.startsWith('/') ? '' : '/'}${url}`
    Linking.openURL(completo).catch(() => Alert.alert('Videochiamata', 'Il link non si apre.'))
  }

  function apriMappa(luogo: string) {
    Linking.openURL(`http://maps.apple.com/?q=${encodeURIComponent(luogo)}`).catch(() => undefined)
  }

  function apriInOdoo() {
    if (!e) {
      return
    }
    inviaOdoo({ tipo: 'apri', percorso: percorsoRecord('calendar.event', e.id) })
    router.dismissTo(rottaOdoo())
  }

  const io = e?.persone.find((p) => p.io)
  const nota = e ? testoDaHtml(e.descrizione) : ''

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top', 'bottom']}>
      <Testata titolo="Appuntamento" />
      {errore && !e ? (
        <Text style={[s.vuoto, { color: c.rosso }]}>{errore}</Text>
      ) : !e ? (
        <ActivityIndicator style={{ marginTop: spazio.xxl }} color={c.primario} />
      ) : (
        <ScrollView contentContainerStyle={s.contenuto}>
          <Text style={[s.titolo, { color: c.testo }]}>{e.titolo}</Text>
          <View style={s.riga}>
            <Ionicons name="time-outline" size={20} color={c.primario} />
            <Text style={[s.rigaTesto, { color: c.testo }]}>{quando(e)}</Text>
          </View>
          {e.luogo ? (
            <Pressable style={s.riga} onPress={() => apriMappa(e.luogo)} accessibilityRole="link">
              <Ionicons name="location-outline" size={20} color={c.primario} />
              <Text style={[s.rigaTesto, { color: c.primario }]}>{e.luogo}</Text>
            </Pressable>
          ) : null}
          {e.video ? (
            <Pressable
              onPress={() => apriVideo(e.video)}
              style={({ pressed }) => [s.video, { backgroundColor: c.primario, opacity: pressed ? 0.85 : 1 }]}
              accessibilityRole="button"
            >
              <Ionicons name="videocam" size={20} color={c.primarioTesto} />
              <Text style={[s.videoTesto, { color: c.primarioTesto }]} numberOfLines={1}>
                Entra nella videochiamata
              </Text>
            </Pressable>
          ) : null}

          {io ? (
            <View style={[s.scheda, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
              <Text style={[s.etichetta, { color: c.testo2 }]}>La tua risposta</Text>
              <View style={s.risposte}>
                {(['accepted', 'tentative', 'declined'] as const).map((stato) => {
                  const attiva = io.stato === stato
                  const colore = coloreStato(stato, c)
                  return (
                    <Pressable
                      key={stato}
                      onPress={() => risposta(io, stato)}
                      disabled={!!invio}
                      style={[s.risposta, { borderColor: attiva ? colore : c.bordo, backgroundColor: attiva ? colore : 'transparent' }]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: attiva }}
                    >
                      {invio === stato ? (
                        <ActivityIndicator size="small" color={attiva ? '#FFFFFF' : colore} />
                      ) : (
                        <Text style={[s.rispostaTesto, { color: attiva ? '#FFFFFF' : c.testo }]} numberOfLines={1}>
                          {stato === 'accepted' ? 'Ci sono' : stato === 'tentative' ? 'Forse' : 'No'}
                        </Text>
                      )}
                    </Pressable>
                  )
                })}
              </View>
            </View>
          ) : null}

          <View style={[s.scheda, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
            <Text style={[s.etichetta, { color: c.testo2 }]}>
              Partecipanti{e.organizzatore ? ` · organizza ${e.organizzatore}` : ''}
            </Text>
            {e.persone.map((p) => (
              <View key={p.id} style={s.persona}>
                <Avatar url={p.partnerId ? urlAvatar(server, 'res.partner', p.partnerId) : undefined} nome={p.nome} lato={36} />
                <Text style={[s.personaNome, { color: c.testo }]} numberOfLines={1}>
                  {p.nome}
                  {p.io ? ' (tu)' : ''}
                </Text>
                <View style={[s.stato, { backgroundColor: c.sfondo }]}>
                  <View style={[s.statoPunto, { backgroundColor: coloreStato(p.stato, c) }]} />
                  <Text style={[s.statoTesto, { color: c.testo2 }]}>{ETICHETTE_STATO[p.stato]}</Text>
                </View>
              </View>
            ))}
          </View>

          {nota ? (
            <View style={[s.scheda, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
              <Text style={[s.etichetta, { color: c.testo2 }]}>Note</Text>
              <Text style={[s.nota, { color: c.testo }]} selectable>
                {nota}
              </Text>
            </View>
          ) : null}

          <Pulsante testo="Apri in Odoo" variante="tenue" onPress={apriInOdoo} />
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1 },
  contenuto: { padding: spazio.l, gap: spazio.m, paddingBottom: spazio.xxl },
  vuoto: { fontSize: 15, textAlign: 'center', marginTop: spazio.xl, paddingHorizontal: spazio.xl },
  titolo: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3 },
  riga: { flexDirection: 'row', alignItems: 'flex-start', gap: spazio.s },
  rigaTesto: { flex: 1, fontSize: 16, lineHeight: 21, textTransform: 'none' },
  video: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spazio.s, height: 48, borderRadius: raggio.m },
  videoTesto: { fontSize: 16, fontWeight: '700' },
  scheda: { borderWidth: 1, borderRadius: raggio.l, padding: spazio.m, gap: spazio.s },
  etichetta: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  risposte: { flexDirection: 'row', gap: spazio.s },
  risposta: { flex: 1, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  rispostaTesto: { fontSize: 15, fontWeight: '700' },
  persona: { flexDirection: 'row', alignItems: 'center', gap: spazio.m },
  personaNome: { flex: 1, fontSize: 15, fontWeight: '600' },
  stato: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statoPunto: { width: 7, height: 7, borderRadius: 4 },
  statoTesto: { fontSize: 12, fontWeight: '600' },
  nota: { fontSize: 15, lineHeight: 21 },
})
