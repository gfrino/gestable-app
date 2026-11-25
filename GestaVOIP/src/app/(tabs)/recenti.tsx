/** Le chiamate di questo operatore, dal registro di Odoo. Un tocco richiama. */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { loc, t } from '../../i18n'
import { PulsanteMenu } from '../../ui/MenuLaterale'
import { registroChiamate, type VoceRegistro } from '../../voip/api'
import { useApp } from '../../voip/Contesto'
import { telefono } from '../../voip/telefono'
import { spazio, useColori } from '../../ui/tema'
import { leggi, scrivi } from '../../odoo/archivio'

function quando(data: string): string {
  // Odoo manda le date in UTC senza fuso: lo si aggiunge prima di convertirle.
  const d = new Date(data.replace(' ', 'T') + 'Z')
  const oggi = new Date()
  const ora = d.toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === oggi.toDateString()) {
    return ora
  }
  return `${d.toLocaleDateString(loc(), { day: '2-digit', month: '2-digit' })} ${ora}`
}

function durata(secondi: number): string {
  if (!secondi) {
    return ''
  }
  const m = Math.floor(secondi / 60)
  return m ? t('schede.durataMinuti', { m, s: secondi % 60 }) : t('schede.durataSecondi', { s: secondi })
}

export default function Recenti() {
  const c = useColori()
  const { sessione } = useApp()
  const [voci, setVoci] = useState<VoceRegistro[]>(() => leggi<VoceRegistro[]>(sessione?.server, sessione?.utente.uid, 'recenti') || [])
  const [carica, setCarica] = useState(false)
  const [errore, setErrore] = useState('')

  // La rotella solo quando si tira giu': tornando sulla scheda si vede
  // subito l'elenco di prima e si aggiorna senza farlo notare.
  const aggiorna = useCallback(async (aMano = false) => {
    if (!sessione) {
      return
    }
    setCarica(aMano)
    try {
      const r = await registroChiamate(sessione.server, sessione.utente.uid)
      setVoci(r)
      scrivi(sessione.server, sessione.utente.uid, 'recenti', r)
      setErrore('')
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e))
    } finally {
      setCarica(false)
    }
  }, [sessione])

  useFocusEffect(
    useCallback(() => {
      void aggiorna()
    }, [aggiorna]),
  )

  async function richiama(v: VoceRegistro) {
    if (!v.caller_number) {
      return
    }
    try {
      await telefono.chiama(v.caller_number, v.partner_id ? v.partner_id[1] : '')
    } catch (e) {
      Alert.alert(t('schede.chiamataNonPartita'), e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top']}>
      <View style={s.testa}>
        <PulsanteMenu />
        <Text style={[s.titolo, { color: c.testo }]}>{t('schede.recenti')}</Text>
      </View>
      {errore ? <Text style={[s.errore, { color: c.rosso }]}>{errore}</Text> : null}
      <FlatList
        data={voci}
        keyExtractor={(v) => String(v.id)}
        refreshControl={<RefreshControl refreshing={carica} onRefresh={() => void aggiorna(true)} tintColor={c.primario} />}
        ListEmptyComponent={
          carica ? null : <Text style={[s.vuoto, { color: c.testo3 }]}>{t('schede.nessunaChiamata')}</Text>
        }
        ItemSeparatorComponent={() => <View style={[s.sep, { backgroundColor: c.bordo }]} />}
        renderItem={({ item }) => {
          const entrata = item.direction === 'inbound'
          const persa = entrata && (item.status === 'no-answer' || !item.duration)
          const nome = item.partner_id ? item.partner_id[1] : item.caller_number || t('schede.sconosciuto')
          return (
            <Pressable
              onPress={() => richiama(item)}
              style={({ pressed }) => [s.voce, { backgroundColor: pressed ? c.superficie2 : c.superficie }]}
              accessibilityRole="button"
              accessibilityLabel={t('schede.richiama', { nome })}
            >
              <Ionicons
                name={entrata ? 'arrow-down' : 'arrow-up'}
                size={18}
                color={persa ? c.rosso : entrata ? c.verde : c.primario}
              />
              <View style={{ flex: 1 }}>
                <Text style={[s.nome, { color: persa ? c.rosso : c.testo }]} numberOfLines={1}>
                  {nome}
                </Text>
                <Text style={[s.sub, { color: c.testo2 }]} numberOfLines={1}>
                  {[item.partner_id ? item.caller_number : '', durata(item.duration)].filter(Boolean).join(' · ') ||
                    (entrata ? t('schede.inEntrata') : t('schede.inUscita'))}
                </Text>
              </View>
              <Text style={[s.ora, { color: c.testo3 }]}>{quando(item.create_date)}</Text>
            </Pressable>
          )
        }}
        contentContainerStyle={{ paddingBottom: spazio.xl }}
      />
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1 },
  testa: { flexDirection: 'row', alignItems: 'center', gap: spazio.xs, paddingHorizontal: spazio.m, paddingVertical: spazio.s },
  titolo: { fontSize: 30, fontWeight: '700' },
  errore: { paddingHorizontal: spazio.xl, marginBottom: spazio.s },
  vuoto: { textAlign: 'center', marginTop: spazio.xxl },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 56 },
  voce: { flexDirection: 'row', alignItems: 'center', gap: spazio.l, paddingHorizontal: spazio.xl, paddingVertical: spazio.m, minHeight: 64 },
  nome: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 13, marginTop: 2 },
  ora: { fontSize: 13 },
})
