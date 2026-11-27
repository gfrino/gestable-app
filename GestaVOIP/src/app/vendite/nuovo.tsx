/**
 * Nuovo preventivo: cliente, prodotti con la quantità (+ e −), riferimento
 * del cliente e venditore (di base chi lo crea). Prezzi, listino, imposte e
 * condizioni li calcola Odoo dal cliente, come nel browser. Creato, si apre
 * la sua scheda, dove si vedono i prezzi e si può inviare.
 *
 * Dal CRM arriva con l'opportunità e il suo cliente già scelti.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState, type ReactNode } from 'react'
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { t } from '../../i18n'
import { crea, immagineProdotto, type Prodotto } from '../../odoo/vendite'
import { Avatar } from '../../ui/Avatar'
import { CercaPersone } from '../../ui/calendario/CercaPersone'
import { importo, quantita } from '../../ui/formatoVendite'
import { Pulsante } from '../../ui/Pulsante'
import { Testata } from '../../ui/Testata'
import { raggio, spazio, useColori } from '../../ui/tema'
import { CercaProdotti } from '../../ui/vendite/CercaProdotti'
import { useApp } from '../../voip/Contesto'

type Scelta = { id: number; nome: string }
type RigaNuova = { prodotto: Prodotto; quantita: number }

export default function NuovoPreventivo() {
  const c = useColori()
  const router = useRouter()
  const param = useLocalSearchParams<{ opportunita?: string; cliente?: string; clienteNome?: string }>()
  const { sessione } = useApp()
  const server = sessione?.server || ''
  const uid = sessione?.utente.uid || 0

  const [cliente, setCliente] = useState<Scelta | null>(() => (param.cliente ? { id: Number(param.cliente), nome: param.clienteNome || '' } : null))
  const [righe, setRighe] = useState<RigaNuova[]>([])
  const [riferimento, setRiferimento] = useState('')
  const [venditore, setVenditore] = useState<Scelta | null>(() => (uid ? { id: uid, nome: sessione?.utente.name || '' } : null))
  const [persone, setPersone] = useState<'cliente' | 'venditore' | null>(null)
  const [prodotti, setProdotti] = useState(false)
  const [occupato, setOccupato] = useState(false)

  function aggiungi(p: Prodotto) {
    setProdotti(false)
    setRighe((l) => {
      const i = l.findIndex((r) => r.prodotto.id === p.id)
      return i < 0 ? [...l, { prodotto: p, quantita: 1 }] : l.map((r, j) => (j === i ? { ...r, quantita: r.quantita + 1 } : r))
    })
  }

  function cambiaQuantita(i: number, delta: number) {
    setRighe((l) => l.flatMap((r, j) => (j !== i ? [r] : r.quantita + delta <= 0 ? [] : [{ ...r, quantita: r.quantita + delta }])))
  }

  async function creaOra() {
    if (!cliente) {
      Alert.alert(t('vendite.nonCreato'), t('vendite.scegliClientePrima'))
      return
    }
    setOccupato(true)
    try {
      const id = await crea(server, {
        clienteId: cliente.id,
        venditore: venditore?.id || null,
        righe: righe.map((r) => ({ prodottoId: r.prodotto.id, quantita: r.quantita })),
        riferimento,
        opportunitaId: param.opportunita ? Number(param.opportunita) : null,
      })
      router.replace({ pathname: '/vendite/[id]', params: { id: String(id) } })
    } catch (e) {
      setOccupato(false)
      Alert.alert(t('vendite.nonCreato'), e instanceof Error ? e.message : String(e))
    }
  }

  // Indicativo: il prezzo vero (listino del cliente, sconti, imposte) lo dà Odoo creando il preventivo.
  const stima = righe.reduce((x, r) => x + r.prodotto.prezzo * r.quantita, 0)

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top', 'left', 'right']}>
      <Testata titolo={t('vendite.nuovo')} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.contenuto} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          <View style={[s.gruppo, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
            <Riga etichetta={t('vendite.cliente')} valore={cliente?.nome} vuoto={t('vendite.scegliCliente')} onPress={() => setPersone('cliente')} />
            <Riga etichetta={t('vendite.venditore')} valore={venditore?.nome} vuoto={t('vendite.nessuno')} onPress={() => setPersone('venditore')} />
            <Riga etichetta={t('vendite.riferimento')} ultima>
              <TextInput
                value={riferimento}
                onChangeText={setRiferimento}
                placeholder={t('vendite.riferimentoEsempio')}
                placeholderTextColor={c.testo3}
                style={[s.campoRiga, { color: c.testo }]}
              />
            </Riga>
          </View>

          <Text style={[s.etichetta, { color: c.testo2 }]}>{t('vendite.prodotti')}</Text>
          {righe.length ? (
            <View style={[s.gruppo, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
              {righe.map((r, i) => (
                <View key={r.prodotto.id} style={[s.prodotto, i > 0 && { borderTopColor: c.bordo, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <Avatar url={immagineProdotto(server, r.prodotto.id)} nome={r.prodotto.nome} lato={40} logo icona="cube-outline" />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.prodottoNome, { color: c.testo }]} numberOfLines={2}>
                      {r.prodotto.nome}
                    </Text>
                    <Text style={[s.sotto, { color: c.testo2 }]} numberOfLines={1}>
                      {importo(r.prodotto.prezzo, '')}
                    </Text>
                  </View>
                  <View style={s.passo}>
                    <Pressable onPress={() => cambiaQuantita(i, -1)} hitSlop={6} style={[s.passoTasto, { backgroundColor: c.superficie2 }]} accessibilityRole="button" accessibilityLabel={t('vendite.meno')}>
                      <Ionicons name={r.quantita <= 1 ? 'trash-outline' : 'remove'} size={18} color={r.quantita <= 1 ? c.rosso : c.testo} />
                    </Pressable>
                    <Text style={[s.passoNumero, { color: c.testo }]}>{quantita(r.quantita)}</Text>
                    <Pressable onPress={() => cambiaQuantita(i, 1)} hitSlop={6} style={[s.passoTasto, { backgroundColor: c.primarioTenue }]} accessibilityRole="button" accessibilityLabel={t('vendite.piu')}>
                      <Ionicons name="add" size={18} color={c.primario} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[s.sotto, { color: c.testo3 }]}>{t('vendite.nessunaRigaNuovo')}</Text>
          )}
          <Pulsante testo={t('vendite.aggiungiProdotto')} variante="tenue" onPress={() => setProdotti(true)} />
          {stima ? <Text style={[s.stima, { color: c.testo2 }]}>{t('vendite.stima', { importo: importo(stima, '') })}</Text> : null}

          <View style={{ height: spazio.m }} />
          <Pulsante testo={t('vendite.crea')} occupato={occupato} onPress={() => void creaOra()} />
        </ScrollView>
      </KeyboardAvoidingView>

      <CercaPersone
        aperto={persone !== null}
        server={server}
        tipo={persone === 'cliente' ? 'invitati' : 'organizzatore'}
        titolo={persone === 'cliente' ? t('vendite.cliente') : t('vendite.venditore')}
        singolo
        scelti={[]}
        chiudi={() => setPersone(null)}
        tocca={(p) => {
          if (persone === 'cliente') {
            setCliente({ id: p.id, nome: p.nome })
          } else {
            setVenditore({ id: p.id, nome: p.nome })
          }
          setPersone(null)
        }}
      />

      <CercaProdotti aperto={prodotti} server={server} valuta="" chiudi={() => setProdotti(false)} scegli={aggiungi} />
    </SafeAreaView>
  )
}

function Riga({ etichetta, valore, vuoto, onPress, ultima, children }: { etichetta: string; valore?: string; vuoto?: string; onPress?: () => void; ultima?: boolean; children?: ReactNode }) {
  const c = useColori()
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[s.riga, !ultima && { borderBottomColor: c.bordo, borderBottomWidth: StyleSheet.hairlineWidth }]}
      accessibilityRole={onPress ? 'button' : undefined}
    >
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
  etichetta: { fontSize: 14, fontWeight: '600', marginTop: spazio.m },
  gruppo: { borderRadius: raggio.l, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: spazio.m },
  riga: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, minHeight: 52 },
  rigaEtichetta: { fontSize: 16, flexShrink: 0 },
  rigaValore: { fontSize: 16, fontWeight: '600' },
  campoRiga: { fontSize: 16, fontWeight: '600', textAlign: 'right', alignSelf: 'stretch', paddingVertical: 10 },
  prodotto: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, paddingVertical: spazio.s },
  prodottoNome: { fontSize: 15, fontWeight: '600' },
  sotto: { fontSize: 14 },
  passo: { flexDirection: 'row', alignItems: 'center', gap: spazio.s },
  passoTasto: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  passoNumero: { fontSize: 16, fontWeight: '700', minWidth: 26, textAlign: 'center' },
  stima: { fontSize: 13, textAlign: 'center' },
})
