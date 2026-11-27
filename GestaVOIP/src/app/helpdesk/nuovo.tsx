/**
 * Nuovo ticket: titolo, cliente, descrizione, team, categoria, priorita' e a chi
 * va (di base a chi lo crea). Creato, si apre la sua scheda.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useRouter } from 'expo-router'
import { useEffect, useState, type ReactNode } from 'react'
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { t } from '../../i18n'
import { creaTicket, elenco, struttura, type Scelta, type Struttura } from '../../odoo/helpdesk'
import { CercaPersone } from '../../ui/calendario/CercaPersone'
import { colorePriorita } from '../../ui/formatoHelpdesk'
import { Pulsante } from '../../ui/Pulsante'
import { SceltaElenco } from '../../ui/SceltaElenco'
import { Testata } from '../../ui/Testata'
import { raggio, spazio, useColori } from '../../ui/tema'
import { useApp } from '../../voip/Contesto'

type Elenco = 'team' | 'categoria'

export default function NuovoTicket() {
  const c = useColori()
  const router = useRouter()
  const { sessione } = useApp()
  const server = sessione?.server || ''
  const uid = sessione?.utente.uid || 0

  const [st, setSt] = useState<Struttura | null>(null)
  const [titolo, setTitolo] = useState('')
  const [descrizione, setDescrizione] = useState('')
  const [cliente, setCliente] = useState<Scelta | null>(null)
  const [team, setTeam] = useState<Scelta | null>(null)
  const [categoria, setCategoria] = useState<Scelta | null>(null)
  const [assegnato, setAssegnato] = useState<Scelta | null>(() => (uid ? { id: uid, nome: sessione?.utente.name || '' } : null))
  const [priorita, setPriorita] = useState(1)
  const [foglio, setFoglio] = useState<Elenco | null>(null)
  const [voci, setVoci] = useState<Scelta[]>([])
  const [persone, setPersone] = useState<'cliente' | 'assegnato' | null>(null)
  const [occupato, setOccupato] = useState(false)

  useEffect(() => {
    if (server) {
      struttura(server)
        .then(setSt)
        .catch(() => undefined)
    }
  }, [server])

  async function apri(cosa: Elenco) {
    setVoci([])
    setFoglio(cosa)
    setVoci(await elenco(server, cosa).catch(() => []))
  }

  async function crea() {
    if (!titolo.trim()) {
      Alert.alert(t('helpdesk.nonCreato'), t('helpdesk.scriviTitolo'))
      return
    }
    setOccupato(true)
    try {
      const id = await creaTicket(server, {
        titolo,
        descrizione,
        clienteId: cliente?.id || null,
        teamId: team?.id || null,
        categoriaId: categoria?.id || null,
        priorita,
        assegnato: assegnato?.id || null,
      })
      router.replace({ pathname: '/helpdesk/[id]', params: { id: String(id) } })
    } catch (e) {
      setOccupato(false)
      Alert.alert(t('helpdesk.nonCreato'), e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top', 'left', 'right']}>
      <Testata titolo={t('helpdesk.nuovoTitolo')} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.contenuto} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          <Etichetta testo={t('helpdesk.titoloTicket')} />
          <TextInput
            value={titolo}
            onChangeText={setTitolo}
            placeholder={t('helpdesk.titoloEsempio')}
            placeholderTextColor={c.testo3}
            autoFocus
            style={[s.input, { color: c.testo, backgroundColor: c.superficie, borderColor: c.bordo }]}
          />

          <View style={[s.gruppo, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
            <Riga etichetta={t('helpdesk.cliente')} valore={cliente?.nome} vuoto={t('helpdesk.scegli')} onPress={() => setPersone('cliente')} />
            <Riga etichetta={t('helpdesk.team')} valore={team?.nome} vuoto={t('helpdesk.scegli')} onPress={() => void apri('team')} />
            {st?.categoria ? (
              <Riga etichetta={t('helpdesk.categoria')} valore={categoria?.nome} vuoto={t('helpdesk.scegli')} onPress={() => void apri('categoria')} />
            ) : null}
            <Riga etichetta={t('helpdesk.assegnato')} valore={assegnato?.nome} vuoto={t('helpdesk.nonAssegnato')} onPress={() => setPersone('assegnato')} />
            <Riga etichetta={t('helpdesk.priorita')}>
              <View style={s.stelle}>
                {[1, 2, 3].map((n) => (
                  <Pressable key={n} onPress={() => setPriorita(priorita === n ? n - 1 : n)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${t('helpdesk.priorita')} ${n}`}>
                    <Ionicons name={priorita >= n ? 'star' : 'star-outline'} size={24} color={priorita >= n ? colorePriorita(priorita, c) : c.testo3} />
                  </Pressable>
                ))}
              </View>
            </Riga>
          </View>

          <Etichetta testo={t('helpdesk.descrizione')} />
          <TextInput
            value={descrizione}
            onChangeText={setDescrizione}
            placeholder={t('helpdesk.descrizioneEsempio')}
            placeholderTextColor={c.testo3}
            multiline
            style={[s.input, s.area, { color: c.testo, backgroundColor: c.superficie, borderColor: c.bordo }]}
          />

          <Pulsante testo={t('helpdesk.crea')} occupato={occupato} onPress={() => void crea()} />
        </ScrollView>
      </KeyboardAvoidingView>

      <SceltaElenco
        aperto={foglio !== null}
        titolo={foglio === 'team' ? t('helpdesk.team') : t('helpdesk.categoria')}
        voci={voci}
        scelte={foglio === 'team' ? (team ? [team.id] : []) : categoria ? [categoria.id] : []}
        vuota={t('helpdesk.nessuna')}
        chiudi={() => setFoglio(null)}
        scegli={(ids) => {
          const v = voci.find((x) => x.id === ids[0]) || null
          if (foglio === 'team') {
            setTeam(v)
          } else {
            setCategoria(v)
          }
        }}
      />

      <CercaPersone
        aperto={persone !== null}
        server={server}
        tipo={persone === 'cliente' ? 'invitati' : 'organizzatore'}
        titolo={persone === 'cliente' ? t('helpdesk.cliente') : t('helpdesk.assegnato')}
        singolo
        scelti={[]}
        chiudi={() => setPersone(null)}
        tocca={(p) => {
          if (persone === 'cliente') {
            setCliente({ id: p.id, nome: p.nome })
          } else {
            setAssegnato({ id: p.id, nome: p.nome })
          }
          setPersone(null)
        }}
      />
    </SafeAreaView>
  )
}

function Etichetta({ testo }: { testo: string }) {
  const c = useColori()
  return <Text style={[s.etichetta, { color: c.testo2 }]}>{testo}</Text>
}

function Riga({ etichetta, valore, vuoto, onPress, children }: { etichetta: string; valore?: string; vuoto?: string; onPress?: () => void; children?: ReactNode }) {
  const c = useColori()
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[s.riga, { borderColor: c.bordo }]} accessibilityRole={onPress ? 'button' : 'text'}>
      <Text style={[s.rigaEtichetta, { color: c.testo }]} numberOfLines={1}>
        {etichetta}
      </Text>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        {children ?? (
          <Text style={[s.rigaValore, { color: valore ? c.testo : c.testo3 }]} numberOfLines={1}>
            {valore || vuoto}
          </Text>
        )}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={c.testo3} /> : null}
    </Pressable>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1 },
  contenuto: { padding: spazio.l, paddingBottom: spazio.xxl * 2, gap: spazio.s },
  etichetta: { fontSize: 14, fontWeight: '600', marginTop: spazio.s },
  input: { fontSize: 17, padding: spazio.m, borderRadius: raggio.m, borderWidth: StyleSheet.hairlineWidth },
  area: { minHeight: 150, textAlignVertical: 'top' },
  gruppo: { borderRadius: raggio.l, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: spazio.m, marginTop: spazio.m },
  riga: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, minHeight: 52 },
  rigaEtichetta: { fontSize: 16, width: 110 },
  rigaValore: { fontSize: 16, fontWeight: '600' },
  stelle: { flexDirection: 'row', gap: spazio.s },
})
