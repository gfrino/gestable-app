/**
 * Le mie spese di Odoo, divise per stato. Dal menu si arriva con lo scanner gia'
 * aperto (?scansiona=1): lo scontrino diventa subito una spesa da completare.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActionSheetIOS, Alert, Image, Platform, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { scansionaScontrino, scegliFotoScontrino } from '../../../modules/gestable-nativo'
import { t, tn } from '../../i18n'
import { leggi, scrivi } from '../../odoo/archivio'
import { mieSpese, spesaDaScontrino, urlRicevuta, type Spesa, type StatoSpesa } from '../../odoo/spese'
import { Caricamento } from '../../ui/Caricamento'
import { Pulsante } from '../../ui/Pulsante'
import { Testata } from '../../ui/Testata'
import { coloreStato, giorno, importo } from '../../ui/formatoSpese'
import { raggio, spazio, useColori } from '../../ui/tema'
import { useApp } from '../../voip/Contesto'

const ORDINE: StatoSpesa[] = ['bozza', 'inviata', 'approvata', 'pagata', 'rifiutata']

export default function SchermataSpese() {
  const c = useColori()
  const router = useRouter()
  const { scansiona } = useLocalSearchParams<{ scansiona?: string }>()
  const { sessione } = useApp()
  const server = sessione?.server || ''
  const uid = sessione?.utente.uid || 0
  const [lista, setLista] = useState<Spesa[] | null>(() => leggi<Spesa[]>(server, uid, 'spese'))
  const [errore, setErrore] = useState('')
  const [ricarica, setRicarica] = useState(false)
  const [carica, setCarica] = useState(false)
  const aperto = useRef(false)
  const attesa = useRef<ReturnType<typeof setTimeout> | null>(null)

  const aggiorna = useCallback(async () => {
    if (!server) {
      return
    }
    try {
      const r = await mieSpese(server, uid)
      setLista(r)
      scrivi(server, uid, 'spese', r)
      setErrore('')
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e))
    }
  }, [server, uid])

  useFocusEffect(
    useCallback(() => {
      void aggiorna()
    }, [aggiorna]),
  )

  const nuova = useCallback(
    async (fonte: 'scanner' | 'galleria') => {
      let pagine: string[] = []
      try {
        pagine = fonte === 'scanner' ? await scansionaScontrino() : await scegliFotoScontrino()
      } catch (e) {
        Alert.alert(t('spese.scannerErrore'), e instanceof Error ? e.message : String(e))
        return
      }
      if (!pagine.length) {
        return
      }
      setCarica(true)
      try {
        const id = await spesaDaScontrino(server, pagine)
        setCarica(false)
        router.push({ pathname: '/spese/[id]', params: { id: String(id), nuova: '1' } })
      } catch (e) {
        setCarica(false)
        Alert.alert(t('spese.nonSalvata'), e instanceof Error ? e.message : String(e))
      }
    },
    [server, router],
  )

  // Dal menu: lo scanner si apre subito, una volta sola. Si aspetta che il menu
  // (una finestra sopra l'app) sia chiuso del tutto: iOS non mostra lo scanner
  // sopra una finestra che si sta chiudendo.
  useEffect(() => {
    if (scansiona !== '1' || aperto.current) {
      return
    }
    aperto.current = true
    // Il timer non dipende da questo effetto: togliere il parametro lo farebbe ripartire.
    attesa.current = setTimeout(() => void nuova('scanner'), 600)
    router.setParams({ scansiona: undefined })
  }, [scansiona, nuova, router])

  useEffect(
    () => () => {
      if (attesa.current) {
        clearTimeout(attesa.current)
      }
    },
    [],
  )

  function scegli() {
    const voci = [t('spese.scansiona'), t('spese.galleria'), t('comune.annulla')]
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: voci, cancelButtonIndex: 2 }, (i) => {
        if (i === 0) {
          void nuova('scanner')
        } else if (i === 1) {
          void nuova('galleria')
        }
      })
    } else {
      void nuova('scanner')
    }
  }

  async function tiraGiu() {
    setRicarica(true)
    await aggiorna()
    setRicarica(false)
  }

  const sezioni = ORDINE.map((stato) => ({ stato, data: (lista || []).filter((x) => x.stato === stato) })).filter((x) => x.data.length)

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top']}>
      <Testata
        titolo={t('spese.titolo')}
        sottotitolo={lista ? tn('spese.conta', lista.length) : undefined}
        destra={
          <Pressable
            onPress={scegli}
            hitSlop={10}
            style={({ pressed }) => [s.tasto, { backgroundColor: pressed ? c.primarioTenue : 'transparent' }]}
            accessibilityRole="button"
            accessibilityLabel={t('spese.nuovaSpesa')}
          >
            <Ionicons name="scan" size={26} color={c.primario} />
          </Pressable>
        }
      />
      {errore && !lista ? (
        <Text style={[s.vuoto, { color: c.rosso }]}>{errore}</Text>
      ) : !lista ? (
        <Caricamento style={{ marginTop: spazio.xxl }} />
      ) : (
        <SectionList
          sections={sezioni}
          keyExtractor={(x) => String(x.id)}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: spazio.xxl }}
          refreshControl={<RefreshControl refreshing={ricarica} onRefresh={tiraGiu} tintColor={c.primario} />}
          ListEmptyComponent={
            <View style={s.vuotoBlocco}>
              <Ionicons name="receipt-outline" size={56} color={c.primario} />
              <Text style={[s.vuoto, { color: c.testo2, marginTop: spazio.s }]}>{t('spese.vuoto')}</Text>
              <View style={{ alignSelf: 'stretch', marginTop: spazio.l }}>
                <Pulsante testo={t('spese.scansiona')} onPress={() => void nuova('scanner')} />
                <Pulsante testo={t('spese.galleria')} onPress={() => void nuova('galleria')} variante="tenue" />
              </View>
            </View>
          }
          renderSectionHeader={({ section }) => (
            <View style={s.sezione}>
              <View style={[s.punto, { backgroundColor: coloreStato(section.stato, c) }]} />
              <Text style={[s.sezioneTitolo, { color: c.testo }]}>{t(`spese.stato.${section.stato}`)}</Text>
              <Text style={[s.sezioneNumero, { color: c.testo3 }]}>{section.data.length}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/spese/[id]', params: { id: String(item.id) } })}
              style={({ pressed }) => [s.scheda, { backgroundColor: pressed ? c.superficie2 : c.superficie, borderColor: c.bordo }]}
              accessibilityRole="button"
            >
              {item.ricevutaId ? (
                <Image source={{ uri: urlRicevuta(server, item.ricevutaId, 160) }} style={[s.mini, { backgroundColor: c.superficie2 }]} />
              ) : (
                <View style={[s.mini, s.miniVuota, { backgroundColor: c.primarioTenue }]}>
                  <Ionicons name="receipt-outline" size={22} color={c.primario} />
                </View>
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[s.titolo, { color: c.testo }]} numberOfLines={1}>
                  {item.nome || t('spese.nuovaSpesa')}
                </Text>
                <Text style={[s.dettaglio, { color: c.testo2 }]} numberOfLines={1}>
                  {[giorno(item.data), item.categoria].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Text style={[s.importo, { color: c.testo }]} numberOfLines={1}>
                {importo(item.importo, item.valuta)}
              </Text>
            </Pressable>
          )}
        />
      )}

      {/* Velo dentro la schermata, non un Modal: un Modal chiuso mentre si apre la
          schermata dopo restava sopra, invisibile, e bloccava i tocchi. */}
      {carica ? (
        <View style={[StyleSheet.absoluteFill, s.velo]}>
          <View style={[s.attesa, { backgroundColor: c.superficie }]}>
            <Caricamento dimensione={56} />
            <Text style={[s.attesaTesto, { color: c.testo }]}>{t('spese.caricaScontrino')}</Text>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1 },
  tasto: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sezione: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, paddingHorizontal: spazio.l, paddingTop: spazio.l, paddingBottom: spazio.s },
  punto: { width: 9, height: 9, borderRadius: 5 },
  sezioneTitolo: { fontSize: 15, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  sezioneNumero: { fontSize: 14, fontWeight: '600' },
  scheda: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spazio.m,
    marginHorizontal: spazio.l,
    marginBottom: spazio.s,
    padding: spazio.m,
    borderRadius: raggio.l,
    borderWidth: StyleSheet.hairlineWidth,
  },
  mini: { width: 48, height: 48, borderRadius: raggio.m },
  miniVuota: { alignItems: 'center', justifyContent: 'center' },
  titolo: { fontSize: 16, fontWeight: '600' },
  dettaglio: { fontSize: 13 },
  importo: { fontSize: 16, fontWeight: '700' },
  vuoto: { fontSize: 15, textAlign: 'center', marginTop: spazio.xl, paddingHorizontal: spazio.xl },
  vuotoBlocco: { alignItems: 'center', marginTop: spazio.xxl * 2, paddingHorizontal: spazio.xl },
  velo: { backgroundColor: 'rgba(5,6,12,0.45)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  attesa: { paddingVertical: spazio.xl, paddingHorizontal: spazio.xxl, borderRadius: raggio.l, alignItems: 'center', gap: spazio.m },
  attesaTesto: { fontSize: 16, fontWeight: '600' },
})
