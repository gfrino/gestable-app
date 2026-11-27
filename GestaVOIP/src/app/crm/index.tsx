/**
 * CRM: le opportunità divise per fase, come le colonne della pipeline di
 * Odoo (con quante sono e quanto valgono), le schede Mie / Tutte / Perse con
 * il numero accanto, la ricerca e il + per una nuova. Aperta dalla scheda di
 * un contatto (parametro «cliente») mostra le opportunità di quel cliente.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { t, tn } from '../../i18n'
import { leggi, scrivi } from '../../odoo/archivio'
import { conteggi, fasi as caricaFasi, opportunita, opportunitaCliente, type Fase, type Filtro, type Opportunita } from '../../odoo/crm'
import { urlAvatar } from '../../odoo/lavoro'
import { Avatar } from '../../ui/Avatar'
import { Caricamento } from '../../ui/Caricamento'
import { coloreAttivita, colorePriorita, importo, quando } from '../../ui/formatoCrm'
import { Stelle } from '../../ui/formatoHelpdesk'
import { Pulsante } from '../../ui/Pulsante'
import { StatoVuoto } from '../../ui/StatoVuoto'
import { Testata } from '../../ui/Testata'
import { raggio, spazio, useColori } from '../../ui/tema'
import { useApp } from '../../voip/Contesto'

const FILTRI: Filtro[] = ['mie', 'tutte', 'perse']

type Sezione = { chiave: string; titolo: string; vinta: boolean; data: Opportunita[] }

/** Le opportunità nell'ordine delle fasi di Odoo; quelle in fasi sconosciute in fondo. */
function perFase(lista: Opportunita[], fasi: Fase[], perse: boolean): Sezione[] {
  if (perse) {
    return lista.length ? [{ chiave: 'perse', titolo: t('crm.perse'), vinta: false, data: lista }] : []
  }
  const sezioni: Sezione[] = fasi.map((f) => ({ chiave: String(f.id), titolo: f.nome, vinta: f.vinta, data: lista.filter((o) => o.faseId === f.id) }))
  const note = new Set(fasi.map((f) => f.id))
  const altre = lista.filter((o) => !o.faseId || !note.has(o.faseId))
  for (const o of altre) {
    const chiave = `x${o.faseId || 0}`
    let s = sezioni.find((x) => x.chiave === chiave)
    if (!s) {
      s = { chiave, titolo: o.fase || '—', vinta: false, data: [] }
      sezioni.push(s)
    }
    s.data.push(o)
  }
  return sezioni.filter((s) => s.data.length)
}

export default function SchermataCrm() {
  const c = useColori()
  const router = useRouter()
  const param = useLocalSearchParams<{ cliente?: string; clienteNome?: string }>()
  const cliente = param.cliente ? Number(param.cliente) : 0
  const { sessione } = useApp()
  const server = sessione?.server || ''
  const uid = sessione?.utente.uid || 0
  const [filtro, setFiltro] = useState<Filtro>('mie')
  const [testo, setTesto] = useState('')
  const [cercato, setCercato] = useState('')
  const [lista, setLista] = useState<Opportunita[] | null>(() => (cliente ? null : leggi<Opportunita[]>(server, uid, 'crm-mie')))
  const [fasi, setFasi] = useState<Fase[]>(() => leggi<Fase[]>(server, uid, 'crm-fasi') || [])
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
      const [r, f, conti] = await Promise.all([
        cliente ? opportunitaCliente(server, cliente) : opportunita(server, uid, filtro, testo),
        caricaFasi(server).catch(() => null),
        testo || cliente ? Promise.resolve(null) : conteggi(server, uid),
      ])
      if (n !== richiesta.current) {
        return
      }
      setLista(r)
      if (f) {
        setFasi(f)
        scrivi(server, uid, 'crm-fasi', f)
      }
      if (conti) {
        setNumeri(conti)
      }
      if (!testo && !cliente) {
        scrivi(server, uid, `crm-${filtro}`, r)
      }
      setErrore('')
    } catch (e) {
      if (n === richiesta.current) {
        setErrore(e instanceof Error ? e.message : String(e))
      }
    }
  }, [server, uid, filtro, testo, cliente])

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

  // Cambiando scheda si mostra subito la copia salvata, poi quella di Odoo.
  function cambia(f: Filtro) {
    if (f === filtro) {
      return
    }
    setFiltro(f)
    setLista(leggi<Opportunita[]>(server, uid, `crm-${f}`))
  }

  async function tiraGiu() {
    setRicarica(true)
    await aggiorna()
    setRicarica(false)
  }

  const nuova = () => router.push('/crm/nuova')
  const sezioni = lista ? perFase(lista, fasi, filtro === 'perse') : []
  const valuta = lista?.find((o) => o.valuta)?.valuta || ''
  const totale = (lista || []).reduce((x, o) => x + o.importo, 0)

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top', 'left', 'right']}>
      <Testata
        titolo={cliente && param.clienteNome ? t('schede.perCliente', { nome: param.clienteNome }) : t('crm.titolo')}
        sottotitolo={lista ? [tn('crm.conta', lista.length), totale ? importo(totale, valuta) : ''].filter(Boolean).join(' · ') : undefined}
        destra={
          <Pressable
            onPress={nuova}
            hitSlop={10}
            style={({ pressed }) => [s.tasto, { backgroundColor: pressed ? c.primarioTenue : 'transparent' }]}
            accessibilityRole="button"
            accessibilityLabel={t('crm.nuova')}
          >
            <Ionicons name="add-circle" size={30} color={c.primario} />
          </Pressable>
        }
      />

      {cliente ? null : (
        <>
      <View style={[s.cerca, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
        <Ionicons name="search" size={18} color={c.testo3} />
        <TextInput
          value={cercato}
          onChangeText={setCercato}
          placeholder={t('crm.cerca')}
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
                  {t(`crm.filtro.${f}`)}
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

        </>
      )}
      {errore && !lista ? (
        <Text style={[s.errore, { color: c.rosso }]}>{errore}</Text>
      ) : !lista ? (
        <Caricamento style={{ marginTop: spazio.xxl }} />
      ) : (
        <SectionList
          sections={sezioni}
          keyExtractor={(x) => String(x.id)}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: spazio.xxl }}
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl refreshing={ricarica} onRefresh={tiraGiu} tintColor={c.primario} />}
          ListEmptyComponent={
            testo ? (
              <StatoVuoto icona="search" titolo={t('crm.nessunRisultato')} />
            ) : (
              <StatoVuoto icona="trending-up" titolo={cliente ? t('crm.vuoto.tutte') : t(`crm.vuoto.${filtro}`)} testo={filtro === 'perse' ? undefined : t('crm.vuotoTesto')}>
                {filtro === 'perse' ? null : <Pulsante testo={t('crm.nuova')} onPress={nuova} />}
              </StatoVuoto>
            )
          }
          renderSectionHeader={({ section }) => {
            const somma = section.data.reduce((x, o) => x + o.importo, 0)
            return (
              <View style={s.sezione}>
                {section.vinta ? <Ionicons name="trophy" size={14} color={c.verde} /> : null}
                <Text style={[s.sezioneTitolo, { color: section.vinta ? c.verde : c.testo }]} numberOfLines={1}>
                  {section.titolo}
                </Text>
                <Text style={[s.sezioneNumero, { color: c.testo3 }]}>{section.data.length}</Text>
                <View style={{ flex: 1 }} />
                {somma ? <Text style={[s.sezioneSomma, { color: c.testo2 }]}>{importo(somma, valuta)}</Text> : null}
              </View>
            )
          }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/crm/[id]', params: { id: String(item.id) } })}
              style={({ pressed }) => [s.riga, { backgroundColor: pressed ? c.superficie2 : c.superficie, borderColor: c.bordo }]}
              accessibilityRole="button"
            >
              <View style={s.rigaTesta}>
                <Text style={[s.titolo, { color: c.testo }]} numberOfLines={2}>
                  {item.nome}
                </Text>
                <Stelle valore={item.priorita} dimensione={13} colore={colorePriorita(item.priorita, c)} />
              </View>
              <Text style={[s.cliente, { color: c.testo2 }]} numberOfLines={1}>
                {item.cliente || t('crm.senzaCliente')}
              </Text>
              <View style={s.rigaPiede}>
                <Text style={[s.importo, { color: c.testo }]} numberOfLines={1}>
                  {item.importo ? importo(item.importo, item.valuta) : '—'}
                </Text>
                <Text style={[s.probabilita, { color: c.testo3 }]}>{item.probabilita}%</Text>
                <View style={{ flex: 1 }} />
                {item.prossima ? (
                  <View style={[s.prossima, { backgroundColor: c.superficie2 }]}>
                    <Ionicons name="time" size={13} color={coloreAttivita(item.prossima.stato, c)} />
                    <Text style={[s.prossimaTesto, { color: coloreAttivita(item.prossima.stato, c) }]} numberOfLines={1}>
                      {quando(item.prossima.data)}
                    </Text>
                  </View>
                ) : null}
                {item.venditore ? <Avatar nome={item.venditore[1]} lato={24} url={urlAvatar(server, 'res.users', item.venditore[0])} /> : null}
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
  sezione: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, paddingHorizontal: spazio.l, paddingTop: spazio.m, paddingBottom: spazio.s },
  sezioneTitolo: { fontSize: 15, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 1 },
  sezioneNumero: { fontSize: 14, fontWeight: '600' },
  sezioneSomma: { fontSize: 14, fontWeight: '700' },
  riga: { marginHorizontal: spazio.l, marginBottom: spazio.s, padding: spazio.m, borderRadius: raggio.l, borderWidth: StyleSheet.hairlineWidth, gap: 4 },
  rigaTesta: { flexDirection: 'row', alignItems: 'flex-start', gap: spazio.s },
  titolo: { flex: 1, fontSize: 16, fontWeight: '600', lineHeight: 21 },
  cliente: { fontSize: 14 },
  rigaPiede: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, marginTop: 2 },
  importo: { fontSize: 15, fontWeight: '700' },
  probabilita: { fontSize: 13, fontWeight: '600' },
  prossima: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 24, borderRadius: 12, maxWidth: 150 },
  prossimaTesto: { fontSize: 12, fontWeight: '700' },
})
