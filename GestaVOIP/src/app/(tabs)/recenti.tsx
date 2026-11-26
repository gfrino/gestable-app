/**
 * Le chiamate dal registro di Odoo: «Mie» (di questo operatore) o «Tutte»
 * (dell'azienda, con il nome del collega che le ha fatte o ricevute). Un
 * tocco richiama.
 */

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
import { raggio, spazio, useColori } from '../../ui/tema'
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

type Vista = 'mie' | 'tutte'

/** Chi ha gestito la chiamata, come lo legge chi guarda l'elenco. */
function operatore(v: VoceRegistro, uid: number): string {
  if (v.agent_user_id) {
    return v.agent_user_id[0] === uid ? t('schede.tu') : v.agent_user_id[1]
  }
  return v.handled_by === 'ai' ? t('schede.assistenteAI') : ''
}

export default function Recenti() {
  const c = useColori()
  const { sessione } = useApp()
  const uid = sessione?.utente.uid || 0
  const [vista, setVista] = useState<Vista>('mie')
  const chiave = (v: Vista) => (v === 'mie' ? 'recenti' : 'recenti-tutte')
  const [elenchi, setElenchi] = useState<Record<Vista, VoceRegistro[]>>(() => ({
    mie: leggi<VoceRegistro[]>(sessione?.server, uid, 'recenti') || [],
    tutte: leggi<VoceRegistro[]>(sessione?.server, uid, 'recenti-tutte') || [],
  }))
  const voci = elenchi[vista]
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
      const r = await registroChiamate(sessione.server, sessione.utente.uid, vista === 'tutte')
      setElenchi((e) => ({ ...e, [vista]: r }))
      scrivi(sessione.server, sessione.utente.uid, chiave(vista), r)
      setErrore('')
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e))
    } finally {
      setCarica(false)
    }
  }, [sessione, vista])

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
      <View style={[s.segmenti, { backgroundColor: c.superficie }]}>
        {(['mie', 'tutte'] as Vista[]).map((v) => {
          const attivo = v === vista
          return (
            <Pressable
              key={v}
              onPress={() => setVista(v)}
              style={[s.segmento, attivo && { backgroundColor: c.primarioTenue }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: attivo }}
            >
              <Text style={[s.segmentoTesto, { color: attivo ? c.primario : c.testo2 }]} numberOfLines={1}>
                {v === 'mie' ? t('schede.mie') : t('schede.tutte')}
              </Text>
            </Pressable>
          )
        })}
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
          const chi = vista === 'tutte' ? operatore(item, uid) : ''
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
                {chi ? (
                  <View style={s.chi}>
                    <Ionicons name={item.agent_user_id ? 'person-circle-outline' : 'sparkles-outline'} size={14} color={c.primario} />
                    <Text style={[s.chiTesto, { color: c.primario }]} numberOfLines={1}>
                      {chi}
                    </Text>
                  </View>
                ) : null}
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
  segmenti: { flexDirection: 'row', marginHorizontal: spazio.l, marginBottom: spazio.s, padding: 4, borderRadius: raggio.m },
  segmento: { flex: 1, paddingVertical: 9, borderRadius: raggio.s, alignItems: 'center' },
  segmentoTesto: { fontSize: 15, fontWeight: '700' },
  chi: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  chiTesto: { fontSize: 13, fontWeight: '600' },
  errore: { paddingHorizontal: spazio.xl, marginBottom: spazio.s },
  vuoto: { textAlign: 'center', marginTop: spazio.xxl },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 56 },
  voce: { flexDirection: 'row', alignItems: 'center', gap: spazio.l, paddingHorizontal: spazio.xl, paddingVertical: spazio.m, minHeight: 64 },
  nome: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 13, marginTop: 2 },
  ora: { fontSize: 13 },
})
