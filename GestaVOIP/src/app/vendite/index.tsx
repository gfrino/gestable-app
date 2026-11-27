/**
 * Vendite: i preventivi e gli ordini, come le viste di Odoo (I miei
 * preventivi, Preventivi, Ordini, Da fatturare) con il numero accanto,
 * la ricerca e il + per un preventivo nuovo.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { t, tn } from '../../i18n'
import { leggi, scrivi } from '../../odoo/archivio'
import { conteggi, ordini, type Filtro, type Ordine } from '../../odoo/vendite'
import { Caricamento } from '../../ui/Caricamento'
import { data } from '../../ui/formatoCrm'
import { coloreStato, importo, testoFatturazione, testoStato } from '../../ui/formatoVendite'
import { Pulsante } from '../../ui/Pulsante'
import { StatoVuoto } from '../../ui/StatoVuoto'
import { Testata } from '../../ui/Testata'
import { raggio, spazio, useColori } from '../../ui/tema'
import { useApp } from '../../voip/Contesto'

const FILTRI: Filtro[] = ['miei', 'preventivi', 'ordini', 'fatturare']

export default function SchermataVendite() {
  const c = useColori()
  const router = useRouter()
  const { sessione } = useApp()
  const server = sessione?.server || ''
  const uid = sessione?.utente.uid || 0
  const [filtro, setFiltro] = useState<Filtro>('miei')
  const [testo, setTesto] = useState('')
  const [cercato, setCercato] = useState('')
  const [lista, setLista] = useState<Ordine[] | null>(() => leggi<Ordine[]>(server, uid, 'vendite-miei'))
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
      const [r, conti] = await Promise.all([ordini(server, uid, filtro, testo), testo ? Promise.resolve(null) : conteggi(server, uid)])
      if (n !== richiesta.current) {
        return
      }
      setLista(r)
      if (conti) {
        setNumeri(conti)
      }
      if (!testo) {
        scrivi(server, uid, `vendite-${filtro}`, r)
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

  // La ricerca parte quando si smette di scrivere.
  useEffect(() => {
    const x = setTimeout(() => setTesto(cercato), 350)
    return () => clearTimeout(x)
  }, [cercato])

  function cambia(f: Filtro) {
    if (f === filtro) {
      return
    }
    setFiltro(f)
    setLista(leggi<Ordine[]>(server, uid, `vendite-${f}`))
  }

  async function tiraGiu() {
    setRicarica(true)
    await aggiorna()
    setRicarica(false)
  }

  const nuovo = () => router.push('/vendite/nuovo')
  const valuta = lista?.find((o) => o.valuta)?.valuta || ''
  const unaValuta = !!lista && lista.every((o) => !o.valuta || o.valuta === valuta)
  const totale = (lista || []).reduce((x, o) => x + o.totale, 0)

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top']}>
      <Testata
        titolo={t('vendite.titolo')}
        sottotitolo={lista ? [tn('vendite.conta', lista.length), totale && unaValuta ? importo(totale, valuta) : ''].filter(Boolean).join(' · ') : undefined}
        destra={
          <Pressable
            onPress={nuovo}
            hitSlop={10}
            style={({ pressed }) => [s.tasto, { backgroundColor: pressed ? c.primarioTenue : 'transparent' }]}
            accessibilityRole="button"
            accessibilityLabel={t('vendite.nuovo')}
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
          placeholder={t('vendite.cerca')}
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
                  {t(`vendite.filtro.${f}`)}
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
          contentContainerStyle={{ paddingBottom: spazio.xxl }}
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl refreshing={ricarica} onRefresh={tiraGiu} tintColor={c.primario} />}
          ListEmptyComponent={
            testo ? (
              <StatoVuoto icona="search" titolo={t('vendite.nessunRisultato')} />
            ) : (
              <StatoVuoto icona="document-text-outline" titolo={t(`vendite.vuoto.${filtro}`)} testo={filtro === 'miei' || filtro === 'preventivi' ? t('vendite.vuotoTesto') : undefined}>
                {filtro === 'miei' || filtro === 'preventivi' ? <Pulsante testo={t('vendite.nuovo')} onPress={nuovo} /> : null}
              </StatoVuoto>
            )
          }
          renderItem={({ item }) => {
            const colore = coloreStato(item.stato, c)
            const fatt = item.stato === 'sale' ? testoFatturazione(item.fatturazione) : ''
            return (
              <Pressable
                onPress={() => router.push({ pathname: '/vendite/[id]', params: { id: String(item.id) } })}
                style={({ pressed }) => [s.riga, { backgroundColor: pressed ? c.superficie2 : c.superficie, borderColor: c.bordo }]}
                accessibilityRole="button"
              >
                <View style={s.rigaTesta}>
                  <Text style={[s.cliente, { color: c.testo }]} numberOfLines={1}>
                    {item.cliente || '—'}
                  </Text>
                  <Text style={[s.importo, { color: c.testo }]} numberOfLines={1}>
                    {importo(item.totale, item.valuta)}
                  </Text>
                </View>
                <Text style={[s.numero, { color: c.testo2 }]} numberOfLines={1}>
                  {[item.nome, item.riferimento, data(item.data)].filter(Boolean).join(' · ')}
                </Text>
                <View style={s.rigaPiede}>
                  <View style={[s.pillola, { backgroundColor: colore.sfondo }]}>
                    <Text style={[s.pillolaTesto, { color: colore.testo }]} numberOfLines={1}>
                      {testoStato(item.stato)}
                    </Text>
                  </View>
                  {fatt ? (
                    <View style={[s.pillola, { backgroundColor: item.fatturazione === 'to invoice' ? c.ambraTenue : c.superficie2 }]}>
                      <Text style={[s.pillolaTesto, { color: item.fatturazione === 'to invoice' ? c.ambra : c.testo2 }]} numberOfLines={1}>
                        {fatt}
                      </Text>
                    </View>
                  ) : null}
                  <View style={{ flex: 1 }} />
                  {item.venditore && item.venditore[0] !== uid ? (
                    <Text style={[s.venditore, { color: c.testo3 }]} numberOfLines={1}>
                      {item.venditore[1]}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            )
          }}
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
  riga: { marginHorizontal: spazio.l, marginBottom: spazio.s, padding: spazio.m, borderRadius: raggio.l, borderWidth: StyleSheet.hairlineWidth, gap: 4 },
  rigaTesta: { flexDirection: 'row', alignItems: 'center', gap: spazio.s },
  cliente: { flex: 1, fontSize: 16, fontWeight: '700' },
  importo: { fontSize: 16, fontWeight: '700' },
  numero: { fontSize: 14 },
  rigaPiede: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, marginTop: 2 },
  pillola: { paddingHorizontal: 8, height: 22, borderRadius: 11, justifyContent: 'center' },
  pillolaTesto: { fontSize: 12, fontWeight: '700' },
  venditore: { fontSize: 12, fontWeight: '600', maxWidth: 140 },
})
