/**
 * Ferie: in alto quanti giorni restano per ogni tipo con giorni assegnati,
 * poi (per chi approva) le richieste del team da approvare con Approva e
 * Rifiuta, sotto le mie richieste divise per stato (da approvare, approvate,
 * rifiutate, annullate) e il + per una richiesta nuova. Una notifica di
 * richiesta ferie apre questa schermata: quelle da approvare sono in cima.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { Alert, Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { t, tn } from '../../i18n'
import { leggi, scrivi } from '../../odoo/archivio'
import { approva, daApprovare, mieRichieste, rifiuta, saldi as caricaSaldi, type Richiesta, type Saldo, type StatoFerie } from '../../odoo/ferie'
import { urlAvatar } from '../../odoo/lavoro'
import { Avatar } from '../../ui/Avatar'
import { Caricamento } from '../../ui/Caricamento'
import { bollino, coloreStato, durata, numero, periodo } from '../../ui/formatoFerie'
import { Pulsante } from '../../ui/Pulsante'
import { StatoVuoto } from '../../ui/StatoVuoto'
import { Testata } from '../../ui/Testata'
import { raggio, spazio, useColori } from '../../ui/tema'
import { useApp } from '../../voip/Contesto'

const ORDINE: StatoFerie[] = ['attesa', 'approvata', 'rifiutata', 'annullata']

type Dati = { saldi: Saldo[]; richieste: Richiesta[]; team?: Richiesta[] }

type Sezione = { chiave: string; titolo: string; colore: string; data: Richiesta[] }

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
      const [s, r, team] = await Promise.all([
        caricaSaldi(server, uid).catch(() => [] as Saldo[]),
        mieRichieste(server, uid),
        // Chi non approva non ha nulla qui: un errore non deve fermare le sue ferie.
        daApprovare(server, uid).catch(() => [] as Richiesta[]),
      ])
      const nuovi = { saldi: s, richieste: r, team }
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

  const [occupato, setOccupato] = useState('')

  async function agisci(r: Richiesta, cosa: 'approva' | 'rifiuta') {
    setOccupato(`${cosa}-${r.id}`)
    try {
      await (cosa === 'approva' ? approva(server, uid, r) : rifiuta(server, uid, r))
      await aggiorna()
    } catch (e) {
      Alert.alert(cosa === 'approva' ? t('ferie.nonApprovata') : t('ferie.nonRifiutata'), e instanceof Error ? e.message : String(e))
    }
    setOccupato('')
  }

  function chiediRifiuto(r: Richiesta) {
    Alert.alert(t('ferie.rifiutaDomanda'), [r.dipendente, r.tipo, periodo(r.dal, r.al)].filter(Boolean).join(' · '), [
      { text: t('ferie.indietro'), style: 'cancel' },
      { text: t('ferie.rifiuta'), style: 'destructive', onPress: () => void agisci(r, 'rifiuta') },
    ])
  }

  async function tiraGiu() {
    setRicarica(true)
    await aggiorna()
    setRicarica(false)
  }

  const nuova = () => router.push('/ferie/nuova')
  const richieste = dati?.richieste || []
  const team = dati?.team || []
  const sezioni: Sezione[] = [
    ...(team.length ? [{ chiave: 'team', titolo: t('ferie.daApprovareTeam'), colore: c.ambra, data: team }] : []),
    ...ORDINE.map((stato) => ({ chiave: stato, titolo: t(`ferie.stato.${stato}`), colore: coloreStato(stato, c), data: richieste.filter((x) => x.stato === stato) })),
  ].filter((x) => x.data.length)

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top', 'left', 'right']}>
      <Testata
        titolo={t('ferie.titolo')}
        sottotitolo={dati ? [tn('ferie.conta', richieste.length), team.length ? tn('ferie.contaTeam', team.length) : ''].filter(Boolean).join(' · ') : undefined}
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
              <View style={[s.punto, { backgroundColor: section.colore }]} />
              <Text style={[s.sezioneTitolo, { color: c.testo }]}>{section.titolo}</Text>
              <Text style={[s.sezioneNumero, { color: c.testo3 }]}>{section.data.length}</Text>
            </View>
          )}
          renderItem={({ item, section }) => (
            <RigaRichiesta
              r={item}
              server={server}
              altri={section.chiave === 'team'}
              occupato={occupato}
              approva={() => void agisci(item, 'approva')}
              rifiuta={() => chiediRifiuto(item)}
            />
          )}
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

function RigaRichiesta({
  r,
  server,
  altri,
  occupato,
  approva: suApprova,
  rifiuta: suRifiuta,
}: {
  r: Richiesta
  server: string
  /** Richiesta di un collega: in testa chi la chiede, con la foto. */
  altri: boolean
  occupato: string
  approva: () => void
  rifiuta: () => void
}) {
  const c = useColori()
  const b = bollino(r.dal)
  const quanto = r.mezza
    ? `${t('ferie.mezzaGiornata')} · ${r.mezza === 'pm' ? t('ferie.pomeriggio') : t('ferie.mattina')}`
    : r.inOre && r.ore
      ? durata(r.ore, true)
      : durata(r.giorni)
  const azioni = r.puoApprovare || r.puoRifiutare
  return (
    <View style={[s.scheda, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
      <View
        style={s.schedaRiga}
        accessible
        accessibilityLabel={[altri ? r.dipendente : '', r.tipo, periodo(r.dal, r.al), quanto, t(`ferie.chip.${r.stato}`)].filter(Boolean).join(', ')}
      >
        {altri ? (
          <Avatar nome={r.dipendente} lato={48} url={r.utenteId ? urlAvatar(server, 'res.users', r.utenteId) : undefined} />
        ) : (
          <View style={[s.bollino, { backgroundColor: c.primarioTenue }]}>
            <Text style={[s.bollinoGiorno, { color: c.primario }]}>{b.giorno}</Text>
            <Text style={[s.bollinoMese, { color: c.primario }]}>{b.mese}</Text>
          </View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[s.titolo, { color: c.testo }]} numberOfLines={1}>
            {altri ? r.dipendente : r.tipo}
          </Text>
          {altri ? (
            <Text style={[s.dettaglio, { color: c.testo }]} numberOfLines={1}>
              {r.tipo}
            </Text>
          ) : null}
          <Text style={[s.dettaglio, { color: c.testo2 }]} numberOfLines={1}>
            {periodo(r.dal, r.al)} · {quanto}
          </Text>
          {r.seconda ? (
            <Text style={[s.dettaglio, { color: c.ambra, fontWeight: '600' }]} numberOfLines={1}>
              {t('ferie.secondaApprovazione')}
            </Text>
          ) : null}
          {r.nota ? (
            <Text style={[s.nota, { color: c.testo3 }]} numberOfLines={2}>
              {r.nota}
            </Text>
          ) : null}
        </View>
      </View>
      {azioni ? (
        <View style={s.azioni}>
          {r.puoRifiutare ? (
            <Pressable
              onPress={suRifiuta}
              disabled={!!occupato}
              style={({ pressed }) => [s.azione, { backgroundColor: c.rossoTenue, opacity: pressed || occupato === `rifiuta-${r.id}` ? 0.6 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={`${t('ferie.rifiuta')}: ${r.dipendente || r.tipo}`}
            >
              {occupato === `rifiuta-${r.id}` ? <Caricamento dimensione={18} /> : <Ionicons name="close" size={18} color={c.rosso} />}
              <Text style={[s.azioneTesto, { color: c.rosso }]} numberOfLines={1}>
                {t('ferie.rifiuta')}
              </Text>
            </Pressable>
          ) : null}
          {r.puoApprovare ? (
            <Pressable
              onPress={suApprova}
              disabled={!!occupato}
              style={({ pressed }) => [s.azione, { backgroundColor: c.verde, opacity: pressed || occupato === `approva-${r.id}` ? 0.7 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={`${t('ferie.approva')}: ${r.dipendente || r.tipo}`}
            >
              {occupato === `approva-${r.id}` ? <Caricamento dimensione={18} /> : <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
              <Text style={[s.azioneTesto, { color: '#FFFFFF' }]} numberOfLines={1}>
                {t('ferie.approva')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
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
    gap: spazio.m,
    marginHorizontal: spazio.l,
    marginBottom: spazio.s,
    padding: spazio.m,
    borderRadius: raggio.l,
    borderWidth: StyleSheet.hairlineWidth,
  },
  schedaRiga: { flexDirection: 'row', alignItems: 'center', gap: spazio.m },
  azioni: { flexDirection: 'row', gap: spazio.s },
  azione: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: raggio.m, paddingHorizontal: spazio.m },
  azioneTesto: { fontSize: 16, fontWeight: '700' },
  bollino: { width: 48, height: 48, borderRadius: raggio.m, alignItems: 'center', justifyContent: 'center' },
  bollinoGiorno: { fontSize: 19, fontWeight: '800', lineHeight: 21 },
  bollinoMese: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  titolo: { fontSize: 16, fontWeight: '600' },
  dettaglio: { fontSize: 13 },
  nota: { fontSize: 13, fontStyle: 'italic' },
})
