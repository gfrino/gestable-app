/**
 * Messaggi: le chat e i canali di Discuss, e le notifiche (la posta in arrivo
 * di Odoo: menzioni e messaggi sui record che segui).
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { t } from '../../i18n'
import {
  conversazioni,
  percorsoRecord,
  postaInArrivo,
  quanteNotifiche,
  segnaNotificheLette,
  urlAvatar,
  type Conversazione,
  type Notifica,
} from '../../odoo/lavoro'
import { quandoBreve, testoDaHtml } from '../../odoo/testo'
import { Avatar } from '../../ui/Avatar'
import { inviaOdoo, rottaOdoo } from '../../ui/comandiOdoo'
import { useMenu } from '../../ui/MenuLaterale'
import { Testata } from '../../ui/Testata'
import { raggio, spazio, useColori } from '../../ui/tema'
import { useApp } from '../../voip/Contesto'
import { leggi, scrivi } from '../../odoo/archivio'
import { Caricamento } from '../../ui/Caricamento'

type Vista = 'chat' | 'notifiche'

export default function Messaggi() {
  const c = useColori()
  const router = useRouter()
  const { sessione } = useApp()
  const { aggiorna } = useMenu()
  const [vista, setVista] = useState<Vista>('chat')
  const [copia] = useState(() =>
    leggi<{ chat: Conversazione[]; notifiche: Notifica[]; totale: number }>(sessione?.server, sessione?.utente.uid, 'messaggi'),
  )
  const [chat, setChat] = useState<Conversazione[] | null>(copia?.chat || null)
  const [notifiche, setNotifiche] = useState<Notifica[] | null>(copia?.notifiche || null)
  const [totaleNotifiche, setTotaleNotifiche] = useState(copia?.totale || 0)
  const [errore, setErrore] = useState('')
  const [ricarica, setRicarica] = useState(false)
  const server = sessione?.server || ''
  const uid = sessione?.utente.uid || 0

  const carica = useCallback(async () => {
    if (!server) {
      return
    }
    try {
      const [a, b, n] = await Promise.all([conversazioni(server, uid), postaInArrivo(server), quanteNotifiche(server)])
      setChat(a)
      setNotifiche(b)
      setTotaleNotifiche(n)
      scrivi(server, uid, 'messaggi', { chat: a, notifiche: b, totale: n })
      setErrore('')
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e))
    }
  }, [server, uid])

  // Si aggiorna quando si torna qui e ogni 20 secondi mentre e' aperta.
  useFocusEffect(
    useCallback(() => {
      void carica()
      const timer = setInterval(() => void carica(), 20_000)
      return () => clearInterval(timer)
    }, [carica]),
  )

  async function tiraGiu() {
    setRicarica(true)
    await carica()
    setRicarica(false)
  }

  async function apriNotifica(n: Notifica) {
    setNotifiche((l) => (l ? l.filter((x) => x.id !== n.id) : l))
    setTotaleNotifiche((x) => Math.max(0, x - 1))
    segnaNotificheLette(server, [n.id])
      .then(aggiorna)
      .catch(() => undefined)
    if (n.modello && n.recordId) {
      inviaOdoo({ tipo: 'apri', percorso: percorsoRecord(n.modello, n.recordId) })
      // dismissTo torna alla vista di Odoo che c'e' gia' (navigate ne aprirebbe
    // una seconda copia sopra, che riparte dalla home).
    router.dismissTo(rottaOdoo())
    }
  }

  async function tutteLette() {
    const ids = (notifiche || []).map((n) => n.id)
    setNotifiche([])
    setTotaleNotifiche((x) => Math.max(0, x - ids.length))
    await segnaNotificheLette(server, ids).catch(() => undefined)
    aggiorna()
    // Se ce n'erano piu' di quelle in lista, arrivano le successive.
    void carica()
  }

  // Come in Odoo: quante chat hanno qualcosa da leggere, non quanti messaggi.
  const nonLettiChat = (chat || []).filter((x) => x.nonLetti > 0).length

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top']}>
      <Testata
        titolo={t('lavoro.messaggi.titolo')}
        destra={
          vista === 'notifiche' && notifiche?.length ? (
            <Pressable onPress={tutteLette} hitSlop={10} style={s.azione} accessibilityRole="button">
              <Text style={[s.azioneTesto, { color: c.primario }]} numberOfLines={1}>
                {t('lavoro.messaggi.tutteLette')}
              </Text>
            </Pressable>
          ) : null
        }
      />

      <View style={[s.segmenti, { backgroundColor: c.superficie }]}>
        {(['chat', 'notifiche'] as Vista[]).map((v) => {
          const attivo = v === vista
          const n = v === 'chat' ? nonLettiChat : totaleNotifiche
          return (
            <Pressable
              key={v}
              onPress={() => setVista(v)}
              style={[s.segmento, attivo && { backgroundColor: c.primarioTenue }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: attivo }}
            >
              <Text style={[s.segmentoTesto, { color: attivo ? c.primario : c.testo2 }]} numberOfLines={1}>
                {v === 'chat' ? t('lavoro.messaggi.chat') : t('lavoro.messaggi.notifiche')}
                {n ? ` · ${n}` : ''}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {errore && !chat ? (
        <Text style={[s.vuoto, { color: c.rosso }]}>{errore}</Text>
      ) : !chat || !notifiche ? (
        <Caricamento style={{ marginTop: spazio.xxl }} />
      ) : vista === 'chat' ? (
        <FlatList
          data={chat}
          keyExtractor={(x) => String(x.id)}
          refreshControl={<RefreshControl refreshing={ricarica} onRefresh={tiraGiu} tintColor={c.primario} />}
          ListEmptyComponent={<Text style={[s.vuoto, { color: c.testo3 }]}>{t('lavoro.messaggi.nessunaChat')}</Text>}
          renderItem={({ item }) => {
            const anteprima = item.ultimo ? testoDaHtml(item.ultimo.testo).replace(/\s+/g, ' ') : ''
            return (
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/messaggi/[id]', params: { id: String(item.id), nome: item.nome, tipo: item.tipo } })
                }
                style={({ pressed }) => [s.riga, { backgroundColor: pressed ? c.superficie : 'transparent' }]}
              >
                <Avatar
                  url={item.partnerId ? urlAvatar(server, 'res.partner', item.partnerId) : undefined}
                  nome={item.nome}
                  icona={item.tipo === 'chat' ? undefined : 'people'}
                  lato={50}
                />
                <View style={s.rigaCorpo}>
                  <View style={s.rigaSopra}>
                    <Text
                      style={[s.rigaTitolo, { color: c.testo, fontWeight: item.nonLetti ? '800' : '600' }]}
                      numberOfLines={1}
                    >
                      {item.tipo === 'chat' ? item.nome : `# ${item.nome}`}
                    </Text>
                    <Text style={[s.ora, { color: item.nonLetti ? c.primario : c.testo3 }]}>
                      {quandoBreve(item.ultimo?.data || null)}
                    </Text>
                  </View>
                  <View style={s.rigaSopra}>
                    <Text style={[s.anteprima, { color: item.nonLetti ? c.testo : c.testo2 }]} numberOfLines={2}>
                      {item.ultimo ? `${item.ultimo.mio ? `${t('lavoro.messaggi.tu')}: ` : item.tipo === 'chat' ? '' : `${item.ultimo.autore.split(' ')[0]}: `}${anteprima}` : ' '}
                    </Text>
                    {item.nonLetti ? (
                      <View style={[s.badge, { backgroundColor: c.primario }]}>
                        <Text style={[s.badgeTesto, { color: c.primarioTesto }]}>{item.nonLetti > 99 ? '99+' : item.nonLetti}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            )
          }}
        />
      ) : (
        <FlatList
          data={notifiche}
          keyExtractor={(x) => String(x.id)}
          refreshControl={<RefreshControl refreshing={ricarica} onRefresh={tiraGiu} tintColor={c.primario} />}
          ListEmptyComponent={
            <View style={s.vuotoBlocco}>
              <Ionicons name="checkmark-done-circle" size={56} color={c.verde} />
              <Text style={[s.vuoto, { color: c.testo2, marginTop: spazio.s }]}>{t('lavoro.messaggi.nessunaNotifica')}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => apriNotifica(item)}
              style={({ pressed }) => [s.riga, { backgroundColor: pressed ? c.superficie : 'transparent' }]}
            >
              <Avatar url={item.autoreId ? urlAvatar(server, 'res.partner', item.autoreId) : undefined} nome={item.autore} lato={44} />
              <View style={s.rigaCorpo}>
                <View style={s.rigaSopra}>
                  <Text style={[s.rigaTitolo, { color: c.testo }]} numberOfLines={1}>
                    {item.titolo || item.autore}
                  </Text>
                  <Text style={[s.ora, { color: c.testo3 }]}>{quandoBreve(item.data)}</Text>
                </View>
                <Text style={[s.anteprima, { color: c.testo2 }]} numberOfLines={3}>
                  {item.autore ? `${item.autore}: ` : ''}
                  {testoDaHtml(item.testo).replace(/\s+/g, ' ')}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1 },
  azione: { paddingHorizontal: spazio.s },
  azioneTesto: { fontSize: 15, fontWeight: '600' },
  segmenti: { flexDirection: 'row', margin: spazio.l, marginBottom: spazio.s, padding: 4, borderRadius: raggio.m },
  segmento: { flex: 1, paddingVertical: 9, borderRadius: raggio.s, alignItems: 'center' },
  segmentoTesto: { fontSize: 15, fontWeight: '700' },
  riga: { flexDirection: 'row', gap: spazio.m, paddingHorizontal: spazio.l, paddingVertical: spazio.m, alignItems: 'center' },
  rigaCorpo: { flex: 1, gap: 3 },
  rigaSopra: { flexDirection: 'row', alignItems: 'center', gap: spazio.s },
  rigaTitolo: { flex: 1, fontSize: 16 },
  ora: { fontSize: 12, fontVariant: ['tabular-nums'] },
  anteprima: { flex: 1, fontSize: 14, lineHeight: 19 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeTesto: { fontSize: 12, fontWeight: '800' },
  vuoto: { fontSize: 15, textAlign: 'center', marginTop: spazio.xl, paddingHorizontal: spazio.xl },
  vuotoBlocco: { alignItems: 'center', marginTop: spazio.xxl * 2 },
})
