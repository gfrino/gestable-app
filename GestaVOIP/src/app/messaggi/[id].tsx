/**
 * Una chat o un canale di Discuss: bolle, invio, segnata letta all'apertura.
 * Le spunte dei miei messaggi come WhatsApp (una grigia inviato, due grigie
 * arrivato, due verdi letto) e, nelle chat a due, il tasto per chiamare.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { loc, t, tn } from '../../i18n'
import { altroNellaChat, inviaChat, letture, messaggiChat, numeroDelPartner, segnaLetta, type Letture, type MessaggioChat } from '../../odoo/lavoro'
import { conTelefono } from '../../odoo/sessione'
import { chiamaNumero } from '../../ui/chiama'
import { AURORA, AURORA_CHIARA } from '../../ui/odooIniettato'
import { colleghi } from '../../voip/api'
import { htmlDaTesto, oraBreve, testoDaHtml } from '../../odoo/testo'
import { useMenu } from '../../ui/MenuLaterale'
import { Testata } from '../../ui/Testata'
import { spazio, useColori } from '../../ui/tema'
import { useApp } from '../../voip/Contesto'
import { Caricamento } from '../../ui/Caricamento'

function giorno(d: Date | null): string {
  if (!d) {
    return ''
  }
  const oggi = new Date()
  const stesso = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (stesso(d, oggi)) {
    return t('lavoro.oggi')
  }
  const ieri = new Date(oggi.getTime() - 86_400_000)
  if (stesso(d, ieri)) {
    return t('lavoro.ieri')
  }
  return d.toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function Conversazione() {
  const c = useColori()
  const { id, nome, tipo } = useLocalSearchParams<{ id: string; nome?: string; tipo?: string }>()
  const canale = Number(id)
  const { sessione } = useApp()
  const { aggiorna } = useMenu()
  const [messaggi, setMessaggi] = useState<MessaggioChat[] | null>(null)
  const [testo, setTesto] = useState('')
  const [invio, setInvio] = useState(false)
  const ultimoLetto = useRef(0)
  const scuro = useColorScheme() === 'dark'
  const conSpunte = tipo === 'chat' || tipo === 'group'
  const [letto, setLetto] = useState<Letture>({ visto: 0, ricevuto: 0 })
  // Chat a due: chi chiamare (interno del collega o il suo numero).
  const [chiamata, setChiamata] = useState<{ numero: string; nome: string } | null>(null)
  const lista = useRef<FlatList<MessaggioChat>>(null)
  const server = sessione?.server || ''
  const uid = sessione?.utente.uid || 0

  const carica = useCallback(async () => {
    if (!server || !canale) {
      return
    }
    try {
      const [m, l] = await Promise.all([
        messaggiChat(server, uid, canale),
        conSpunte ? letture(server, uid, canale).catch(() => null) : Promise.resolve(null),
      ])
      setMessaggi(m)
      if (l) {
        setLetto(l)
      }
      const ultimo = m[m.length - 1]?.id || 0
      if (ultimo && ultimo !== ultimoLetto.current) {
        ultimoLetto.current = ultimo
        segnaLetta(server, canale, ultimo)
          .then(aggiorna)
          .catch(() => undefined)
      }
    } catch (e) {
      if (!messaggi) {
        Alert.alert(t('lavoro.messaggi.titolo'), e instanceof Error ? e.message : String(e))
      }
    }
    // messaggi resta fuori: serve solo a non ripetere l'avviso a ogni giro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server, uid, canale, aggiorna, conSpunte])

  useEffect(() => {
    if (tipo !== 'chat' || !server || !canale || !sessione) {
      return
    }
    let valido = true
    void (async () => {
      const partner = await altroNellaChat(server, uid, canale).catch(() => null)
      if (!partner) {
        return
      }
      const { utente, numero } = await numeroDelPartner(server, partner)
      // Un collega con il telefono dell'ufficio si chiama sul suo interno.
      let interno = ''
      if (utente && conTelefono(sessione)) {
        interno = (await colleghi(server).catch(() => [])).find((x) => x.id === utente)?.extension || ''
      }
      if (valido && (interno || numero)) {
        setChiamata({ numero: interno || numero, nome: nome || '' })
      }
    })()
    return () => {
      valido = false
    }
  }, [tipo, server, uid, canale, sessione, nome])

  // Aperta: si aggiorna ogni 5 secondi (i nuovi messaggi arrivano cosi').
  useFocusEffect(
    useCallback(() => {
      void carica()
      const timer = setInterval(() => void carica(), 5_000)
      return () => clearInterval(timer)
    }, [carica]),
  )

  async function invia() {
    const pulito = testo.trim()
    if (!pulito || invio) {
      return
    }
    setInvio(true)
    try {
      await inviaChat(server, canale, htmlDaTesto(pulito))
      setTesto('')
      await carica()
    } catch (e) {
      Alert.alert(t('lavoro.chat.nonInviato'), e instanceof Error ? e.message : String(e))
    } finally {
      setInvio(false)
    }
  }

  const dati = messaggi ? [...messaggi].reverse() : []

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: scuro ? '#232846' : '#EEF2F8' }]} edges={['top', 'bottom']}>
      {/* La stessa sfumatura «Aurora» della scheda Odoo e della scheda GestABLE. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { experimental_backgroundImage: scuro ? AURORA : AURORA_CHIARA }]} />
      <Testata
        titolo={tipo === 'chat' ? nome || t('lavoro.chat.chat') : `# ${nome || t('lavoro.chat.canale')}`}
        destra={
          chiamata ? (
            <Pressable
              onPress={() => chiamaNumero(sessione, chiamata.numero, chiamata.nome)}
              hitSlop={10}
              style={({ pressed }) => [s.chiama, { backgroundColor: c.verdeTenue, opacity: pressed ? 0.7 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={t('schede.chiamaNome', { nome: chiamata.nome })}
            >
              <Ionicons name="call" size={20} color={c.verde} />
            </Pressable>
          ) : undefined
        }
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {!messaggi ? (
          <Caricamento style={{ marginTop: spazio.xxl }} />
        ) : (
          <FlatList
            ref={lista}
            data={dati}
            inverted
            keyExtractor={(m) => String(m.id)}
            contentContainerStyle={s.contenuto}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={[s.vuoto, { color: c.testo3 }]}>{t('lavoro.chat.vuota')}</Text>}
            renderItem={({ item, index }) => {
              // La lista e' rovesciata: il messaggio "prima" e' quello all'indice successivo.
              const prima = dati[index + 1]
              const nuovoGiorno = !prima || giorno(prima.data) !== giorno(item.data)
              const stessoAutore = prima && prima.autoreId === item.autoreId && !nuovoGiorno
              const corpo = testoDaHtml(item.testo)
              return (
                <View>
                  {nuovoGiorno ? (
                    <Text style={[s.giorno, { color: c.testo3 }]}>{giorno(item.data)}</Text>
                  ) : null}
                  <View style={[s.riga, item.mio ? s.rigaMia : s.rigaAltri, { marginTop: stessoAutore ? 6 : spazio.m }]}>
                    <View
                      style={[
                        s.bolla,
                        item.mio
                          ? { backgroundColor: c.primario, borderBottomRightRadius: 6 }
                          : { backgroundColor: c.superficie, borderBottomLeftRadius: 6, borderColor: c.bordo, borderWidth: StyleSheet.hairlineWidth },
                      ]}
                    >
                      {!item.mio && !stessoAutore && tipo !== 'chat' ? (
                        <Text style={[s.autore, { color: c.primario }]} numberOfLines={1}>
                          {item.autore}
                        </Text>
                      ) : null}
                      {corpo ? (
                        <Text style={[s.testo, { color: item.mio ? c.primarioTesto : c.testo }]}>{corpo}</Text>
                      ) : null}
                      {item.allegati ? (
                        <Text style={[s.allegato, { color: item.mio ? c.primarioTesto : c.testo2 }]}>
                          {tn('lavoro.chat.allegati', item.allegati)}
                        </Text>
                      ) : null}
                      <View style={s.piede}>
                        <Text style={[s.ora, { color: item.mio ? c.primarioTesto : c.testo3 }]}>
                          {item.data ? oraBreve(item.data) : null}
                        </Text>
                        {item.mio && conSpunte ? <Spunte id={item.id} letto={letto} chiaro={item.mio} /> : null}
                      </View>
                    </View>
                  </View>
                </View>
              )
            }}
          />
        )}

        <View style={[s.scrivi, { borderTopColor: c.bordo }]}>
          <TextInput
            style={[s.campo, { backgroundColor: c.superficie, borderColor: c.bordo, color: c.testo }]}
            value={testo}
            onChangeText={setTesto}
            placeholder={t('lavoro.chat.scrivi')}
            placeholderTextColor={c.testo3}
            multiline
            accessibilityLabel={t('lavoro.chat.messaggio')}
          />
          <Pressable
            onPress={invia}
            disabled={!testo.trim() || invio}
            style={({ pressed }) => [
              s.invia,
              { backgroundColor: testo.trim() ? c.primario : c.superficie2, opacity: pressed ? 0.8 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('lavoro.chat.invia')}
          >
            {invio ? (
              <ActivityIndicator size="small" color={c.primarioTesto} />
            ) : (
              <Ionicons name="arrow-up" size={22} color={testo.trim() ? c.primarioTesto : c.testo3} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

/** Una spunta grigia: inviato; due grigie: arrivato; due verdi: letto (come WhatsApp). */
function Spunte({ id, letto, chiaro }: { id: number; letto: Letture; chiaro: boolean }) {
  const c = useColori()
  const visto = letto.visto >= id
  const arrivato = visto || letto.ricevuto >= id
  // Sulla bolla colorata il grigio e' il colore del testo attenuato, il verde e' acceso.
  const grigio = chiaro ? c.primarioTesto : c.testo3
  return (
    <Ionicons
      name={arrivato ? 'checkmark-done' : 'checkmark'}
      size={16}
      color={visto ? VERDE_LETTO : grigio}
      style={[s.spunte, !visto && { opacity: 0.75 }]}
      accessibilityLabel={visto ? t('lavoro.chat.letto') : arrivato ? t('lavoro.chat.ricevuto') : t('lavoro.chat.inviato')}
    />
  )
}

// Verde chiaro e acceso: si legge sia sulle bolle viola/blu sia in tema scuro.
const VERDE_LETTO = '#4CF08A'

const s = StyleSheet.create({
  pagina: { flex: 1 },
  contenuto: { paddingHorizontal: spazio.m, paddingVertical: spazio.m },
  vuoto: { textAlign: 'center', marginTop: spazio.xl, fontSize: 15 },
  giorno: { textAlign: 'center', fontSize: 12, fontWeight: '600', marginVertical: spazio.m, textTransform: 'capitalize' },
  riga: { flexDirection: 'row' },
  rigaMia: { justifyContent: 'flex-end' },
  rigaAltri: { justifyContent: 'flex-start' },
  bolla: {
    maxWidth: '82%',
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 7,
    borderRadius: 20,
    shadowColor: '#1B1F3B',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  autore: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  testo: { fontSize: 16, lineHeight: 21 },
  allegato: { fontSize: 13, marginTop: 4, fontStyle: 'italic' },
  piede: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 3, marginTop: 3 },
  ora: { fontSize: 11, opacity: 0.8 },
  spunte: { marginRight: -2 },
  chiama: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  scrivi: { flexDirection: 'row', alignItems: 'flex-end', gap: spazio.s, padding: spazio.s, borderTopWidth: StyleSheet.hairlineWidth },
  campo: { flex: 1, minHeight: 42, maxHeight: 130, borderWidth: 1, borderRadius: 21, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 10, fontSize: 16 },
  invia: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
})
