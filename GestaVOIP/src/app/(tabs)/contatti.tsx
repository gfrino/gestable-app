/**
 * Contatti di Odoo: cerca per nome, azienda, email o numero, filtra aziende e
 * persone, clienti e fornitori (anche insieme: clienti che sono aziende),
 * chiama con un tocco. La lista arriva a pagine mentre si scorre. L'ultimo
 * filtro scelto resta alla prossima apertura.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { t } from '../../i18n'
import { cercaContatti, haClientiFornitori, lettera, type Contatto, type Filtro } from '../../odoo/contatti'
import { urlAvatar } from '../../odoo/lavoro'
import { Avatar } from '../../ui/Avatar'
import { chiamaNumero } from '../../ui/chiama'
import { PulsanteMenu } from '../../ui/MenuLaterale'
import { raggio, spazio, useColori } from '../../ui/tema'
import { useApp } from '../../voip/Contesto'
import { APP } from '../../odoo/capacita'
import { RichiedeApp } from '../../ui/RichiedeApp'
import { leggi, scrivi } from '../../odoo/archivio'
import { Caricamento } from '../../ui/Caricamento'
import { conTelefono } from '../../odoo/sessione'
import { colleghi, type Collega } from '../../voip/api'

const PAGINA = 60
// Chiavi dei testi: t() si chiama mostrando la lista (la lingua puo' cambiare).
// Clienti e Fornitori solo dove Odoo li conta (haClientiFornitori).
const RUOLI: { valore: NonNullable<Filtro['ruolo']>; chiave: string }[] = [
  { valore: 'clienti', chiave: 'schede.filtroClienti' },
  { valore: 'fornitori', chiave: 'schede.filtroFornitori' },
]
const TIPI: { valore: NonNullable<Filtro['tipo']>; chiave: string }[] = [
  { valore: 'aziende', chiave: 'schede.filtroAziende' },
  { valore: 'persone', chiave: 'schede.filtroPersone' },
]

type FiltroSalvato = Filtro & { interni?: boolean }

/** Copia locale della prima pagina, una per combinazione di filtri. */
function chiaveElenco(f: Filtro): string {
  return !f.ruolo && !f.tipo ? 'contatti' : `contatti-${f.ruolo || 'tutti'}-${f.tipo || 'tutti'}`
}

function ElencoContatti() {
  const c = useColori()
  const router = useRouter()
  const { sessione } = useApp()
  const server = sessione?.server || ''
  const uid = sessione?.utente.uid || 0
  const [testo, setTesto] = useState('')
  // L'ultimo filtro scelto, per questo utente su questo server.
  const [salvato] = useState(() => leggi<FiltroSalvato>(server, uid, 'contatti-filtro'))
  const [filtro, setFiltro] = useState<Filtro>(() => ({ ruolo: salvato?.ruolo ?? null, tipo: salvato?.tipo ?? null }))
  const [lista, setLista] = useState<Contatto[] | null>(() => leggi<Contatto[]>(server, uid, chiaveElenco(filtro)))
  const [finita, setFinita] = useState(false)
  const [altri, setAltri] = useState(false)
  const [errore, setErrore] = useState('')
  const [ricarica, setRicarica] = useState(false)
  const giro = useRef(0)
  // «Interni»: i colleghi con il loro interno, solo con il telefono (VOIP AI).
  const telefono = conTelefono(sessione)
  // Ricordato per non far sparire per un attimo i filtri Clienti/Fornitori all'apertura.
  const [conRank, setConRank] = useState(() => !!leggi<boolean>(server, uid, 'contatti-rank'))
  useEffect(() => {
    let vivo = true
    if (server) {
      haClientiFornitori(server)
        .then((x) => {
          if (vivo) {
            setConRank(x)
            scrivi(server, uid, 'contatti-rank', x)
          }
        })
        .catch(() => undefined)
    }
    return () => {
      vivo = false
    }
  }, [server, uid])
  const [interni, setInterni] = useState(() => !!salvato?.interni && telefono)
  const ruolo = conRank ? filtro.ruolo : null

  function cambia(nuovo: Filtro, conInterni: boolean) {
    setInterni(conInterni)
    if (nuovo.ruolo !== filtro.ruolo || nuovo.tipo !== filtro.tipo) {
      setFiltro(nuovo)
      const copia = leggi<Contatto[]>(server, uid, chiaveElenco(nuovo))
      if (copia && !testo) {
        setLista(copia)
      }
    }
    scrivi(server, uid, 'contatti-filtro', { ...nuovo, interni: conInterni })
  }
  const [elencoInterni, setElencoInterni] = useState<Collega[] | null>(() => leggi<Collega[]>(server, uid, 'interni'))

  useFocusEffect(
    useCallback(() => {
      if (!interni || !server) {
        return
      }
      colleghi(server)
        .then((r) => {
          setElencoInterni(r)
          scrivi(server, uid, 'interni', r)
        })
        .catch(() => setElencoInterni((x) => x || []))
    }, [interni, server, uid]),
  )

  // Prima pagina: dopo una breve pausa mentre si scrive; vale solo l'ultima risposta.
  const primaPagina = useCallback(
    async (attesa: number) => {
      if (!server) {
        return
      }
      const mio = ++giro.current
      if (attesa) {
        await new Promise((r) => setTimeout(r, attesa))
      }
      if (mio !== giro.current) {
        return
      }
      try {
        const r = await cercaContatti(server, testo, filtro, 0, PAGINA)
        if (mio === giro.current) {
          setLista(r)
          if (!testo) {
            scrivi(server, uid, chiaveElenco(filtro), r)
          }
          setFinita(r.length < PAGINA)
          setErrore('')
        }
      } catch (e) {
        if (mio === giro.current) {
          setErrore(e instanceof Error ? e.message : String(e))
        }
      }
    },
    [server, uid, testo, filtro],
  )

  // Si ricarica quando cambia la ricerca (con una pausa mentre si scrive) e
  // tornando sulla scheda, per esempio dopo un contatto nuovo.
  useFocusEffect(
    useCallback(() => {
      void primaPagina(testo ? 300 : 0)
    }, [primaPagina, testo]),
  )

  async function prossimaPagina() {
    if (!lista || finita || altri || !server) {
      return
    }
    setAltri(true)
    const mio = giro.current
    try {
      const r = await cercaContatti(server, testo, filtro, lista.length, PAGINA)
      if (mio === giro.current) {
        setLista((l) => [...(l || []), ...r.filter((x) => !(l || []).some((y) => y.id === x.id))])
        setFinita(r.length < PAGINA)
      }
    } catch {
      // La prossima volta che si arriva in fondo si riprova.
    } finally {
      setAltri(false)
    }
  }

  async function tiraGiu() {
    setRicarica(true)
    await primaPagina(0)
    setRicarica(false)
  }

  // Ordine e gruppi li fa l'app: in Odoo ci sono nomi che iniziano con spazi
  // o minuscole, che l'ordine del server mette fuori posto.
  const ordinati = [...(lista || [])].sort((a, b) => a.nome.localeCompare(b.nome, 'it', { sensitivity: 'base' }))
  const sezioni: { titolo: string; data: Contatto[] }[] = []
  for (const x of ordinati) {
    const l = lettera(x.nome)
    const ultima = sezioni[sezioni.length - 1]
    if (ultima && ultima.titolo === l) {
      ultima.data.push(x)
    } else {
      sezioni.push({ titolo: l, data: [x] })
    }
  }

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top', 'left', 'right']}>
      <View style={s.testa}>
        <PulsanteMenu />
        <Text style={[s.titolo, { color: c.testo }]}>{t('schede.contatti')}</Text>
        <Pressable
          onPress={() => router.push('/contatti/nuovo')}
          hitSlop={8}
          style={({ pressed }) => [s.piu, { backgroundColor: c.primario, opacity: pressed ? 0.85 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={t('schede.nuovoContatto')}
        >
          <Ionicons name="add" size={24} color={c.primarioTesto} />
        </Pressable>
      </View>

      <View style={[s.cerca, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
        <Ionicons name="search" size={18} color={c.testo3} />
        <TextInput
          style={[s.campo, { color: c.testo }]}
          value={testo}
          onChangeText={setTesto}
          placeholder={t('schede.cercaContattiSegnaposto')}
          placeholderTextColor={c.testo3}
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
          accessibilityLabel={t('schede.cercaContatto')}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filtriRiga} contentContainerStyle={s.filtri}>
        {/* Tutti azzera; Clienti/Fornitori e Aziende/Persone si combinano (un tocco accende, un altro spegne). */}
        <Chip testo={t('schede.filtroTutti')} attivo={!interni && !ruolo && !filtro.tipo} onPress={() => cambia({ ruolo: null, tipo: null }, false)} />
        {conRank
          ? RUOLI.map((f) => (
              <Chip
                key={f.valore}
                testo={t(f.chiave)}
                attivo={!interni && ruolo === f.valore}
                onPress={() => cambia({ ...filtro, ruolo: !interni && filtro.ruolo === f.valore ? null : f.valore }, false)}
              />
            ))
          : null}
        {conRank ? <View style={[s.separa, { backgroundColor: c.bordo }]} /> : null}
        {TIPI.map((f) => (
          <Chip
            key={f.valore}
            testo={t(f.chiave)}
            attivo={!interni && filtro.tipo === f.valore}
            onPress={() => cambia({ ...filtro, tipo: !interni && filtro.tipo === f.valore ? null : f.valore }, false)}
          />
        ))}
        {telefono ? (
          <Pressable
            onPress={() => cambia(filtro, true)}
            style={[s.filtro, { borderColor: interni ? c.primario : c.bordo, backgroundColor: interni ? c.primarioTenue : 'transparent' }]}
            accessibilityRole="button"
            accessibilityState={{ selected: interni }}
          >
            <Text style={[s.filtroTesto, { color: interni ? c.primario : c.testo2 }]} numberOfLines={1}>
              {t('schede.filtroInterni')}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {interni ? (
        <ElencoInterni lista={elencoInterni} testo={testo} />
      ) : errore && !lista ? (
        <Text style={[s.vuoto, { color: c.rosso }]}>{errore}</Text>
      ) : !lista ? (
        <Caricamento style={{ marginTop: spazio.xxl }} />
      ) : (
        <SectionList
          sections={sezioni}
          keyExtractor={(x) => String(x.id)}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          stickySectionHeadersEnabled
          onEndReached={prossimaPagina}
          onEndReachedThreshold={0.6}
          refreshControl={<RefreshControl refreshing={ricarica} onRefresh={tiraGiu} tintColor={c.primario} />}
          ListEmptyComponent={
            <View style={s.vuotoBlocco}>
              <Ionicons name="people-outline" size={48} color={c.testo3} />
              <Text style={[s.vuoto, { color: c.testo2 }]}>{testo ? t('schede.nessunContattoTrovato') : t('schede.nessunContatto')}</Text>
            </View>
          }
          ListFooterComponent={altri ? <ActivityIndicator style={{ margin: spazio.l }} color={c.primario} /> : null}
          renderSectionHeader={({ section }) => (
            <Text style={[s.sezione, { color: c.primario, backgroundColor: c.sfondo }]}>{section.titolo}</Text>
          )}
          renderItem={({ item }) => {
            const numero = item.cellulare || item.telefono
            const sotto = item.eAzienda
              ? [item.citta, item.email].filter(Boolean).join(' · ')
              : [item.funzione, item.azienda].filter(Boolean).join(' · ') || item.email
            return (
              <Pressable
                onPress={() => router.push({ pathname: '/contatti/[id]', params: { id: String(item.id) } })}
                style={({ pressed }) => [s.riga, { backgroundColor: pressed ? c.superficie : 'transparent' }]}
              >
                <Avatar
                  url={item.foto ? urlAvatar(server, 'res.partner', item.id) : undefined}
                  nome={item.nome}
                  icona={item.eAzienda ? 'business' : undefined}
                  logo={item.eAzienda}
                  lato={46}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[s.nome, { color: c.testo }]} numberOfLines={1}>
                    {item.nome}
                  </Text>
                  {sotto ? (
                    <Text style={[s.sotto, { color: c.testo2 }]} numberOfLines={1}>
                      {sotto}
                    </Text>
                  ) : null}
                </View>
                {numero ? (
                  <Pressable
                    onPress={() => chiamaNumero(sessione, numero, item.nome)}
                    hitSlop={8}
                    style={({ pressed }) => [s.chiama, { backgroundColor: c.verdeTenue, opacity: pressed ? 0.7 : 1 }]}
                    accessibilityRole="button"
                    accessibilityLabel={t('schede.chiamaNome', { nome: item.nome })}
                  >
                    <Ionicons name="call" size={18} color={c.verde} />
                  </Pressable>
                ) : null}
              </Pressable>
            )
          }}
        />
      )}
    </SafeAreaView>
  )
}

function Chip({ testo, attivo, onPress }: { testo: string; attivo: boolean; onPress: () => void }) {
  const c = useColori()
  return (
    <Pressable
      onPress={onPress}
      style={[s.filtro, { borderColor: attivo ? c.primario : c.bordo, backgroundColor: attivo ? c.primarioTenue : 'transparent' }]}
      accessibilityRole="button"
      accessibilityState={{ selected: attivo }}
    >
      <Text style={[s.filtroTesto, { color: attivo ? c.primario : c.testo2 }]} numberOfLines={1}>
        {testo}
      </Text>
    </Pressable>
  )
}

/** I colleghi con il loro interno: un tocco e si chiama (resta dentro il centralino). */
function ElencoInterni({ lista, testo }: { lista: Collega[] | null; testo: string }) {
  const c = useColori()
  const { sessione } = useApp()
  if (!lista) {
    return <Caricamento style={{ marginTop: spazio.xxl }} />
  }
  const q = testo.trim().toLowerCase()
  const voci = lista
    .filter((x) => x.extension && (!q || x.name.toLowerCase().includes(q) || x.extension.startsWith(q)))
    .sort((a, b) => Number(b.available) - Number(a.available) || a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }))
  return (
    <FlatList
      data={voci}
      keyExtractor={(x) => String(x.id)}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      ListEmptyComponent={
        <View style={s.vuotoBlocco}>
          <Ionicons name="call-outline" size={48} color={c.testo3} />
          <Text style={[s.vuoto, { color: c.testo2 }]}>{t('schede.nessunInterno')}</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => chiamaNumero(sessione, item.extension, item.name)}
          style={({ pressed }) => [s.riga, { backgroundColor: pressed ? c.superficie : 'transparent' }]}
          accessibilityRole="button"
          accessibilityLabel={`${t('schede.chiamaNome', { nome: item.name })}, ${t('schede.interno', { n: item.extension })}, ${
            item.available ? t('schede.disponibile') : t('schede.nonDisponibile')
          }`}
        >
          <View>
            <Avatar url={sessione ? urlAvatar(sessione.server, 'res.users', item.id) : undefined} nome={item.name} lato={46} />
            <View style={[s.presenza, { backgroundColor: item.available ? c.verde : c.testo3, borderColor: c.sfondo }]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.nome, { color: c.testo }]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[s.sotto, { color: c.testo2 }]} numberOfLines={1}>
              {t('schede.interno', { n: item.extension })}
            </Text>
          </View>
          <View style={[s.chiama, { backgroundColor: c.verdeTenue }]}>
            <Ionicons name="call" size={18} color={c.verde} />
          </View>
        </Pressable>
      )}
    />
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1 },
  testa: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, paddingHorizontal: spazio.m, paddingVertical: spazio.s },
  titolo: { flex: 1, fontSize: 30, fontWeight: '800', letterSpacing: -0.3 },
  piu: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  cerca: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spazio.s,
    marginHorizontal: spazio.l,
    paddingHorizontal: spazio.m,
    borderRadius: raggio.m,
    borderWidth: 1,
  },
  campo: { flex: 1, fontSize: 16, paddingVertical: 11 },
  filtriRiga: { flexGrow: 0, flexShrink: 0 },
  filtri: { flexDirection: 'row', gap: spazio.s, paddingHorizontal: spazio.l, paddingVertical: spazio.m },
  filtro: { paddingHorizontal: 14, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  filtroTesto: { fontSize: 14, fontWeight: '700' },
  separa: { width: 1, height: 20, alignSelf: 'center' },
  sezione: { fontSize: 13, fontWeight: '800', paddingHorizontal: spazio.l, paddingVertical: 4 },
  riga: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, paddingHorizontal: spazio.l, paddingVertical: 9 },
  nome: { fontSize: 16, fontWeight: '600' },
  sotto: { fontSize: 13, marginTop: 1 },
  chiama: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  presenza: { position: 'absolute', right: -1, bottom: -1, width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  vuoto: { fontSize: 15, textAlign: 'center', marginTop: spazio.s, paddingHorizontal: spazio.xl },
  vuotoBlocco: { alignItems: 'center', marginTop: spazio.xxl },
})

export default function Contatti() {
  return (
    <RichiedeApp xmlid={APP.contatti} app={t('schede.contatti')} titolo={t('schede.contatti')} icona="people">
      <ElencoContatti />
    </RichiedeApp>
  )
}
