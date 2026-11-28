/**
 * Fatturazione: le fatture come le viste di Odoo (Da incassare, Scadute,
 * Bozze, Fornitori da pagare, Tutte) con il numero accanto, la ricerca e in
 * alto quanto c'e' da incassare e quanto e' scaduto. L'ultimo filtro scelto
 * resta, e l'ultima copia di ogni elenco si mostra subito all'apertura.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { t, tn } from '../../i18n'
import { leggi, scrivi } from '../../odoo/archivio'
import { conteggi, fatture, FILTRI, riepilogo, type Fattura, type Filtro, type Riepilogo } from '../../odoo/fatturazione'
import { Caricamento } from '../../ui/Caricamento'
import { data } from '../../ui/formatoCrm'
import { coloreStato, importo, testoStato } from '../../ui/formatoFatturazione'
import { StatoVuoto } from '../../ui/StatoVuoto'
import { Testata } from '../../ui/Testata'
import { raggio, spazio, useColori } from '../../ui/tema'
import { useApp } from '../../voip/Contesto'

const CHIAVE_FILTRO = 'fatturazione-filtro'

export default function SchermataFatturazione() {
  const c = useColori()
  const router = useRouter()
  const { sessione } = useApp()
  const server = sessione?.server || ''
  const uid = sessione?.utente.uid || 0
  // L'ultimo filtro scelto, per questo utente su questo server.
  const [filtro, setFiltro] = useState<Filtro>(() => {
    const f = leggi<Filtro>(server, uid, CHIAVE_FILTRO)
    return f && FILTRI.includes(f) ? f : 'incassare'
  })
  const [testo, setTesto] = useState('')
  const [cercato, setCercato] = useState('')
  const [lista, setLista] = useState<Fattura[] | null>(() => leggi<Fattura[]>(server, uid, `fatturazione-${filtro}`))
  const [numeri, setNumeri] = useState<Partial<Record<Filtro, number>>>({})
  const [somme, setSomme] = useState<Riepilogo | null>(() => leggi<Riepilogo>(server, uid, 'fatturazione-riepilogo'))
  const [errore, setErrore] = useState('')
  const [ricarica, setRicarica] = useState(false)
  const richiesta = useRef(0)

  const aggiorna = useCallback(async () => {
    if (!server) {
      return
    }
    const n = ++richiesta.current
    try {
      const [r, conti, tot] = await Promise.all([
        fatture(server, filtro, testo),
        testo ? Promise.resolve(null) : conteggi(server),
        testo ? Promise.resolve(undefined) : riepilogo(server).catch(() => null),
      ])
      if (n !== richiesta.current) {
        return
      }
      setLista(r)
      if (conti) {
        setNumeri(conti)
      }
      if (tot !== undefined) {
        setSomme(tot)
        scrivi(server, uid, 'fatturazione-riepilogo', tot)
      }
      if (!testo) {
        scrivi(server, uid, `fatturazione-${filtro}`, r)
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
    setLista(leggi<Fattura[]>(server, uid, `fatturazione-${f}`))
    scrivi(server, uid, CHIAVE_FILTRO, f)
  }

  async function tiraGiu() {
    setRicarica(true)
    await aggiorna()
    setRicarica(false)
  }

  const valuta = lista?.find((o) => o.valuta)?.valuta || ''
  const unaValuta = !!lista && lista.every((o) => !o.valuta || o.valuta === valuta)
  const daPagare = filtro === 'incassare' || filtro === 'scadute' || filtro === 'fornitori'
  const totale = (lista || []).reduce((x, o) => x + (daPagare ? o.residuo : o.totale), 0)

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top', 'left', 'right']}>
      <Testata
        titolo={t('fatturazione.titolo')}
        sottotitolo={lista ? [tn('fatturazione.conta', lista.length), totale && unaValuta ? importo(totale, valuta) : ''].filter(Boolean).join(' · ') : undefined}
      />

      <View style={[s.cerca, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
        <Ionicons name="search" size={18} color={c.testo3} />
        <TextInput
          value={cercato}
          onChangeText={setCercato}
          placeholder={t('fatturazione.cerca')}
          placeholderTextColor={c.testo3}
          style={[s.campo, { color: c.testo }]}
          returnKeyType="search"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {somme && !cercato ? (
        <View style={s.somme}>
          <Pressable
            onPress={() => cambia('incassare')}
            style={({ pressed }) => [s.somma, { backgroundColor: pressed ? c.superficie2 : c.superficie, borderColor: c.bordo }]}
            accessibilityRole="button"
          >
            <Text style={[s.sommaTitolo, { color: c.testo2 }]} numberOfLines={1}>
              {t('fatturazione.daIncassare')}
            </Text>
            <Text style={[s.sommaValore, { color: c.testo }]} numberOfLines={1} adjustsFontSizeToFit>
              {importo(somme.daIncassare, somme.valuta)}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => cambia('scadute')}
            style={({ pressed }) => [s.somma, { backgroundColor: pressed ? c.superficie2 : c.superficie, borderColor: c.bordo }]}
            accessibilityRole="button"
          >
            <Text style={[s.sommaTitolo, { color: c.testo2 }]} numberOfLines={1}>
              {t('fatturazione.scaduto')}
            </Text>
            <Text style={[s.sommaValore, { color: somme.scaduto > 0 ? c.rosso : c.testo }]} numberOfLines={1} adjustsFontSizeToFit>
              {importo(somme.scaduto, somme.valuta)}
            </Text>
          </Pressable>
        </View>
      ) : null}

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
                  {t(`fatturazione.filtro.${f}`)}
                </Text>
                {n !== undefined && f !== 'tutte' ? (
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
              <StatoVuoto icona="search" titolo={t('fatturazione.nessunRisultato')} />
            ) : (
              <StatoVuoto icona="receipt-outline" titolo={t(`fatturazione.vuoto.${filtro}`)} />
            )
          }
          renderItem={({ item }) => {
            const colore = coloreStato(item.stato, c)
            const parziale = item.stato === 'parziale' && item.residuo > 0
            return (
              <Pressable
                onPress={() => router.push({ pathname: '/fatturazione/[id]', params: { id: String(item.id) } })}
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
                  {[item.nome || t('fatturazione.bozza'), item.riferimento, data(item.data)].filter(Boolean).join(' · ')}
                </Text>
                <View style={s.rigaPiede}>
                  <View style={[s.pillola, { backgroundColor: colore.sfondo }]}>
                    <Text style={[s.pillolaTesto, { color: colore.testo }]} numberOfLines={1}>
                      {testoStato(item.stato)}
                    </Text>
                  </View>
                  {parziale ? (
                    <Text style={[s.piccolo, { color: c.testo2 }]} numberOfLines={1}>
                      {t('fatturazione.restano', { importo: importo(item.residuo, item.valuta) })}
                    </Text>
                  ) : null}
                  <View style={{ flex: 1 }} />
                  {item.scadenza && item.stato !== 'pagata' && item.stato !== 'annullata' && item.stato !== 'stornata' ? (
                    <Text style={[s.scadenza, { color: item.scaduta ? c.rosso : c.testo3 }]} numberOfLines={1}>
                      {t(item.scaduta ? 'fatturazione.scadutaIl' : 'fatturazione.scadeIl', { data: data(item.scadenza) })}
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
  cerca: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, marginHorizontal: spazio.l, marginTop: spazio.xs, paddingHorizontal: spazio.m, borderRadius: raggio.m, borderWidth: StyleSheet.hairlineWidth },
  campo: { flex: 1, fontSize: 16, paddingVertical: 10 },
  somme: { flexDirection: 'row', gap: spazio.s, marginHorizontal: spazio.l, marginTop: spazio.m },
  somma: { flex: 1, padding: spazio.m, borderRadius: raggio.l, borderWidth: StyleSheet.hairlineWidth, gap: 2 },
  sommaTitolo: { fontSize: 13, fontWeight: '700' },
  sommaValore: { fontSize: 18, fontWeight: '800' },
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
  piccolo: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  scadenza: { fontSize: 12, fontWeight: '600', maxWidth: 160 },
})
