/**
 * Helpdesk: i ticket divisi in schede (Miei, una per ogni collega che ha
 * ticket aperti assegnati, Da assegnare, Aperti, Chiusi) con il numero
 * accanto, ricerca per titolo, cliente o numero, e il + per aprirne uno nuovo.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { t, tn } from '../../i18n'
import { leggi, scrivi } from '../../odoo/archivio'
import { conteggi, tickets, type Conteggi, type Filtro, type Ticket } from '../../odoo/helpdesk'
import { urlAvatar } from '../../odoo/lavoro'
import { Caricamento } from '../../ui/Caricamento'
import { Avatar } from '../../ui/Avatar'
import { colorePriorita, quantoFa, Stelle } from '../../ui/formatoHelpdesk'
import { StatoVuoto } from '../../ui/StatoVuoto'
import { Testata } from '../../ui/Testata'
import { raggio, spazio, useColori } from '../../ui/tema'
import { useApp } from '../../voip/Contesto'

type Scheda = { filtro: Filtro; nome: string; numero?: number; collega?: number }

/** Il nome dei colleghi sulle pillole: il primo nome, intero solo se due si chiamano uguale. */
function nomiBrevi(colleghi: Conteggi['colleghi']): Map<number, string> {
  const primo = (n: string) => n.trim().split(/\s+/)[0] || n
  const quanti = new Map<string, number>()
  colleghi.forEach((c) => quanti.set(primo(c.nome), (quanti.get(primo(c.nome)) || 0) + 1))
  return new Map(colleghi.map((c) => [c.id, (quanti.get(primo(c.nome)) || 0) > 1 ? c.nome : primo(c.nome)]))
}

/** Le date tornano stringhe dalla copia salvata sul telefono. */
function rileggi(l: Ticket[] | null): Ticket[] | null {
  return l
    ? l.map((x) => ({ ...x, creato: x.creato ? new Date(x.creato) : null, aggiornato: x.aggiornato ? new Date(x.aggiornato) : null }))
    : null
}

export default function SchermataHelpdesk() {
  const c = useColori()
  const router = useRouter()
  const { sessione } = useApp()
  const server = sessione?.server || ''
  const uid = sessione?.utente.uid || 0
  const [filtro, setFiltro] = useState<Filtro>('miei')
  const [testo, setTesto] = useState('')
  const [lista, setLista] = useState<Ticket[] | null>(() => rileggi(leggi<Ticket[]>(server, uid, 'helpdesk-miei')))
  const [numeri, setNumeri] = useState<Conteggi | null>(() => leggi<Conteggi>(server, uid, 'helpdesk-conteggi'))
  // Il collega scelto resta tra le schede anche quando non ha piu' ticket aperti.
  const [scelto, setScelto] = useState<{ id: number; nome: string } | null>(null)
  const [errore, setErrore] = useState('')
  const [ricarica, setRicarica] = useState(false)
  const richiesta = useRef(0)

  const aggiorna = useCallback(async () => {
    if (!server) {
      return
    }
    const n = ++richiesta.current
    try {
      const [r, conti] = await Promise.all([tickets(server, uid, filtro, testo), testo ? Promise.resolve(null) : conteggi(server, uid)])
      if (n !== richiesta.current) {
        return
      }
      setLista(r)
      if (conti) {
        setNumeri(conti)
        scrivi(server, uid, 'helpdesk-conteggi', conti)
      }
      if (!testo) {
        scrivi(server, uid, `helpdesk-${filtro}`, r)
      }
      setErrore('')
    } catch (e) {
      if (n === richiesta.current) {
        setErrore(e instanceof Error ? e.message : String(e))
      }
    }
  }, [server, uid, filtro, testo])

  useFocusEffect(
    useCallback(() => {
      void aggiorna()
    }, [aggiorna]),
  )

  // Cambiando scheda si mostra subito la copia salvata, poi quella di Odoo.
  function cambia(f: Filtro, collega: { id: number; nome: string } | null) {
    if (f === filtro) {
      return
    }
    setFiltro(f)
    setScelto(collega)
    setLista(rileggi(leggi<Ticket[]>(server, uid, `helpdesk-${f}`)))
  }

  // Miei, un collega per pillola (dal piu' carico), Da assegnare, Aperti, Chiusi.
  const colleghi = numeri?.colleghi || []
  const brevi = nomiBrevi(colleghi)
  const schede: Scheda[] = [
    { filtro: 'miei', nome: t('helpdesk.filtro.miei'), numero: numeri?.miei },
    ...colleghi.map((x) => ({ filtro: `u${x.id}` as Filtro, nome: brevi.get(x.id) || x.nome, numero: x.ticket, collega: x.id })),
    ...(scelto && !colleghi.some((x) => x.id === scelto.id)
      ? [{ filtro: `u${scelto.id}` as Filtro, nome: scelto.nome, numero: 0, collega: scelto.id }]
      : []),
    { filtro: 'liberi', nome: t('helpdesk.filtro.liberi'), numero: numeri?.liberi },
    { filtro: 'aperti', nome: t('helpdesk.filtro.aperti'), numero: numeri?.aperti },
    { filtro: 'chiusi', nome: t('helpdesk.filtro.chiusi') },
  ]

  // La ricerca parte quando si smette di scrivere.
  const [cercato, setCercato] = useState('')
  useEffect(() => {
    const x = setTimeout(() => setTesto(cercato), 350)
    return () => clearTimeout(x)
  }, [cercato])

  async function tiraGiu() {
    setRicarica(true)
    await aggiorna()
    setRicarica(false)
  }

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top']}>
      <Testata
        titolo={t('helpdesk.titolo')}
        sottotitolo={lista ? tn('helpdesk.conta', lista.length) : undefined}
        destra={
          <Pressable
            onPress={() => router.push('/helpdesk/nuovo')}
            hitSlop={10}
            style={({ pressed }) => [s.tasto, { backgroundColor: pressed ? c.primarioTenue : 'transparent' }]}
            accessibilityRole="button"
            accessibilityLabel={t('helpdesk.nuovo')}
          >
            <Ionicons name="add-circle" size={30} color={c.primario} />
          </Pressable>
        }
      />

      <View style={[s.cerca, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
        <Ionicons name="search" size={18} color={c.testo3} />
        <TextInput
          value={cercato}
          onChangeText={setCercato}
          placeholder={t('helpdesk.cerca')}
          placeholderTextColor={c.testo3}
          style={[s.campo, { color: c.testo }]}
          returnKeyType="search"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.schede}>
          {schede.map(({ filtro: f, nome, numero: n, collega }) => {
            const attivo = f === filtro
            return (
              <Pressable
                key={f}
                onPress={() => cambia(f, collega ? { id: collega, nome } : null)}
                style={[s.scheda, collega ? s.schedaCollega : null, { backgroundColor: attivo ? c.primario : c.superficie, borderColor: attivo ? c.primario : c.bordo }]}
                accessibilityRole="tab"
                accessibilityState={{ selected: attivo }}
                accessibilityLabel={n !== undefined ? `${nome}, ${n}` : nome}
              >
                {collega ? <Avatar nome={nome} lato={24} url={urlAvatar(server, 'res.users', collega)} /> : null}
                <Text style={[s.schedaTesto, { color: attivo ? '#FFFFFF' : c.testo }]} numberOfLines={1}>
                  {nome}
                </Text>
                {n !== undefined ? (
                  <View style={[s.conta, { backgroundColor: attivo ? 'rgba(255,255,255,0.25)' : c.superficie2 }]}>
                    <Text style={[s.contaTesto, { color: attivo ? '#FFFFFF' : c.testo2 }]}>{n}</Text>
                  </View>
                ) : null}
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      {errore && !lista ? (
        <Text style={[s.errore, { color: c.rosso }]}>{errore}</Text>
      ) : !lista ? (
        <Caricamento style={{ marginTop: spazio.xxl }} />
      ) : (
        <FlatList
          data={lista}
          keyExtractor={(x) => String(x.id)}
          contentContainerStyle={{ paddingBottom: spazio.xxl, paddingTop: spazio.xs }}
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl refreshing={ricarica} onRefresh={tiraGiu} tintColor={c.primario} />}
          ListEmptyComponent={<StatoVuoto icona="file-tray-outline" titolo={t('helpdesk.vuoto')} testo={t('helpdesk.vuotoTesto')} />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/helpdesk/[id]', params: { id: String(item.id) } })}
              style={({ pressed }) => [s.riga, { backgroundColor: pressed ? c.superficie2 : c.superficie, borderColor: c.bordo }]}
              accessibilityRole="button"
            >
              <View style={s.rigaTesta}>
                {item.numero ? <Text style={[s.numero, { color: c.primario }]}>{item.numero}</Text> : null}
                <Stelle valore={item.priorita} dimensione={12} colore={colorePriorita(item.priorita, c)} />
                <View style={{ flex: 1 }} />
                <Text style={[s.quando, { color: c.testo3 }]}>{quantoFa(item.creato)}</Text>
              </View>
              <Text style={[s.titolo, { color: c.testo }]} numberOfLines={2}>
                {item.titolo}
              </Text>
              <View style={s.rigaPiede}>
                <Text style={[s.cliente, { color: c.testo2 }]} numberOfLines={1}>
                  {item.cliente || t('helpdesk.nessunCliente')}
                </Text>
                {item.fase ? (
                  <View style={[s.fase, { backgroundColor: c.primarioTenue }]}>
                    <Text style={[s.faseTesto, { color: c.primario }]} numberOfLines={1}>
                      {item.fase}
                    </Text>
                  </View>
                ) : null}
                {item.assegnato ? (
                  <Avatar nome={item.assegnato[1]} lato={24} url={urlAvatar(server, 'res.users', item.assegnato[0])} />
                ) : (
                  <View style={[s.libero, { borderColor: c.testo3 }]}>
                    <Ionicons name="person-outline" size={12} color={c.testo3} />
                  </View>
                )}
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
  tasto: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  cerca: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, marginHorizontal: spazio.l, marginTop: spazio.xs, paddingHorizontal: spazio.m, borderRadius: raggio.m, borderWidth: StyleSheet.hairlineWidth },
  campo: { flex: 1, fontSize: 16, paddingVertical: 10 },
  schede: { gap: spazio.s, paddingHorizontal: spazio.l, paddingVertical: spazio.m },
  scheda: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  schedaCollega: { paddingLeft: 6 },
  schedaTesto: { fontSize: 15, fontWeight: '600' },
  conta: { minWidth: 22, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  contaTesto: { fontSize: 12, fontWeight: '700' },
  errore: { fontSize: 15, textAlign: 'center', marginTop: spazio.xl, paddingHorizontal: spazio.xl },
  riga: { marginHorizontal: spazio.l, marginBottom: spazio.s, padding: spazio.m, borderRadius: raggio.l, borderWidth: StyleSheet.hairlineWidth, gap: 6 },
  rigaTesta: { flexDirection: 'row', alignItems: 'center', gap: spazio.s },
  numero: { fontSize: 13, fontWeight: '700' },
  quando: { fontSize: 12 },
  titolo: { fontSize: 16, fontWeight: '600', lineHeight: 21 },
  rigaPiede: { flexDirection: 'row', alignItems: 'center', gap: spazio.s },
  cliente: { flex: 1, fontSize: 14 },
  fase: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, maxWidth: 130 },
  faseTesto: { fontSize: 12, fontWeight: '700' },
  libero: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
})
