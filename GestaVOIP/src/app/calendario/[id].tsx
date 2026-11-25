/**
 * Un appuntamento con tutti i campi di Odoo: quando, ripetizione, luogo,
 * videochiamata, la mia risposta, organizzatore e invitati, promemoria,
 * etichette, visibilita', documento collegato, descrizione, note interne.
 * «Modifica» in alto apre il modulo; in fondo «Elimina».
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useState, type ReactNode } from 'react'
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { loc, t } from '../../i18n'
import {
  descriviRipetizione,
  dettaglioEvento,
  eliminaEvento,
  etichettaStato,
  opzioniEvento,
  oraBreve,
  rispondi,
  type Ambito,
  type Opzioni,
  type Partecipante,
  type Scheda,
} from '../../odoo/calendario'
import { urlAvatar } from '../../odoo/lavoro'
import { Avatar } from '../../ui/Avatar'
import { Pulsante } from '../../ui/Pulsante'
import { Testata } from '../../ui/Testata'
import { raggio, spazio, useColori, type Colori } from '../../ui/tema'
import { useApp } from '../../voip/Contesto'
import { Caricamento } from '../../ui/Caricamento'

function coloreStato(stato: Partecipante['stato'], c: Colori): string {
  return stato === 'accepted' ? c.verde : stato === 'declined' ? c.rosso : stato === 'tentative' ? c.ambra : c.testo3
}

function quando(e: Scheda): string {
  const giorno = (d: Date) => d.toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' })
  const ora = oraBreve
  if (e.tuttoIlGiorno) {
    return e.dal === e.al
      ? t('calendario.quandoTuttoIlGiorno', { giorno: giorno(e.inizio) })
      : t('calendario.quandoDalAl', { da: giorno(e.inizio), a: giorno(e.fine) })
  }
  if (e.inizio.toDateString() === e.fine.toDateString()) {
    return `${giorno(e.inizio)} · ${ora(e.inizio)}–${ora(e.fine)}`
  }
  return `${giorno(e.inizio)} ${ora(e.inizio)} – ${giorno(e.fine)} ${ora(e.fine)}`
}

function Riga({ icona, children, onPress }: { icona: keyof typeof Ionicons.glyphMap; children: ReactNode; onPress?: () => void }) {
  const c = useColori()
  const dentro = (
    <>
      <Ionicons name={icona} size={20} color={c.primario} />
      <View style={{ flex: 1 }}>{children}</View>
    </>
  )
  return onPress ? (
    <Pressable style={s.riga} onPress={onPress} accessibilityRole="link">
      {dentro}
    </Pressable>
  ) : (
    <View style={s.riga}>{dentro}</View>
  )
}

export default function Appuntamento() {
  const c = useColori()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { sessione } = useApp()
  const [e, setE] = useState<Scheda | null>(null)
  const [opzioni, setOpzioni] = useState<Opzioni | null>(null)
  const [errore, setErrore] = useState('')
  const [invio, setInvio] = useState('')
  const [elimino, setElimino] = useState(false)
  const server = sessione?.server || ''
  const uid = sessione?.utente.uid || 0

  const carica = useCallback(async () => {
    try {
      const [d, o] = await Promise.all([dettaglioEvento(server, uid, Number(id)), opzioniEvento(server).catch(() => null)])
      if (d) {
        setE(d)
        setOpzioni(o)
      } else {
        setErrore(t('calendario.nonTrovato'))
      }
    } catch (err) {
      setErrore(err instanceof Error ? err.message : String(err))
    }
  }, [server, uid, id])

  // Anche al ritorno dalla modifica.
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
      Alert.alert(t('calendario.rispostaNonInviata'), err instanceof Error ? err.message : String(err))
    } finally {
      setInvio('')
    }
  }

  function apriVideo(url: string) {
    // Le stanze di Odoo (Discuss) hanno un indirizzo relativo al server.
    const completo = /^https?:/i.test(url) ? url : `${server}${url.startsWith('/') ? '' : '/'}${url}`
    Linking.openURL(completo).catch(() => Alert.alert(t('calendario.videochiamata'), t('calendario.linkNonSiApre')))
  }

  function apriMappa(luogo: string) {
    const q = encodeURIComponent(luogo)
    Linking.openURL(Platform.OS === 'ios' ? `http://maps.apple.com/?q=${q}` : `geo:0,0?q=${q}`).catch(() => undefined)
  }

  async function elimina(ambito?: Ambito) {
    setElimino(true)
    try {
      await eliminaEvento(server, Number(id), ambito)
      router.back()
    } catch (err) {
      Alert.alert(t('calendario.nonEliminato'), err instanceof Error ? err.message : String(err))
      setElimino(false)
    }
  }

  function chiediElimina() {
    if (!e) {
      return
    }
    if (e.inSerie) {
      Alert.alert(t('calendario.eliminaTitolo'), t('calendario.eliminaSerie'), [
        { text: t('calendario.soloQuesto'), style: 'destructive', onPress: () => void elimina('self_only') },
        { text: t('calendario.questoESuccessivi'), style: 'destructive', onPress: () => void elimina('future_events') },
        { text: t('calendario.tutti'), style: 'destructive', onPress: () => void elimina('all_events') },
        { text: t('comune.annulla'), style: 'cancel' },
      ])
      return
    }
    Alert.alert(t('calendario.eliminaTitolo'), t('calendario.eliminaUno', { titolo: e.titolo }), [
      { text: t('comune.annulla'), style: 'cancel' },
      { text: t('comune.elimina'), style: 'destructive', onPress: () => void elimina() },
    ])
  }

  const io = e?.persone.find((p) => p.io)
  const nomeScelta = (lista: { valore: string; nome: string }[] | undefined, valore: string) => lista?.find((x) => x.valore === valore)?.nome || ''
  const privacy = e && opzioni ? nomeScelta(opzioni.privacy, e.privacy) : ''
  const mostraCome = e && opzioni ? nomeScelta(opzioni.mostraCome, e.mostraCome) : ''

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top', 'bottom']}>
      <Testata
        titolo={t('calendario.appuntamento')}
        destra={
          e?.puoModificare ? (
            <Pressable
              onPress={() => router.push({ pathname: '/calendario/modifica', params: { id: String(e.id) } })}
              hitSlop={10}
              style={s.modifica}
              accessibilityRole="button"
            >
              <Text style={[s.modificaTesto, { color: c.primario }]} numberOfLines={1}>
                {t('comune.modifica')}
              </Text>
            </Pressable>
          ) : undefined
        }
      />
      {errore && !e ? (
        <Text style={[s.vuoto, { color: c.rosso }]}>{errore}</Text>
      ) : !e ? (
        <Caricamento style={{ marginTop: spazio.xxl }} />
      ) : (
        <ScrollView contentContainerStyle={s.contenuto}>
          <Text style={[s.titolo, { color: c.testo }]}>{e.titolo}</Text>
          {e.etichette.length ? (
            <View style={s.etichette}>
              {e.etichette.map((x) => (
                <View key={x.id} style={[s.pillola, { backgroundColor: c.primarioTenue }]}>
                  <Text style={[s.pillolaTesto, { color: c.primario }]} numberOfLines={1}>
                    {x.nome}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          <Riga icona="time-outline">
            <Text style={[s.rigaTesto, { color: c.testo }]}>{quando(e)}</Text>
          </Riga>
          {e.ripetizione ? (
            <Riga icona="repeat-outline">
              <Text style={[s.rigaTesto, { color: c.testo }]}>{descriviRipetizione(e.ripetizione, e.inizio)}</Text>
            </Riga>
          ) : null}
          {e.luogo ? (
            <Riga icona="location-outline" onPress={() => apriMappa(e.luogo)}>
              <Text style={[s.rigaTesto, { color: c.primario }]}>{e.luogo}</Text>
            </Riga>
          ) : null}
          {e.promemoria.length ? (
            <Riga icona="notifications-outline">
              <Text style={[s.rigaTesto, { color: c.testo }]}>{e.promemoria.map((p) => p.nome).join(', ')}</Text>
            </Riga>
          ) : null}
          {e.collegatoA ? (
            <Riga icona="link-outline">
              <Text style={[s.rigaTesto, { color: c.testo }]}>{e.collegatoA}</Text>
            </Riga>
          ) : null}
          {e.video ? (
            <Pressable
              onPress={() => apriVideo(e.video)}
              style={({ pressed }) => [s.video, { backgroundColor: c.primario, opacity: pressed ? 0.85 : 1 }]}
              accessibilityRole="button"
            >
              <Ionicons name="videocam" size={20} color={c.primarioTesto} />
              <Text style={[s.videoTesto, { color: c.primarioTesto }]} numberOfLines={1}>
                {t('calendario.entraVideo')}
              </Text>
            </Pressable>
          ) : null}

          {io ? (
            <View style={[s.scheda, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
              <Text style={[s.etichetta, { color: c.testo2 }]}>{t('calendario.tuaRisposta')}</Text>
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
                          {t(stato === 'accepted' ? 'calendario.rispostaSi' : stato === 'tentative' ? 'calendario.rispostaForse' : 'calendario.rispostaNo')}
                        </Text>
                      )}
                    </Pressable>
                  )
                })}
              </View>
            </View>
          ) : null}

          <View style={[s.scheda, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
            <Text style={[s.etichetta, { color: c.testo2 }]}>{t('calendario.organizzatore')}</Text>
            <View style={s.persona}>
              <Avatar url={e.organizzatoreId ? urlAvatar(server, 'res.users', e.organizzatoreId) : undefined} nome={e.organizzatore || '?'} lato={36} />
              <Text style={[s.personaNome, { color: c.testo }]} numberOfLines={1}>
                {e.organizzatore || t('comune.nessuno')}
              </Text>
            </View>
            <View style={[s.linea, { backgroundColor: c.bordo }]} />
            <Text style={[s.etichetta, { color: c.testo2 }]}>{t('calendario.invitatiConteggio', { n: e.persone.length })}</Text>
            {e.persone.map((p) => (
              <View key={p.id} style={s.persona}>
                <Avatar url={p.partnerId ? urlAvatar(server, 'res.partner', p.partnerId) : undefined} nome={p.nome} lato={36} />
                <Text style={[s.personaNome, { color: c.testo }]} numberOfLines={1}>
                  {p.nome}
                  {p.io ? t('calendario.tu') : ''}
                </Text>
                <View style={[s.stato, { backgroundColor: c.sfondo }]}>
                  <View style={[s.statoPunto, { backgroundColor: coloreStato(p.stato, c) }]} />
                  <Text style={[s.statoTesto, { color: c.testo2 }]} numberOfLines={1}>
                    {etichettaStato(p.stato)}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {e.descrizione ? (
            <View style={[s.scheda, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
              <Text style={[s.etichetta, { color: c.testo2 }]}>{t('calendario.descrizione')}</Text>
              <Text style={[s.nota, { color: c.testo }]} selectable>
                {e.descrizione}
              </Text>
            </View>
          ) : null}
          {e.note ? (
            <View style={[s.scheda, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
              <Text style={[s.etichetta, { color: c.testo2 }]}>{t('calendario.noteInterne')}</Text>
              <Text style={[s.nota, { color: c.testo }]} selectable>
                {e.note}
              </Text>
            </View>
          ) : null}

          {e.calendario || privacy || mostraCome ? (
            <View style={[s.scheda, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
              <Text style={[s.etichetta, { color: c.testo2 }]}>{t('calendario.visibilita')}</Text>
              {e.calendario ? <Text style={[s.nota, { color: c.testo }]}>{t('calendario.calendarioDi', { nome: e.calendario.nome })}</Text> : null}
              {privacy ? <Text style={[s.nota, { color: c.testo }]}>{t('calendario.privacyDi', { nome: privacy })}</Text> : null}
              {mostraCome ? <Text style={[s.nota, { color: c.testo }]}>{t('calendario.mostraComeDi', { nome: mostraCome })}</Text> : null}
            </View>
          ) : null}

          {e.puoModificare ? <Pulsante testo={t('comune.elimina')} variante="pericolo" onPress={chiediElimina} occupato={elimino} /> : null}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1 },
  contenuto: { padding: spazio.l, gap: spazio.m, paddingBottom: spazio.xxl },
  vuoto: { fontSize: 15, textAlign: 'center', marginTop: spazio.xl, paddingHorizontal: spazio.xl },
  modifica: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spazio.xs },
  modificaTesto: { fontSize: 17, fontWeight: '700' },
  titolo: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3 },
  etichette: { flexDirection: 'row', flexWrap: 'wrap', gap: spazio.s },
  pillola: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  pillolaTesto: { fontSize: 13, fontWeight: '700' },
  riga: { flexDirection: 'row', alignItems: 'flex-start', gap: spazio.s },
  rigaTesto: { fontSize: 16, lineHeight: 21 },
  video: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spazio.s, minHeight: 48, borderRadius: raggio.m },
  videoTesto: { fontSize: 16, fontWeight: '700' },
  scheda: { borderWidth: 1, borderRadius: raggio.l, padding: spazio.m, gap: spazio.s },
  etichetta: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  risposte: { flexDirection: 'row', gap: spazio.s },
  risposta: { flex: 1, minHeight: 40, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  rispostaTesto: { fontSize: 15, fontWeight: '700' },
  persona: { flexDirection: 'row', alignItems: 'center', gap: spazio.m },
  personaNome: { flex: 1, fontSize: 15, fontWeight: '600' },
  linea: { height: StyleSheet.hairlineWidth, marginVertical: spazio.xs },
  stato: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statoPunto: { width: 7, height: 7, borderRadius: 4 },
  statoTesto: { fontSize: 12, fontWeight: '600' },
  nota: { fontSize: 15, lineHeight: 21 },
})
