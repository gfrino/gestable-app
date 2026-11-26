/**
 * Helpdesk: i ticket divisi in schede (Miei, Del team, Da assegnare, Aperti,
 * Chiusi) con il numero accanto, ricerca per titolo, cliente o numero, e il +
 * per aprirne uno nuovo.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { t, tn } from '../../i18n'
import { leggi, scrivi } from '../../odoo/archivio'
import { conteggi, tickets, type Filtro, type Ticket } from '../../odoo/helpdesk'
import { urlAvatar } from '../../odoo/lavoro'
import { Caricamento } from '../../ui/Caricamento'
import { Avatar } from '../../ui/Avatar'
import { colorePriorita, quantoFa, Stelle } from '../../ui/formatoHelpdesk'
import { StatoVuoto } from '../../ui/StatoVuoto'
import { Testata } from '../../ui/Testata'
import { raggio, spazio, useColori } from '../../ui/tema'
import { useApp } from '../../voip/Contesto'

const FILTRI: Filtro[] = ['miei', 'team', 'liberi', 'aperti', 'chiusi']

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
  const [numeri, setNumeri] = useState<Partial<Record<Filtro, number>>>({})
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
  function cambia(f: Filtro) {
    if (f === filtro) {
      return
    }
    setFiltro(f)
    setLista(rileggi(leggi<Ticket[]>(server, uid, `helpdesk-${f}`)))
  }

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
          {FILTRI.map((f) => {
            const attivo = f === filtro
            const n = numeri[f]
            return (
              <Pressable
                key={f}
                onPress={() => cambia(f)}
                style={[s.scheda, { backgroundColor: attivo ? c.primario : c.superficie, borderColor: attivo ? c.primario : c.bordo }]}
                accessibilityRole="tab"
                accessibilityState={{ selected: attivo }}
              >
                <Text style={[s.schedaTesto, { color: attivo ? '#FFFFFF' : c.testo }]} numberOfLines={1}>
                  {t(`helpdesk.filtro.${f}`)}
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
