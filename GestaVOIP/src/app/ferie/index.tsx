/**
 * Ferie: in alto quanti giorni restano per ogni tipo con giorni assegnati,
 * sotto le mie richieste divise per stato (da approvare, approvate,
 * rifiutate, annullate) e il + per una richiesta nuova.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { t, tn } from '../../i18n'
import { leggi, scrivi } from '../../odoo/archivio'
import { mieRichieste, saldi as caricaSaldi, type Richiesta, type Saldo, type StatoFerie } from '../../odoo/ferie'
import { Caricamento } from '../../ui/Caricamento'
import { bollino, coloreStato, durata, numero, periodo } from '../../ui/formatoFerie'
import { Pulsante } from '../../ui/Pulsante'
import { StatoVuoto } from '../../ui/StatoVuoto'
import { Testata } from '../../ui/Testata'
import { raggio, spazio, useColori } from '../../ui/tema'
import { useApp } from '../../voip/Contesto'

const ORDINE: StatoFerie[] = ['attesa', 'approvata', 'rifiutata', 'annullata']

type Dati = { saldi: Saldo[]; richieste: Richiesta[] }

export default function SchermataFerie() {
  const c = useColori()
  const router = useRouter()
  const { sessione } = useApp()
  const server = sessione?.server || ''
  const uid = sessione?.utente.uid || 0
  const [dati, setDati] = useState<Dati | null>(() => leggi<Dati>(server, uid, 'ferie'))
  const [errore, setErrore] = useState('')
  const [ricarica, setRicarica] = useState(false)

  const aggiorna = useCallback(async () => {
    if (!server || !uid) {
      return
    }
    try {
      // I saldi non devono fermare l'elenco: senza giorni assegnati restano vuoti.
      const [s, r] = await Promise.all([caricaSaldi(server, uid).catch(() => [] as Saldo[]), mieRichieste(server, uid)])
      const nuovi = { saldi: s, richieste: r }
      setDati(nuovi)
      scrivi(server, uid, 'ferie', nuovi)
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

  async function tiraGiu() {
    setRicarica(true)
    await aggiorna()
    setRicarica(false)
  }

  const nuova = () => router.push('/ferie/nuova')
  const richieste = dati?.richieste || []
  const sezioni = ORDINE.map((stato) => ({ stato, data: richieste.filter((x) => x.stato === stato) })).filter((x) => x.data.length)

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top']}>
      <Testata
        titolo={t('ferie.titolo')}
        sottotitolo={dati ? tn('ferie.conta', richieste.length) : undefined}
        destra={
          <Pressable
            onPress={nuova}
            hitSlop={10}
            style={({ pressed }) => [s.tasto, { backgroundColor: pressed ? c.primarioTenue : 'transparent' }]}
            accessibilityRole="button"
            accessibilityLabel={t('ferie.nuova')}
          >
            <Ionicons name="add-circle" size={30} color={c.primario} />
          </Pressable>
        }
      />
      {errore && !dati ? (
        <Text style={[s.errore, { color: c.rosso }]}>{errore}</Text>
      ) : !dati ? (
        <Caricamento style={{ marginTop: spazio.xxl }} />
      ) : (
        <SectionList
          sections={sezioni}
          keyExtractor={(x) => String(x.id)}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: spazio.xxl }}
          refreshControl={<RefreshControl refreshing={ricarica} onRefresh={tiraGiu} tintColor={c.primario} />}
          ListHeaderComponent={dati.saldi.length ? <Saldi saldi={dati.saldi} /> : null}
          ListEmptyComponent={
            <StatoVuoto icona="airplane-outline" titolo={t('ferie.vuoto')} testo={t('ferie.vuotoTesto')}>
              <Pulsante testo={t('ferie.nuova')} onPress={nuova} />
            </StatoVuoto>
          }
          renderSectionHeader={({ section }) => (
            <View style={s.sezione}>
              <View style={[s.punto, { backgroundColor: coloreStato(section.stato, c) }]} />
              <Text style={[s.sezioneTitolo, { color: c.testo }]}>{t(`ferie.stato.${section.stato}`)}</Text>
              <Text style={[s.sezioneNumero, { color: c.testo3 }]}>{section.data.length}</Text>
            </View>
          )}
          renderItem={({ item }) => <RigaRichiesta r={item} />}
        />
      )}
    </SafeAreaView>
  )
}

/** I saldi in tessere affiancate: si scorrono di lato quando sono tanti. */
function Saldi({ saldi }: { saldi: Saldo[] }) {
  const c = useColori()
  return (
    <View>
      <Text style={[s.saldiTitolo, { color: c.testo2 }]}>{t('ferie.saldi')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.saldi}>
        {saldi.map((x) => (
          <View key={x.tipoId} style={[s.saldo, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
            <Text style={[s.saldoNome, { color: c.testo2 }]} numberOfLines={1}>
              {x.nome}
            </Text>
            <View style={s.saldoRiga}>
              <Text style={[s.saldoNumero, { color: x.disponibili > 0 ? c.primario : c.rosso }]} numberOfLines={1}>
                {numero(x.disponibili)}
              </Text>
              <Text style={[s.saldoUnita, { color: c.testo }]} numberOfLines={1}>
                {x.ore ? (x.disponibili === 1 ? t('ferie.unitaOra') : t('ferie.unitaOre')) : x.disponibili === 1 ? t('ferie.unitaGiorno') : t('ferie.unitaGiorni')}
              </Text>
            </View>
            <Text style={[s.saldoSotto, { color: c.testo3 }]} numberOfLines={1}>
              {[t('ferie.su', { totale: numero(x.totale) }), x.inAttesa ? t('ferie.inAttesa', { n: numero(x.inAttesa) }) : ''].filter(Boolean).join(' · ')}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

function RigaRichiesta({ r }: { r: Richiesta }) {
  const c = useColori()
  const b = bollino(r.dal)
  const quanto = r.mezza
    ? `${t('ferie.mezzaGiornata')} · ${r.mezza === 'pm' ? t('ferie.pomeriggio') : t('ferie.mattina')}`
    : r.inOre && r.ore
      ? durata(r.ore, true)
      : durata(r.giorni)
  return (
    <View style={[s.scheda, { backgroundColor: c.superficie, borderColor: c.bordo }]} accessible accessibilityLabel={`${r.tipo}, ${periodo(r.dal, r.al)}, ${quanto}, ${t(`ferie.chip.${r.stato}`)}`}>
      <View style={[s.bollino, { backgroundColor: c.primarioTenue }]}>
        <Text style={[s.bollinoGiorno, { color: c.primario }]}>{b.giorno}</Text>
        <Text style={[s.bollinoMese, { color: c.primario }]}>{b.mese}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[s.titolo, { color: c.testo }]} numberOfLines={1}>
          {r.tipo}
        </Text>
        <Text style={[s.dettaglio, { color: c.testo2 }]} numberOfLines={1}>
          {periodo(r.dal, r.al)} · {quanto}
        </Text>
        {r.nota ? (
          <Text style={[s.nota, { color: c.testo3 }]} numberOfLines={2}>
            {r.nota}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1 },
  tasto: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  errore: { fontSize: 15, textAlign: 'center', marginTop: spazio.xl, paddingHorizontal: spazio.xl },
  saldiTitolo: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: spazio.l, paddingTop: spazio.l },
  saldi: { gap: spazio.s, paddingHorizontal: spazio.l, paddingTop: spazio.s },
  saldo: { width: 168, padding: spazio.m, borderRadius: raggio.l, borderWidth: StyleSheet.hairlineWidth, gap: 2 },
  saldoNome: { fontSize: 13, fontWeight: '600' },
  saldoRiga: { flexDirection: 'row', alignItems: 'baseline', gap: spazio.xs },
  saldoNumero: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  saldoUnita: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  saldoSotto: { fontSize: 12 },
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
  bollino: { width: 48, height: 48, borderRadius: raggio.m, alignItems: 'center', justifyContent: 'center' },
  bollinoGiorno: { fontSize: 19, fontWeight: '800', lineHeight: 21 },
  bollinoMese: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  titolo: { fontSize: 16, fontWeight: '600' },
  dettaglio: { fontSize: 13 },
  nota: { fontSize: 13, fontStyle: 'italic' },
})
