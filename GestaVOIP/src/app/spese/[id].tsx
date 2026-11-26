/**
 * Una spesa: lo scontrino in alto, sotto i dati da completare (descrizione,
 * importo, data, categoria, chi l'ha pagata). Da qui si salva, si invia per
 * l'approvazione o si elimina. Inviata, si puo' solo vedere.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import { t } from '../../i18n'
import { categorie as caricaCategorie, eliminaSpesa, inviaSpesa, salvaSpesa, spesa as caricaSpesa, urlFile, urlRicevuta, type Categoria, type Spesa } from '../../odoo/spese'
import { Caricamento } from '../../ui/Caricamento'
import { SceltaGiorno } from '../../ui/calendario/Selettori'
import { Foglio } from '../../ui/Foglio'
import { coloreStato, giorno, importo } from '../../ui/formatoSpese'
import { Pulsante } from '../../ui/Pulsante'
import { Testata } from '../../ui/Testata'
import { raggio, spazio, useColori } from '../../ui/tema'
import { useApp } from '../../voip/Contesto'

function dataIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function numero(testo: string): number {
  const n = parseFloat(testo.replace(/[^\d,.-]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export default function SchedaSpesa() {
  const c = useColori()
  const router = useRouter()
  const { id: idTesto, nuova, letto } = useLocalSearchParams<{ id: string; nuova?: string; letto?: string }>()
  const id = Number(idTesto)
  const { sessione } = useApp()
  const server = sessione?.server || ''

  const [spesa, setSpesa] = useState<Spesa | null>(null)
  const [elenco, setElenco] = useState<Categoria[]>([])
  const [errore, setErrore] = useState('')
  const [nome, setNome] = useState('')
  const [valore, setValore] = useState('')
  const [data, setData] = useState(() => new Date())
  const [categoriaId, setCategoriaId] = useState<number | null>(null)
  const [pagataDa, setPagataDa] = useState<Spesa['pagataDa']>('own_account')
  const [note, setNote] = useState('')
  const [occupato, setOccupato] = useState<'' | 'salva' | 'invia' | 'elimina'>('')
  const [sceltaData, setSceltaData] = useState(false)
  const [sceltaCategoria, setSceltaCategoria] = useState(false)
  const [scontrino, setScontrino] = useState(false)

  const carica = useCallback(async () => {
    try {
      const [sp, cat] = await Promise.all([caricaSpesa(server, id), caricaCategorie(server).catch(() => [] as Categoria[])])
      if (!sp) {
        setErrore(t('spese.nonSalvata'))
        return
      }
      setSpesa(sp)
      setElenco(cat)
      // Odoo 17 chiama la spesa come il file («Scontrino 2026-11-26»): meglio un campo
      // vuoto che chiede una descrizione vera.
      setNome(nuova === '1' && /^Scontrino \d{4}-\d{2}-\d{2}/.test(sp.nome) ? '' : sp.nome)
      const conCosto = (cat.find((x) => x.id === sp.categoriaId)?.costo || 0) > 0
      const v = conCosto ? sp.quantita : sp.importo
      setValore(v ? (conCosto ? String(v) : v.toFixed(2)).replace('.', ',') : '')
      setData(sp.data ? new Date(`${sp.data}T12:00:00`) : new Date())
      setCategoriaId(sp.categoriaId)
      setPagataDa(sp.pagataDa)
      setNote(sp.note)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e))
    }
  }, [server, id, nuova])

  // Una volta sola: tornando sulla schermata non si perde quello che si sta scrivendo.
  const caricata = useRef(false)
  useFocusEffect(
    useCallback(() => {
      if (!caricata.current) {
        caricata.current = true
        void carica()
      }
    }, [carica]),
  )

  const categoria = elenco.find((x) => x.id === categoriaId) || null
  const conCosto = (categoria?.costo || 0) > 0

  async function salva(eInvia: boolean) {
    if (!nome.trim()) {
      Alert.alert(t('spese.spesa'), t('spese.scriviDescrizione'))
      return
    }
    const v = numero(valore)
    if (v <= 0) {
      Alert.alert(t('spese.spesa'), t('spese.scriviImporto'))
      return
    }
    setOccupato(eInvia ? 'invia' : 'salva')
    try {
      await salvaSpesa(server, id, { nome, data: dataIso(data), categoriaId, valore: v, conCosto, pagataDa, note })
      if (eInvia) {
        try {
          await inviaSpesa(server, id)
        } catch (e) {
          Alert.alert(t('spese.nonInviata'), e instanceof Error ? e.message : String(e))
          setOccupato('')
          await carica()
          return
        }
        Alert.alert(t('spese.spesa'), t('spese.inviataOk'))
      }
      router.back()
    } catch (e) {
      Alert.alert(t('spese.nonSalvata'), e instanceof Error ? e.message : String(e))
      setOccupato('')
    }
  }

  function elimina() {
    Alert.alert(t('spese.eliminaDomanda'), t('spese.eliminaTesto'), [
      { text: t('comune.annulla'), style: 'cancel' },
      {
        text: t('comune.elimina'),
        style: 'destructive',
        onPress: async () => {
          setOccupato('elimina')
          try {
            await eliminaSpesa(server, id)
            router.back()
          } catch (e) {
            Alert.alert(t('spese.spesa'), e instanceof Error ? e.message : String(e))
            setOccupato('')
          }
        },
      },
    ])
  }

  const titolo = nuova === '1' ? t('spese.nuovaSpesa') : t('spese.spesa')

  if (!spesa) {
    return (
      <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top']}>
        <Testata titolo={titolo} />
        {errore ? <Text style={[s.errore, { color: c.rosso }]}>{errore}</Text> : <Caricamento style={{ marginTop: spazio.xxl }} />}
      </SafeAreaView>
    )
  }

  const campo = [s.campo, { backgroundColor: c.superficie, borderColor: c.bordo, color: c.testo }]
  const etichetta = (testo: string) => <Text style={[s.etichetta, { color: c.testo2 }]}>{testo}</Text>
  const colore = coloreStato(spesa.stato, c)

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top', 'bottom']}>
      <Testata titolo={titolo} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.contenuto} keyboardShouldPersistTaps="handled">
          {spesa.ricevutaId && spesa.ricevutaPdf ? (
            <Pressable
              onPress={() => setScontrino(true)}
              style={({ pressed }) => [s.ricevuta, s.ricevutaVuota, { backgroundColor: pressed ? c.superficie2 : c.superficie, borderColor: c.bordo, borderWidth: StyleSheet.hairlineWidth }]}
              accessibilityRole="button"
              accessibilityLabel={t('spese.scontrinoPdf')}
            >
              <View style={[s.pdfIcona, { backgroundColor: c.rossoTenue }]}>
                <Ionicons name="document-text" size={34} color={c.rosso} />
              </View>
              <Text style={[s.pdfTitolo, { color: c.testo }]}>{t('spese.scontrinoPdf')}</Text>
              <Text style={{ color: c.testo2 }}>{t('spese.toccaPerAprire')}</Text>
            </Pressable>
          ) : spesa.ricevutaId ? (
            <Pressable onPress={() => setScontrino(true)} accessibilityRole="imagebutton" accessibilityLabel={t('spese.scontrino')}>
              <Image source={{ uri: urlRicevuta(server, spesa.ricevutaId) }} style={[s.ricevuta, { backgroundColor: c.superficie2 }]} resizeMode="cover" />
            </Pressable>
          ) : (
            <View style={[s.ricevuta, s.ricevutaVuota, { backgroundColor: c.superficie2 }]}>
              <Ionicons name="receipt-outline" size={36} color={c.testo3} />
              <Text style={{ color: c.testo3 }}>{t('spese.senzaScontrino')}</Text>
            </View>
          )}

          <View style={[s.chip, { backgroundColor: `${colore}22` }]}>
            <View style={[s.punto, { backgroundColor: colore }]} />
            <Text style={[s.chipTesto, { color: colore }]}>{t(`spese.chip.${spesa.stato}`)}</Text>
          </View>

          {letto && spesa.modificabile ? (
            <View style={[s.letto, { backgroundColor: c.primarioTenue }]}>
              <Ionicons name="sparkles" size={18} color={c.primario} />
              <Text style={[s.lettoTesto, { color: c.testo }]}>{letto === 'ai' ? t('spese.lettoAI') : t('spese.lettoRegole')}</Text>
            </View>
          ) : null}

          {!spesa.modificabile ? (
            <View style={[s.riepilogo, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
              <Text style={[s.grande, { color: c.testo }]}>{importo(spesa.importo, spesa.valuta)}</Text>
              <Text style={[s.rigaTesto, { color: c.testo }]}>{spesa.nome}</Text>
              <Text style={[s.rigaSotto, { color: c.testo2 }]}>{[giorno(spesa.data), spesa.categoria].filter(Boolean).join(' · ')}</Text>
              <Text style={[s.rigaSotto, { color: c.testo2 }]}>
                {t('spese.pagataDa')}: {spesa.pagataDa === 'own_account' ? t('spese.daMe') : t('spese.daAzienda')}
              </Text>
              {spesa.note ? <Text style={[s.rigaSotto, { color: c.testo2 }]}>{spesa.note}</Text> : null}
              <Text style={[s.nota, { color: c.testo3 }]}>{t('spese.soloLettura')}</Text>
            </View>
          ) : (
            <>
              {etichetta(t('spese.descrizione'))}
              <TextInput
                style={campo}
                value={nome}
                onChangeText={setNome}
                placeholder={t('spese.descrizioneEsempio')}
                placeholderTextColor={c.testo3}
                autoCapitalize="sentences"
                autoFocus={nuova === '1' && !nome}
              />

              {etichetta(conCosto ? t('spese.quantita') : t('spese.importo'))}
              <View style={[s.importoRiga, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
                <TextInput
                  style={[s.importoCampo, { color: c.testo }]}
                  value={valore}
                  onChangeText={setValore}
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                  placeholderTextColor={c.testo3}
                />
                {!conCosto ? <Text style={[s.valuta, { color: c.testo2 }]}>{spesa.valuta}</Text> : null}
              </View>
              {conCosto && categoria ? (
                <Text style={[s.nota, { color: c.testo3 }]}>
                  {t('spese.prezzoUnitario', { prezzo: importo(categoria.costo, spesa.valuta) })} · {importo(categoria.costo * numero(valore), spesa.valuta)}
                </Text>
              ) : null}

              {etichetta(t('spese.data'))}
              <Pressable onPress={() => setSceltaData(true)} style={[campo, s.scelta]} accessibilityRole="button">
                <Text style={[s.sceltaTesto, { color: c.testo }]}>{giorno(dataIso(data))}</Text>
                <Ionicons name="calendar-outline" size={20} color={c.testo3} />
              </Pressable>

              {etichetta(t('spese.categoria'))}
              <Pressable onPress={() => setSceltaCategoria(true)} style={[campo, s.scelta]} accessibilityRole="button">
                <Text style={[s.sceltaTesto, { color: categoria ? c.testo : c.testo3 }]} numberOfLines={1}>
                  {categoria?.nome || t('spese.scegliCategoria')}
                </Text>
                <Ionicons name="chevron-forward" size={20} color={c.testo3} />
              </Pressable>

              {etichetta(t('spese.pagataDa'))}
              <View style={[s.segmenti, { backgroundColor: c.superficie }]}>
                {(['own_account', 'company_account'] as const).map((v) => {
                  const attivo = v === pagataDa
                  return (
                    <Pressable
                      key={v}
                      onPress={() => setPagataDa(v)}
                      style={[s.segmento, attivo && { backgroundColor: c.primarioTenue }]}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: attivo }}
                    >
                      <Text style={[s.segmentoTesto, { color: attivo ? c.primario : c.testo2 }]} numberOfLines={1}>
                        {v === 'own_account' ? t('spese.daMe') : t('spese.daAzienda')}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
              <Text style={[s.nota, { color: c.testo3 }]}>{pagataDa === 'own_account' ? t('spese.daMeNota') : t('spese.daAziendaNota')}</Text>

              {etichetta(t('spese.note'))}
              <TextInput style={[campo, s.areaNote]} value={note} onChangeText={setNote} multiline autoCapitalize="sentences" />

              <View style={{ height: spazio.s }} />
              <Pulsante testo={t('spese.invia')} onPress={() => void salva(true)} occupato={occupato === 'invia'} />
              <Pulsante testo={t('comune.salva')} onPress={() => void salva(false)} occupato={occupato === 'salva'} variante="tenue" />
              <Pulsante testo={t('comune.elimina')} onPress={elimina} occupato={occupato === 'elimina'} variante="pericolo" />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <SceltaGiorno
        aperto={sceltaData}
        titolo={t('spese.data')}
        valore={data}
        chiudi={() => setSceltaData(false)}
        scegli={(d) => {
          setData(d)
          setSceltaData(false)
        }}
      />

      <Foglio aperto={sceltaCategoria} titolo={t('spese.categoria')} chiudi={() => setSceltaCategoria(false)} fatto={t('comune.chiudi')}>
        <ScrollView contentContainerStyle={{ paddingVertical: spazio.s }}>
          {elenco.length ? (
            elenco.map((x) => (
              <Pressable
                key={x.id}
                onPress={() => {
                  setCategoriaId(x.id)
                  setSceltaCategoria(false)
                }}
                style={({ pressed }) => [s.voce, { backgroundColor: pressed ? c.superficie2 : 'transparent' }]}
                accessibilityRole="button"
              >
                <Text style={[s.voceTesto, { color: c.testo }]} numberOfLines={1}>
                  {x.nome}
                </Text>
                {x.id === categoriaId ? <Ionicons name="checkmark" size={22} color={c.primario} /> : null}
              </Pressable>
            ))
          ) : (
            <Text style={[s.errore, { color: c.testo2 }]}>{t('spese.nessunaCategoria')}</Text>
          )}
        </ScrollView>
      </Foglio>

      {spesa.ricevutaPdf && spesa.ricevutaId ? (
        <Foglio aperto={scontrino} titolo={t('spese.scontrino')} chiudi={() => setScontrino(false)} fatto={t('comune.chiudi')}>
          {/* Il PDF si apre con la sessione di Odoo del telefono (cookie condivisi, come la scheda Odoo). */}
          <WebView
            source={{ uri: urlFile(server, spesa.ricevutaId) }}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            startInLoadingState
            renderLoading={() => <Caricamento style={StyleSheet.absoluteFill} />}
            style={{ flex: 1, backgroundColor: c.sfondo }}
          />
        </Foglio>
      ) : (
        <Modal visible={scontrino} animationType="fade" onRequestClose={() => setScontrino(false)}>
          <Pressable style={s.schermoNero} onPress={() => setScontrino(false)} accessibilityLabel={t('comune.chiudi')}>
            {spesa.ricevutaId ? (
              <Image source={{ uri: urlRicevuta(server, spesa.ricevutaId, 1600) }} style={StyleSheet.absoluteFill} resizeMode="contain" />
            ) : null}
          </Pressable>
        </Modal>
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1 },
  contenuto: { padding: spazio.l, gap: spazio.s, paddingBottom: spazio.xxl },
  errore: { fontSize: 15, textAlign: 'center', marginTop: spazio.xl, paddingHorizontal: spazio.xl },
  ricevuta: { height: 220, borderRadius: raggio.l, overflow: 'hidden' },
  ricevutaVuota: { alignItems: 'center', justifyContent: 'center', gap: spazio.xs },
  pdfIcona: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: spazio.xs },
  pdfTitolo: { fontSize: 17, fontWeight: '700' },
  chip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: raggio.tondo, marginTop: spazio.xs },
  punto: { width: 8, height: 8, borderRadius: 4 },
  chipTesto: { fontSize: 13, fontWeight: '800' },
  riepilogo: { padding: spazio.l, borderRadius: raggio.l, borderWidth: StyleSheet.hairlineWidth, gap: 6 },
  grande: { fontSize: 32, fontWeight: '800' },
  rigaTesto: { fontSize: 17, fontWeight: '600' },
  rigaSotto: { fontSize: 15 },
  etichetta: { fontSize: 13, fontWeight: '600', marginTop: spazio.s },
  campo: { borderWidth: 1, borderRadius: raggio.m, paddingHorizontal: spazio.l, paddingVertical: 12, fontSize: 16 },
  importoRiga: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: raggio.m, paddingHorizontal: spazio.l },
  importoCampo: { flex: 1, fontSize: 28, fontWeight: '700', paddingVertical: 10 },
  valuta: { fontSize: 18, fontWeight: '700' },
  scelta: { flexDirection: 'row', alignItems: 'center', gap: spazio.s },
  sceltaTesto: { flex: 1, fontSize: 16 },
  segmenti: { flexDirection: 'row', padding: 4, borderRadius: raggio.m },
  segmento: { flex: 1, paddingVertical: 10, borderRadius: raggio.s, alignItems: 'center' },
  segmentoTesto: { fontSize: 15, fontWeight: '700' },
  nota: { fontSize: 13 },
  letto: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, padding: spazio.m, borderRadius: raggio.m },
  lettoTesto: { flex: 1, fontSize: 14, lineHeight: 19 },
  areaNote: { minHeight: 80, textAlignVertical: 'top' },
  voce: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, paddingHorizontal: spazio.l, paddingVertical: 14 },
  voceTesto: { flex: 1, fontSize: 17 },
  schermoNero: { flex: 1, backgroundColor: '#000' },
})
