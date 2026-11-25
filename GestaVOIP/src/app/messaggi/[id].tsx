/** Una chat o un canale di Discuss: bolle, invio, segnata letta all'apertura. */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
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
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { loc, t, tn } from '../../i18n'
import { inviaChat, messaggiChat, segnaLetta, type MessaggioChat } from '../../odoo/lavoro'
import { htmlDaTesto, oraBreve, testoDaHtml } from '../../odoo/testo'
import { useMenu } from '../../ui/MenuLaterale'
import { Testata } from '../../ui/Testata'
import { spazio, useColori } from '../../ui/tema'
import { useApp } from '../../voip/Contesto'

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
  const lista = useRef<FlatList<MessaggioChat>>(null)
  const server = sessione?.server || ''
  const uid = sessione?.utente.uid || 0

  const carica = useCallback(async () => {
    if (!server || !canale) {
      return
    }
    try {
      const m = await messaggiChat(server, uid, canale)
      setMessaggi(m)
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
  }, [server, uid, canale, aggiorna])

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
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top', 'bottom']}>
      <Testata titolo={tipo === 'chat' ? nome || t('lavoro.chat.chat') : `# ${nome || t('lavoro.chat.canale')}`} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {!messaggi ? (
          <ActivityIndicator style={{ marginTop: spazio.xxl }} color={c.primario} />
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
                  <View style={[s.riga, item.mio ? s.rigaMia : s.rigaAltri, { marginTop: stessoAutore ? 2 : spazio.s }]}>
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
                      <Text style={[s.ora, { color: item.mio ? c.primarioTesto : c.testo3 }]}>
                        {item.data ? oraBreve(item.data) : null}
                      </Text>
                    </View>
                  </View>
                </View>
              )
            }}
          />
        )}

        <View style={[s.scrivi, { borderTopColor: c.bordo, backgroundColor: c.sfondo }]}>
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

const s = StyleSheet.create({
  pagina: { flex: 1 },
  contenuto: { paddingHorizontal: spazio.m, paddingVertical: spazio.m },
  vuoto: { textAlign: 'center', marginTop: spazio.xl, fontSize: 15 },
  giorno: { textAlign: 'center', fontSize: 12, fontWeight: '600', marginVertical: spazio.m, textTransform: 'capitalize' },
  riga: { flexDirection: 'row' },
  rigaMia: { justifyContent: 'flex-end' },
  rigaAltri: { justifyContent: 'flex-start' },
  bolla: { maxWidth: '82%', paddingHorizontal: 13, paddingTop: 8, paddingBottom: 6, borderRadius: 18 },
  autore: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  testo: { fontSize: 16, lineHeight: 21 },
  allegato: { fontSize: 13, marginTop: 4, fontStyle: 'italic' },
  ora: { fontSize: 11, alignSelf: 'flex-end', marginTop: 3, opacity: 0.8 },
  scrivi: { flexDirection: 'row', alignItems: 'flex-end', gap: spazio.s, padding: spazio.s, borderTopWidth: StyleSheet.hairlineWidth },
  campo: { flex: 1, minHeight: 42, maxHeight: 130, borderWidth: 1, borderRadius: 21, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 10, fontSize: 16 },
  invia: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
})
