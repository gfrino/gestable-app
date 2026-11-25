/** Scheda di un contatto: azioni rapide, numeri, email, indirizzo, persone dell'azienda. */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { t } from '../../i18n'
import { schedaContatto, type SchedaContatto } from '../../odoo/contatti'
import { percorsoRecord, urlAvatar } from '../../odoo/lavoro'
import { testoDaHtml } from '../../odoo/testo'
import { Avatar } from '../../ui/Avatar'
import { chiamaNumero } from '../../ui/chiama'
import { inviaOdoo, rottaOdoo } from '../../ui/comandiOdoo'
import { Pulsante } from '../../ui/Pulsante'
import { Testata } from '../../ui/Testata'
import { raggio, spazio, useColori } from '../../ui/tema'
import { useApp } from '../../voip/Contesto'
import { Caricamento } from '../../ui/Caricamento'

export default function SchedaContattoSchermata() {
  const c = useColori()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { sessione } = useApp()
  const server = sessione?.server || ''
  const [k, setK] = useState<SchedaContatto | null>(null)
  const [errore, setErrore] = useState('')

  const carica = useCallback(async () => {
    try {
      const r = await schedaContatto(server, Number(id))
      if (r) {
        setK(r)
      } else {
        setErrore(t('schede.contattoNonTrovato'))
      }
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e))
    }
  }, [server, id])

  useFocusEffect(
    useCallback(() => {
      void carica()
    }, [carica]),
  )

  function apri(url: string) {
    Linking.openURL(url).catch(() => Alert.alert(t('schede.link'), t('schede.nessunaAppLink')))
  }

  function apriInOdoo() {
    if (!k) {
      return
    }
    inviaOdoo({ tipo: 'apri', percorso: percorsoRecord('res.partner', k.id) })
    router.dismissTo(rottaOdoo())
  }

  const numero = k ? k.cellulare || k.telefono : ''
  const indirizzoUnaRiga = k ? k.indirizzo.replace(/\n/g, ', ') : ''
  const azioni = k
    ? [
        { icona: 'call' as const, testo: t('schede.chiama'), attiva: !!numero, fai: () => chiamaNumero(sessione, numero, k.nome) },
        { icona: 'chatbubble' as const, testo: t('schede.messaggio'), attiva: !!numero, fai: () => apri(`sms:${numero.replace(/\s+/g, '')}`) },
        { icona: 'mail' as const, testo: t('schede.email'), attiva: !!k.email, fai: () => apri(`mailto:${k.email}`) },
        {
          icona: 'navigate' as const,
          testo: t('schede.mappa'),
          attiva: !!indirizzoUnaRiga,
          fai: () => apri(`http://maps.apple.com/?q=${encodeURIComponent(indirizzoUnaRiga)}`),
        },
      ]
    : []

  const voce = (icona: keyof typeof Ionicons.glyphMap, etichetta: string, valore: string, onPress?: () => void) => (
    <Pressable
      key={etichetta + valore}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [s.voce, { backgroundColor: pressed ? c.superficie2 : 'transparent' }]}
    >
      <Ionicons name={icona} size={20} color={c.primario} />
      <View style={{ flex: 1 }}>
        <Text style={[s.voceEtichetta, { color: c.testo3 }]}>{etichetta}</Text>
        <Text style={[s.voceValore, { color: onPress ? c.primario : c.testo }]} selectable>
          {valore}
        </Text>
      </View>
    </Pressable>
  )

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top', 'bottom']}>
      <Testata titolo={k?.eAzienda || k?.persone.length ? t('schede.azienda') : t('schede.contatto')} />
      {errore && !k ? (
        <Text style={[s.vuoto, { color: c.rosso }]}>{errore}</Text>
      ) : !k ? (
        <Caricamento style={{ marginTop: spazio.xxl }} />
      ) : (
        <ScrollView contentContainerStyle={s.contenuto}>
          <View style={s.eroe}>
            <Avatar
              url={k.foto ? urlAvatar(server, 'res.partner', k.id) : undefined}
              nome={k.nome}
              icona={k.eAzienda ? 'business' : undefined}
              logo={k.eAzienda || k.persone.length > 0}
              lato={96}
            />
            <Text style={[s.nome, { color: c.testo }]}>{k.nome}</Text>
            {k.funzione ? <Text style={[s.funzione, { color: c.testo2 }]}>{k.funzione}</Text> : null}
            {k.azienda && k.aziendaId ? (
              <Pressable
                onPress={() => router.push({ pathname: '/contatti/[id]', params: { id: String(k.aziendaId) } })}
                style={[s.azienda, { backgroundColor: c.primarioTenue }]}
                accessibilityRole="link"
              >
                <Ionicons name="business" size={14} color={c.primario} />
                <Text style={[s.aziendaTesto, { color: c.primario }]} numberOfLines={1}>
                  {k.azienda}
                </Text>
              </Pressable>
            ) : null}
          </View>

          <View style={s.azioni}>
            {azioni.map((a) => (
              <Pressable
                key={a.testo}
                onPress={a.fai}
                disabled={!a.attiva}
                style={({ pressed }) => [
                  s.azione,
                  { backgroundColor: pressed ? c.superficie2 : c.superficie, borderColor: c.bordo, opacity: a.attiva ? 1 : 0.4 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={a.testo}
              >
                <Ionicons name={a.icona} size={22} color={a.icona === 'call' ? c.verde : c.primario} />
                <Text style={[s.azioneTesto, { color: c.testo }]} numberOfLines={1}>
                  {a.testo}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={[s.scheda, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
            {k.cellulare ? voce('phone-portrait-outline', t('schede.cellulare'), k.cellulare, () => chiamaNumero(sessione, k.cellulare, k.nome)) : null}
            {k.telefono && k.telefono.replace(/\D/g, '') !== k.cellulare.replace(/\D/g, '')
              ? voce('call-outline', t('schede.telefono'), k.telefono, () => chiamaNumero(sessione, k.telefono, k.nome))
              : null}
            {k.email ? voce('mail-outline', t('schede.email'), k.email, () => apri(`mailto:${k.email}`)) : null}
            {k.indirizzo
              ? voce('location-outline', t('schede.indirizzo'), k.indirizzo, () =>
                  apri(`http://maps.apple.com/?q=${encodeURIComponent(indirizzoUnaRiga)}`),
                )
              : null}
            {k.sito ? voce('globe-outline', t('schede.sito'), k.sito, () => apri(/^https?:/i.test(k.sito) ? k.sito : `https://${k.sito}`)) : null}
            {k.partitaIva ? voce('document-text-outline', t('schede.partitaIva'), k.partitaIva) : null}
            {!numero && !k.email && !k.indirizzo && !k.sito && !k.partitaIva ? (
              <Text style={[s.vuotoScheda, { color: c.testo3 }]}>{t('schede.nessunRecapito')}</Text>
            ) : null}
          </View>

          {k.etichette.length ? (
            <View style={s.etichette}>
              {k.etichette.map((e) => (
                <View key={e} style={[s.etichetta, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
                  <Text style={[s.etichettaTesto, { color: c.testo2 }]}>{e}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {k.persone.length ? (
            <View style={[s.scheda, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
              <Text style={[s.titoloScheda, { color: c.testo2 }]}>{t('schede.persone', { n: k.persone.length })}</Text>
              {k.persone.map((p) => {
                const n = p.cellulare || p.telefono
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => router.push({ pathname: '/contatti/[id]', params: { id: String(p.id) } })}
                    style={({ pressed }) => [s.persona, { backgroundColor: pressed ? c.superficie2 : 'transparent' }]}
                  >
                    <Avatar url={p.foto ? urlAvatar(server, 'res.partner', p.id) : undefined} nome={p.nome} lato={38} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.personaNome, { color: c.testo }]} numberOfLines={1}>
                        {p.nome}
                      </Text>
                      {p.funzione || p.email ? (
                        <Text style={[s.personaSotto, { color: c.testo2 }]} numberOfLines={1}>
                          {p.funzione || p.email}
                        </Text>
                      ) : null}
                    </View>
                    {n ? (
                      <Pressable
                        onPress={() => chiamaNumero(sessione, n, p.nome)}
                        hitSlop={8}
                        style={[s.chiama, { backgroundColor: c.verdeTenue }]}
                        accessibilityLabel={t('schede.chiamaNome', { nome: p.nome })}
                      >
                        <Ionicons name="call" size={16} color={c.verde} />
                      </Pressable>
                    ) : null}
                  </Pressable>
                )
              })}
            </View>
          ) : null}

          {testoDaHtml(k.note) ? (
            <View style={[s.scheda, { backgroundColor: c.superficie, borderColor: c.bordo, padding: spazio.m }]}>
              <Text style={[s.titoloScheda, { color: c.testo2, paddingHorizontal: 0 }]}>{t('schede.note')}</Text>
              <Text style={[s.note, { color: c.testo }]} selectable>
                {testoDaHtml(k.note)}
              </Text>
            </View>
          ) : null}

          <Pulsante testo={t('schede.apriInOdoo')} variante="tenue" onPress={apriInOdoo} />
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1 },
  contenuto: { padding: spazio.l, gap: spazio.m, paddingBottom: spazio.xxl },
  vuoto: { fontSize: 15, textAlign: 'center', marginTop: spazio.xl, paddingHorizontal: spazio.xl },
  eroe: { alignItems: 'center', gap: 6, paddingTop: spazio.s },
  nome: { fontSize: 26, fontWeight: '800', textAlign: 'center', marginTop: spazio.s, letterSpacing: -0.3 },
  funzione: { fontSize: 15, textAlign: 'center' },
  azienda: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, maxWidth: '90%' },
  aziendaTesto: { fontSize: 14, fontWeight: '700' },
  azioni: { flexDirection: 'row', gap: spazio.s },
  azione: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 12, borderRadius: raggio.l, borderWidth: 1 },
  azioneTesto: { fontSize: 12, fontWeight: '600' },
  scheda: { borderWidth: 1, borderRadius: raggio.l, paddingVertical: spazio.xs, overflow: 'hidden' },
  titoloScheda: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, paddingHorizontal: spazio.m, paddingTop: spazio.s, paddingBottom: 4 },
  voce: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, paddingHorizontal: spazio.m, paddingVertical: 10 },
  voceEtichetta: { fontSize: 12, fontWeight: '600' },
  voceValore: { fontSize: 16, marginTop: 1 },
  vuotoScheda: { fontSize: 14, padding: spazio.m },
  etichette: { flexDirection: 'row', flexWrap: 'wrap', gap: spazio.s },
  etichetta: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  etichettaTesto: { fontSize: 13, fontWeight: '600' },
  persona: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, paddingHorizontal: spazio.m, paddingVertical: 8 },
  personaNome: { fontSize: 15, fontWeight: '600' },
  personaSotto: { fontSize: 13 },
  chiama: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 15, lineHeight: 21, marginTop: 4 },
})
