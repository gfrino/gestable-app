/**
 * Contatti di Odoo: cerca per nome, azienda, email o numero, filtra aziende e
 * persone, chiama con un tocco. La lista arriva a pagine mentre si scorre.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { cercaContatti, lettera, type Contatto, type Filtro } from '../../odoo/contatti'
import { urlAvatar } from '../../odoo/lavoro'
import { Avatar } from '../../ui/Avatar'
import { chiamaNumero } from '../../ui/chiama'
import { PulsanteMenu } from '../../ui/MenuLaterale'
import { raggio, spazio, useColori } from '../../ui/tema'
import { useApp } from '../../voip/Contesto'

const PAGINA = 60
const FILTRI: { valore: Filtro; testo: string }[] = [
  { valore: 'tutti', testo: 'Tutti' },
  { valore: 'aziende', testo: 'Aziende' },
  { valore: 'persone', testo: 'Persone' },
]

export default function Contatti() {
  const c = useColori()
  const router = useRouter()
  const { sessione } = useApp()
  const server = sessione?.server || ''
  const [testo, setTesto] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('tutti')
  const [lista, setLista] = useState<Contatto[] | null>(null)
  const [finita, setFinita] = useState(false)
  const [altri, setAltri] = useState(false)
  const [errore, setErrore] = useState('')
  const [ricarica, setRicarica] = useState(false)
  const giro = useRef(0)

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
          setFinita(r.length < PAGINA)
          setErrore('')
        }
      } catch (e) {
        if (mio === giro.current) {
          setErrore(e instanceof Error ? e.message : String(e))
        }
      }
    },
    [server, testo, filtro],
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
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top']}>
      <View style={s.testa}>
        <PulsanteMenu />
        <Text style={[s.titolo, { color: c.testo }]}>Contatti</Text>
        <Pressable
          onPress={() => router.push('/contatti/nuovo')}
          hitSlop={8}
          style={({ pressed }) => [s.piu, { backgroundColor: c.primario, opacity: pressed ? 0.85 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Nuovo contatto"
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
          placeholder="Nome, azienda, email o numero"
          placeholderTextColor={c.testo3}
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
          accessibilityLabel="Cerca un contatto"
        />
      </View>

      <View style={s.filtri}>
        {FILTRI.map((f) => {
          const attivo = f.valore === filtro
          return (
            <Pressable
              key={f.valore}
              onPress={() => setFiltro(f.valore)}
              style={[s.filtro, { borderColor: attivo ? c.primario : c.bordo, backgroundColor: attivo ? c.primarioTenue : 'transparent' }]}
              accessibilityRole="button"
              accessibilityState={{ selected: attivo }}
            >
              <Text style={[s.filtroTesto, { color: attivo ? c.primario : c.testo2 }]} numberOfLines={1}>
                {f.testo}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {errore && !lista ? (
        <Text style={[s.vuoto, { color: c.rosso }]}>{errore}</Text>
      ) : !lista ? (
        <ActivityIndicator style={{ marginTop: spazio.xxl }} color={c.primario} />
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
              <Text style={[s.vuoto, { color: c.testo2 }]}>{testo ? 'Nessun contatto trovato.' : 'Nessun contatto.'}</Text>
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
                    accessibilityLabel={`Chiama ${item.nome}`}
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
  filtri: { flexDirection: 'row', gap: spazio.s, paddingHorizontal: spazio.l, paddingVertical: spazio.m },
  filtro: { paddingHorizontal: 14, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  filtroTesto: { fontSize: 14, fontWeight: '700' },
  sezione: { fontSize: 13, fontWeight: '800', paddingHorizontal: spazio.l, paddingVertical: 4 },
  riga: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, paddingHorizontal: spazio.l, paddingVertical: 9 },
  nome: { fontSize: 16, fontWeight: '600' },
  sotto: { fontSize: 13, marginTop: 1 },
  chiama: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  vuoto: { fontSize: 15, textAlign: 'center', marginTop: spazio.s, paddingHorizontal: spazio.xl },
  vuotoBlocco: { alignItems: 'center', marginTop: spazio.xxl },
})
