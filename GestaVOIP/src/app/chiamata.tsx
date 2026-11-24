/**
 * La chiamata in corso: muto, tastierino, audio, attesa, trasferimento.
 *
 * Si apre da sola quando una chiamata parte o viene accettata e si chiude
 * quando finisce (vedi (tabs)/_layout.tsx).
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { AudioDevice } from '@twilio/voice-react-native-sdk'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colleghi, type Collega } from '../voip/api'
import { useApp, useTelefono } from '../voip/Contesto'
import { telefono, type Fase } from '../voip/telefono'
import { raggio, spazio, useColori, type Colori } from '../ui/tema'

const FASI: Record<Fase, string> = {
  composizione: 'Chiamata in corso...',
  squillo: 'Squilla...',
  'in-arrivo': 'Chiamata in arrivo',
  connessa: '',
  riconnessione: 'Rete debole, riconnessione...',
  finita: 'Chiamata terminata',
}

const TONI = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']

function cronometro(inizio: number | null): string {
  if (!inizio) {
    return ''
  }
  const s = Math.max(0, Math.floor((Date.now() - inizio) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function nomeAudio(d: AudioDevice | null): string {
  if (!d) {
    return 'Audio'
  }
  if (d.type === AudioDevice.Type.Speaker) {
    return 'Vivavoce'
  }
  if (d.type === AudioDevice.Type.Earpiece) {
    return 'Telefono'
  }
  return d.name || 'Bluetooth'
}

type PropsTasto = {
  icona: keyof typeof Ionicons.glyphMap
  testo: string
  attivo?: boolean
  onPress: () => void
  disabilitato?: boolean
  c: Colori
}

function Tasto({ icona, testo, attivo, onPress, disabilitato, c }: PropsTasto) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabilitato}
      style={s.azione}
      accessibilityRole="button"
      accessibilityLabel={testo}
      accessibilityState={{ selected: attivo, disabled: disabilitato }}
    >
      <View
        style={[
          s.azioneCerchio,
          { backgroundColor: attivo ? c.testo : c.superficie2, opacity: disabilitato ? 0.4 : 1 },
        ]}
      >
        <Ionicons name={icona} size={28} color={attivo ? c.sfondo : c.testo} />
      </View>
      <Text style={[s.azioneTesto, { color: c.testo2 }]} numberOfLines={1}>
        {testo}
      </Text>
    </Pressable>
  )
}

export default function SchermataChiamata() {
  const c = useColori()
  const { sessione } = useApp()
  const { chiamata, audio, audioScelto } = useTelefono()
  const [, setBattito] = useState(0)
  const [tastierino, setTastierino] = useState(false)
  const [toni, setToni] = useState('')
  const [lista, setLista] = useState<Collega[] | null>(null)
  const [sceltaAudio, setSceltaAudio] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setBattito((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  if (!chiamata) {
    return <View style={{ flex: 1, backgroundColor: c.sfondo }} />
  }

  const connessa = chiamata.fase === 'connessa'
  const stato = connessa ? cronometro(chiamata.inizio) : FASI[chiamata.fase]

  async function apriTrasferimento() {
    if (!sessione) {
      return
    }
    setLista([])
    try {
      setLista(await colleghi(sessione.server))
    } catch (e) {
      setLista(null)
      Alert.alert('Trasferimento', e instanceof Error ? e.message : String(e))
    }
  }

  async function trasferisciA(collega: Collega) {
    setLista(null)
    try {
      const nome = await telefono.trasferisci(collega.id)
      Alert.alert('Chiamata passata', `La chiamata ora squilla a ${nome}.`)
    } catch (e) {
      Alert.alert('Trasferimento non riuscito', e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]}>
      <View style={s.testa}>
        <Text style={[s.nome, { color: c.testo }]} numberOfLines={2}>
          {chiamata.nome || chiamata.numero || 'Sconosciuto'}
        </Text>
        {chiamata.nome ? (
          <Text style={[s.numero, { color: c.testo2 }]} numberOfLines={1}>
            {chiamata.numero}
          </Text>
        ) : null}
        <Text style={[s.stato, { color: chiamata.fase === 'riconnessione' ? c.ambra : c.testo2 }]}>
          {stato}
          {chiamata.attesa ? ' · in attesa' : ''}
        </Text>
      </View>

      {tastierino ? (
        <View style={s.toni}>
          <Text style={[s.toniTesto, { color: c.testo }]} numberOfLines={1}>
            {toni}
          </Text>
          <View style={s.toniGriglia}>
            {TONI.map((t) => (
              <Pressable
                key={t}
                onPress={() => {
                  setToni((v) => v + t)
                  void telefono.toni(t)
                }}
                style={({ pressed }) => [s.tono, { backgroundColor: pressed ? c.superficie2 : c.superficie }]}
              >
                <Text style={[s.tonoTesto, { color: c.testo }]}>{t}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <View style={s.griglia}>
          <Tasto c={c} icona="mic-off" testo="Muto" attivo={chiamata.muto} onPress={() => void telefono.muto()} disabilitato={!connessa} />
          <Tasto c={c} icona="keypad" testo="Tastierino" onPress={() => setTastierino(true)} disabilitato={!connessa} />
          <Tasto
            c={c}
            icona={audioScelto?.type === AudioDevice.Type.Speaker ? 'volume-high' : 'volume-medium'}
            testo={nomeAudio(audioScelto)}
            attivo={audioScelto?.type === AudioDevice.Type.Speaker}
            onPress={() => setSceltaAudio(true)}
          />
          <Tasto c={c} icona="pause" testo="Attesa" attivo={chiamata.attesa} onPress={() => void telefono.attesa()} disabilitato={!connessa} />
          <Tasto c={c} icona="swap-horizontal" testo="Trasferisci" onPress={apriTrasferimento} disabilitato={!connessa || chiamata.direzione !== 'entrata'} />
        </View>
      )}

      <View style={s.piede}>
        {tastierino ? (
          <Pressable onPress={() => setTastierino(false)} style={s.lato} hitSlop={12}>
            <Text style={{ color: c.primario, fontSize: 16, fontWeight: '600' }}>Nascondi</Text>
          </Pressable>
        ) : (
          <View style={s.lato} />
        )}
        <Pressable
          onPress={() => void telefono.riaggancia()}
          style={({ pressed }) => [s.riaggancia, { backgroundColor: c.rosso, opacity: pressed ? 0.85 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Riaggancia"
        >
          <Ionicons name="call" size={34} color="#FFFFFF" style={{ transform: [{ rotate: '135deg' }] }} />
        </Pressable>
        <View style={s.lato} />
      </View>

      <Modal visible={sceltaAudio} transparent animationType="fade" onRequestClose={() => setSceltaAudio(false)}>
        <Pressable style={s.velo} onPress={() => setSceltaAudio(false)}>
          <View style={[s.foglio, { backgroundColor: c.superficie }]}>
            {audio.map((d) => (
              <Pressable
                key={d.uuid}
                style={s.foglioVoce}
                onPress={() => {
                  setSceltaAudio(false)
                  void telefono.scegliAudio(d)
                }}
              >
                <Text style={[s.foglioTesto, { color: c.testo }]}>{nomeAudio(d)}</Text>
                {audioScelto?.uuid === d.uuid ? <Ionicons name="checkmark" size={22} color={c.primario} /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={lista !== null} transparent animationType="slide" onRequestClose={() => setLista(null)}>
        <Pressable style={s.velo} onPress={() => setLista(null)}>
          <View style={[s.foglio, { backgroundColor: c.superficie, maxHeight: '70%' }]}>
            <Text style={[s.foglioTitolo, { color: c.testo }]}>Passa la chiamata a</Text>
            {lista && lista.length === 0 ? <ActivityIndicator color={c.primario} style={{ margin: spazio.l }} /> : null}
            <FlatList
              data={lista || []}
              keyExtractor={(a) => String(a.id)}
              renderItem={({ item }) => (
                <Pressable style={s.foglioVoce} onPress={() => void trasferisciA(item)}>
                  <View style={[s.punto, { backgroundColor: item.available ? c.verde : c.testo3 }]} />
                  <Text style={[s.foglioTesto, { color: c.testo, flex: 1 }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={{ color: c.testo3 }}>{item.extension}</Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1, paddingHorizontal: spazio.xl },
  testa: { alignItems: 'center', paddingTop: spazio.xxl * 1.5, gap: spazio.s },
  nome: { fontSize: 32, fontWeight: '600', textAlign: 'center' },
  numero: { fontSize: 17 },
  stato: { fontSize: 17, marginTop: spazio.s, fontVariant: ['tabular-nums'] },
  griglia: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignContent: 'center', rowGap: spazio.xl, columnGap: spazio.l },
  azione: { width: '28%', alignItems: 'center', gap: spazio.s },
  azioneCerchio: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  azioneTesto: { fontSize: 13 },
  toni: { flex: 1, justifyContent: 'center' },
  toniTesto: { fontSize: 28, textAlign: 'center', minHeight: 36, marginBottom: spazio.l },
  toniGriglia: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spazio.m },
  tono: { width: '30%', aspectRatio: 1.6, borderRadius: raggio.l, alignItems: 'center', justifyContent: 'center' },
  tonoTesto: { fontSize: 28, fontWeight: '500' },
  piede: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spazio.xl },
  lato: { width: 90, alignItems: 'center' },
  riaggancia: { width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center' },
  velo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  foglio: { borderTopLeftRadius: raggio.l, borderTopRightRadius: raggio.l, paddingVertical: spazio.m, paddingBottom: spazio.xxl },
  foglioTitolo: { fontSize: 17, fontWeight: '700', paddingHorizontal: spazio.xl, paddingVertical: spazio.m },
  foglioVoce: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, paddingHorizontal: spazio.xl, paddingVertical: spazio.l },
  foglioTesto: { fontSize: 17 },
  punto: { width: 10, height: 10, borderRadius: 5 },
})
