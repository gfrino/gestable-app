/**
 * Richiesta nuova in pochi tocchi: tipo (con i giorni che restano), date o
 * mezza giornata, nota. Odoo conta i giorni mentre si sceglie, come nel
 * browser; gli errori al momento dell'invio sono quelli di Odoo.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { t } from '../../i18n'
import { leggi } from '../../odoo/archivio'
import { anteprima, inviaRichiesta, mezzaPossibile, saldi as caricaSaldi, tipi as caricaTipi, type Saldo, type Scelta, type Tipo } from '../../odoo/ferie'
import { Caricamento } from '../../ui/Caricamento'
import { SceltaGiorno } from '../../ui/calendario/Selettori'
import { durata, giornoIso, periodo } from '../../ui/formatoFerie'
import { Pulsante } from '../../ui/Pulsante'
import { SceltaElenco } from '../../ui/SceltaElenco'
import { Testata } from '../../ui/Testata'
import { raggio, spazio, useColori } from '../../ui/tema'
import { useApp } from '../../voip/Contesto'

/** Fino a tanti tipi si scelgono con un tocco; oltre, da un elenco con la ricerca. */
const POCHI = 5

type Conto = { stato: 'calcolo' } | { stato: 'ok'; giorni: number } | { stato: 'nessuno' }

export default function NuovaRichiesta() {
  const c = useColori()
  const router = useRouter()
  const { sessione } = useApp()
  const server = sessione?.server || ''
  const uid = sessione?.utente.uid || 0
  // I giorni che restano, dall'elenco appena visto: si mostrano accanto ai tipi.
  const [saldiSalvati] = useState<Saldo[]>(() => leggi<{ saldi: Saldo[] }>(server, uid, 'ferie')?.saldi || [])
  const [saldi, setSaldi] = useState<Saldo[]>(saldiSalvati)

  const [tipi, setTipi] = useState<Tipo[] | null>(null)
  const [erroreTipi, setErroreTipi] = useState('')
  const [tipo, setTipo] = useState<Tipo | null>(null)
  const [dal, setDal] = useState(() => new Date())
  const [al, setAl] = useState(() => new Date())
  const [mezzaOk, setMezzaOk] = useState(false)
  const [mezza, setMezza] = useState(false)
  const [parte, setParte] = useState<'am' | 'pm'>('am')
  const [nota, setNota] = useState('')
  const [scegli, setScegli] = useState<'dal' | 'al' | null>(null)
  const [elenco, setElenco] = useState(false)
  const [occupato, setOccupato] = useState(false)

  useEffect(() => {
    if (!server || !uid) {
      return
    }
    // Tipi e saldi insieme: aperta senza passare dall'elenco, la copia salvata dei saldi puo' mancare.
    Promise.all([caricaTipi(server, uid), caricaSaldi(server, uid).catch(() => null)])
      .then(([tutti, nuovi]) => {
        const conSaldi = nuovi || saldiSalvati
        if (nuovi) {
          setSaldi(nuovi)
        }
        // Prima i tipi con giorni assegnati (ferie, recuperi), poi gli altri come li ordina Odoo.
        const conGiorni = (x: Tipo) => (conSaldi.some((y) => y.tipoId === x.id) ? 0 : 1)
        const l = [...tutti].sort((a, b) => conGiorni(a) - conGiorni(b))
        setTipi(l)
        setTipo(l[0] || null)
      })
      .catch((e: unknown) => {
        setTipi([])
        setErroreTipi(e instanceof Error ? e.message : String(e))
      })
    // Una volta all'apertura: i saldi salvati servono solo se Odoo non risponde.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server, uid])

  // Mezza giornata: solo se il tipo la consente, come nel modulo di Odoo.
  useEffect(() => {
    if (!tipo) {
      return
    }
    let vivo = true
    mezzaPossibile(server, uid, tipo)
      .then((ok) => {
        if (vivo) {
          setMezzaOk(ok)
          if (!ok) {
            setMezza(false)
          }
        }
      })
      .catch(() => vivo && setMezzaOk(false))
    return () => {
      vivo = false
    }
  }, [server, uid, tipo])

  const scelta: Scelta | null = tipo
    ? { tipo, dal: giornoIso(dal), al: giornoIso(mezza ? dal : al), mezza: mezza ? parte : null, nota }
    : null
  const chiaveConto = scelta ? `${scelta.tipo.id}|${scelta.dal}|${scelta.al}|${scelta.mezza}` : ''

  // Odoo conta i giorni lavorativi a ogni cambio (calendario di lavoro, festivi).
  // La risposta vale per la scelta da cui e' partita: cambiata la scelta, si ricalcola.
  const [risposta, setRisposta] = useState<{ chiave: string; giorni: number | null } | null>(null)
  const valida = !!scelta && scelta.al >= scelta.dal
  useEffect(() => {
    if (!scelta || scelta.al < scelta.dal) {
      return
    }
    const chiave = chiaveConto
    const attesa = setTimeout(() => {
      anteprima(server, uid, { ...scelta, nota: '' })
        .then((a) => setRisposta({ chiave, giorni: a.giorni }))
        .catch(() => setRisposta({ chiave, giorni: null }))
    }, 250)
    return () => clearTimeout(attesa)
    // La scelta cambia a ogni disegno: conta solo la sua chiave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiaveConto, server, uid])
  const conto: Conto = !valida
    ? { stato: 'nessuno' }
    : risposta?.chiave !== chiaveConto
      ? { stato: 'calcolo' }
      : risposta.giorni === null
        ? { stato: 'nessuno' }
        : { stato: 'ok', giorni: risposta.giorni }

  async function invia() {
    if (!scelta) {
      Alert.alert(t('ferie.nonInviata'), t('ferie.scegliTipo'))
      return
    }
    if (scelta.al < scelta.dal) {
      Alert.alert(t('ferie.nonInviata'), t('ferie.alPrimaDelDal'))
      return
    }
    if (conto.stato === 'ok' && conto.giorni === 0) {
      Alert.alert(t('ferie.nonInviata'), t('ferie.zeroGiorni'))
      return
    }
    setOccupato(true)
    try {
      await inviaRichiesta(server, uid, scelta)
      setOccupato(false)
      Alert.alert(t('ferie.inviata'), t('ferie.inviataTesto'), [{ text: 'OK', onPress: () => router.back() }])
    } catch (e) {
      setOccupato(false)
      Alert.alert(t('ferie.nonInviata'), e instanceof Error ? e.message : String(e))
    }
  }

  function restano(id: number): string {
    const x = saldi.find((y) => y.tipoId === id)
    return x ? t('ferie.restano', { n: durata(x.disponibili, x.ore) }) : ''
  }

  const campo = { color: c.testo, backgroundColor: c.superficie, borderColor: c.bordo }

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top']}>
      <Testata titolo={t('ferie.nuova')} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.contenuto} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          <Text style={[s.etichetta, { color: c.testo2 }]}>{t('ferie.tipo')}</Text>
          {!tipi ? (
            <Caricamento dimensione={48} style={{ marginVertical: spazio.l }} />
          ) : !tipi.length ? (
            <View style={[s.avviso, { backgroundColor: c.ambraTenue }]}>
              <Ionicons name="information-circle" size={22} color={c.ambra} />
              <Text style={[s.avvisoTesto, { color: c.testo }]}>{erroreTipi || t('ferie.nessunTipo')}</Text>
            </View>
          ) : tipi.length > POCHI ? (
            // Tanti tipi (es. le paghe svizzere): una riga che apre l'elenco con la ricerca.
            <Pressable
              onPress={() => setElenco(true)}
              style={[s.gruppo, s.tipo, { backgroundColor: c.superficie, borderColor: c.bordo }]}
              accessibilityRole="button"
              accessibilityLabel={`${t('ferie.tipo')}: ${tipo?.nome || ''}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={[s.tipoNome, { color: c.testo, fontWeight: '700' }]} numberOfLines={1}>
                  {tipo?.nome || t('ferie.scegliTipo')}
                </Text>
                {tipo && restano(tipo.id) ? (
                  <Text style={[s.tipoSotto, { color: c.testo2 }]} numberOfLines={1}>
                    {restano(tipo.id)}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color={c.testo3} />
            </Pressable>
          ) : (
            <View style={[s.gruppo, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
              {tipi.map((x, i) => {
                const scelto = tipo?.id === x.id
                const sotto = restano(x.id)
                return (
                  <Pressable
                    key={x.id}
                    onPress={() => setTipo(x)}
                    style={[s.tipo, i > 0 && { borderTopColor: c.bordo, borderTopWidth: StyleSheet.hairlineWidth }]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: scelto }}
                  >
                    <Ionicons name={scelto ? 'radio-button-on' : 'radio-button-off'} size={22} color={scelto ? c.primario : c.testo3} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.tipoNome, { color: c.testo, fontWeight: scelto ? '700' : '500' }]} numberOfLines={1}>
                        {x.nome}
                      </Text>
                      {sotto ? (
                        <Text style={[s.tipoSotto, { color: c.testo2 }]} numberOfLines={1}>
                          {sotto}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                )
              })}
            </View>
          )}

          <Text style={[s.etichetta, { color: c.testo2 }]}>{t('ferie.quando')}</Text>
          <View style={[s.gruppo, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
            {mezzaOk ? (
              <View style={[s.riga, { borderBottomColor: c.bordo, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                <Text style={[s.rigaEtichetta, { color: c.testo }]} numberOfLines={1}>
                  {t('ferie.mezzaGiornata')}
                </Text>
                <Switch value={mezza} onValueChange={setMezza} trackColor={{ true: c.primario }} accessibilityLabel={t('ferie.mezzaGiornata')} />
              </View>
            ) : null}
            <Pressable onPress={() => setScegli('dal')} style={s.riga} accessibilityRole="button">
              <Text style={[s.rigaEtichetta, { color: c.testo }]} numberOfLines={1}>
                {mezza ? t('ferie.giorno') : t('ferie.dal')}
              </Text>
              <Text style={[s.rigaValore, { color: c.testo }]} numberOfLines={1}>
                {periodo(giornoIso(dal), giornoIso(dal))}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={c.testo3} />
            </Pressable>
            {mezza ? (
              <View style={[s.parti, { borderTopColor: c.bordo }]}>
                {(['am', 'pm'] as const).map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => setParte(p)}
                    style={[s.parte, { backgroundColor: parte === p ? c.primario : c.superficie2 }]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: parte === p }}
                  >
                    <Text style={[s.parteTesto, { color: parte === p ? c.primarioTesto : c.testo }]} numberOfLines={1}>
                      {p === 'am' ? t('ferie.mattina') : t('ferie.pomeriggio')}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Pressable onPress={() => setScegli('al')} style={[s.riga, { borderTopColor: c.bordo, borderTopWidth: StyleSheet.hairlineWidth }]} accessibilityRole="button">
                <Text style={[s.rigaEtichetta, { color: c.testo }]} numberOfLines={1}>
                  {t('ferie.al')}
                </Text>
                <Text style={[s.rigaValore, { color: giornoIso(al) < giornoIso(dal) ? c.rosso : c.testo }]} numberOfLines={1}>
                  {periodo(giornoIso(al), giornoIso(al))}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={c.testo3} />
              </Pressable>
            )}
          </View>

          <Conteggio conto={conto} mezza={mezza} />

          <Text style={[s.etichetta, { color: c.testo2 }]}>{t('ferie.nota')}</Text>
          <TextInput
            value={nota}
            onChangeText={setNota}
            placeholder={t('ferie.notaEsempio')}
            placeholderTextColor={c.testo3}
            multiline
            style={[s.input, campo]}
          />

          <Pulsante testo={t('ferie.invia')} occupato={occupato} onPress={() => void invia()} />
        </ScrollView>
      </KeyboardAvoidingView>

      <SceltaElenco
        aperto={elenco}
        titolo={t('ferie.tipo')}
        voci={(tipi || []).map((x) => ({ id: x.id, nome: restano(x.id) ? `${x.nome} · ${restano(x.id)}` : x.nome }))}
        scelte={tipo ? [tipo.id] : []}
        chiudi={() => setElenco(false)}
        scegli={(ids) => setTipo(tipi?.find((x) => x.id === ids[0]) || tipo)}
      />

      <SceltaGiorno
        aperto={scegli !== null}
        titolo={scegli === 'al' ? t('ferie.al') : mezza ? t('ferie.giorno') : t('ferie.dal')}
        valore={scegli === 'al' ? al : dal}
        chiudi={() => setScegli(null)}
        scegli={(d) => {
          if (scegli === 'al') {
            setAl(d)
          } else {
            setDal(d)
            // La fine segue l'inizio se resterebbe prima.
            if (giornoIso(al) < giornoIso(d)) {
              setAl(d)
            }
          }
          setScegli(null)
        }}
      />
    </SafeAreaView>
  )
}

/** Quanti giorni conta Odoo per la scelta, o perche' non va. */
function Conteggio({ conto, mezza }: { conto: Conto; mezza: boolean }) {
  const c = useColori()
  if (conto.stato === 'nessuno') {
    return null
  }
  const zero = conto.stato === 'ok' && conto.giorni === 0
  const testo =
    conto.stato === 'calcolo'
      ? t('ferie.contaCalcolo')
      : zero
        ? t('ferie.zeroGiorni')
        : mezza && conto.giorni < 1
          ? t('ferie.contaMezza')
          : t('ferie.conta', { durata: durata(conto.giorni) })
  return (
    <View style={[s.conto, { backgroundColor: zero ? c.ambraTenue : c.primarioTenue }]} accessibilityLiveRegion="polite">
      <Ionicons name={zero ? 'warning' : 'calendar'} size={18} color={zero ? c.ambra : c.primario} />
      <Text style={[s.contoTesto, { color: c.testo }]}>{testo}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1 },
  contenuto: { padding: spazio.l, paddingBottom: spazio.xxl * 2, gap: spazio.s },
  etichetta: { fontSize: 14, fontWeight: '600', marginTop: spazio.m },
  gruppo: { borderRadius: raggio.l, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: spazio.m },
  tipo: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, minHeight: 56, paddingVertical: spazio.s },
  tipoNome: { fontSize: 16 },
  tipoSotto: { fontSize: 13, marginTop: 1 },
  riga: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, minHeight: 52 },
  rigaEtichetta: { fontSize: 16, flex: 1 },
  rigaValore: { fontSize: 16, fontWeight: '600' },
  parti: { flexDirection: 'row', gap: spazio.s, paddingVertical: spazio.m, borderTopWidth: StyleSheet.hairlineWidth },
  parte: { flex: 1, minHeight: 44, borderRadius: raggio.m, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spazio.s },
  parteTesto: { fontSize: 15, fontWeight: '600' },
  conto: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, padding: spazio.m, borderRadius: raggio.m, marginTop: spazio.xs },
  contoTesto: { flex: 1, fontSize: 15, lineHeight: 20 },
  avviso: { flexDirection: 'row', gap: spazio.m, padding: spazio.l, borderRadius: raggio.l },
  avvisoTesto: { flex: 1, fontSize: 15, lineHeight: 21 },
  input: { fontSize: 17, padding: spazio.m, borderRadius: raggio.m, borderWidth: StyleSheet.hairlineWidth, minHeight: 90, textAlignVertical: 'top' },
})
