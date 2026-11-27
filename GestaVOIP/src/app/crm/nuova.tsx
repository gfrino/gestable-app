/**
 * Nuova opportunità: nome, cliente, ricavo atteso, venditore (di base chi la
 * crea), chiusura prevista e note. Team e fase li sceglie Odoo come nel
 * browser. Creata, si apre la sua scheda.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useRouter } from 'expo-router'
import { useState, type ReactNode } from 'react'
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { t } from '../../i18n'
import { crea } from '../../odoo/crm'
import { CercaPersone } from '../../ui/calendario/CercaPersone'
import { SceltaGiorno } from '../../ui/calendario/Selettori'
import { data, giornoIso, leggiImporto } from '../../ui/formatoCrm'
import { Pulsante } from '../../ui/Pulsante'
import { Testata } from '../../ui/Testata'
import { raggio, spazio, useColori } from '../../ui/tema'
import { useApp } from '../../voip/Contesto'

type Scelta = { id: number; nome: string }

export default function NuovaOpportunita() {
  const c = useColori()
  const router = useRouter()
  const { sessione } = useApp()
  const server = sessione?.server || ''
  const uid = sessione?.utente.uid || 0

  const [nome, setNome] = useState('')
  const [cliente, setCliente] = useState<Scelta | null>(null)
  const [ricavo, setRicavo] = useState('')
  const [venditore, setVenditore] = useState<Scelta | null>(() => (uid ? { id: uid, nome: sessione?.utente.name || '' } : null))
  const [chiusura, setChiusura] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [persone, setPersone] = useState<'cliente' | 'venditore' | null>(null)
  const [sceltaGiorno, setSceltaGiorno] = useState(false)
  const [occupato, setOccupato] = useState(false)

  async function creaOra() {
    if (!nome.trim()) {
      Alert.alert(t('crm.nonCreata'), t('crm.scriviNome'))
      return
    }
    const importo = ricavo.trim() ? leggiImporto(ricavo) : 0
    setOccupato(true)
    try {
      const id = await crea(server, {
        nome,
        clienteId: cliente?.id || null,
        importo: Number.isNaN(importo) ? 0 : importo,
        venditore: venditore?.id || null,
        chiusura,
        descrizione: note,
      })
      router.replace({ pathname: '/crm/[id]', params: { id: String(id) } })
    } catch (e) {
      setOccupato(false)
      Alert.alert(t('crm.nonCreata'), e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top', 'left', 'right']}>
      <Testata titolo={t('crm.nuova')} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.contenuto} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          <Text style={[s.etichetta, { color: c.testo2 }]}>{t('crm.nomeOpportunita')}</Text>
          <TextInput
            value={nome}
            onChangeText={setNome}
            placeholder={t('crm.nomeEsempio')}
            placeholderTextColor={c.testo3}
            autoFocus
            style={[s.input, { color: c.testo, backgroundColor: c.superficie, borderColor: c.bordo }]}
          />

          <View style={[s.gruppo, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
            <Riga etichetta={t('crm.cliente')} valore={cliente?.nome} vuoto={t('crm.scegliCliente')} onPress={() => setPersone('cliente')} />
            <Riga etichetta={t('crm.ricavo')}>
              <TextInput
                value={ricavo}
                onChangeText={setRicavo}
                placeholder={t('crm.ricavoEsempio')}
                placeholderTextColor={c.testo3}
                keyboardType="decimal-pad"
                style={[s.ricavo, { color: c.testo }]}
              />
            </Riga>
            <Riga etichetta={t('crm.venditore')} valore={venditore?.nome} vuoto={t('crm.nessuno')} onPress={() => setPersone('venditore')} />
            <Riga etichetta={t('crm.chiusura')} valore={chiusura ? data(chiusura) : ''} vuoto={t('crm.nessuna')} onPress={() => setSceltaGiorno(true)} ultima />
          </View>

          <Text style={[s.etichetta, { color: c.testo2 }]}>{t('crm.note')}</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={t('crm.noteEsempio')}
            placeholderTextColor={c.testo3}
            multiline
            style={[s.input, s.area, { color: c.testo, backgroundColor: c.superficie, borderColor: c.bordo }]}
          />

          <Pulsante testo={t('crm.crea')} occupato={occupato} onPress={() => void creaOra()} />
        </ScrollView>
      </KeyboardAvoidingView>

      <CercaPersone
        aperto={persone !== null}
        server={server}
        tipo={persone === 'cliente' ? 'invitati' : 'organizzatore'}
        titolo={persone === 'cliente' ? t('crm.cliente') : t('crm.venditore')}
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

      <SceltaGiorno
        aperto={sceltaGiorno}
        titolo={t('crm.chiusura')}
        valore={chiusura ? new Date(`${chiusura}T12:00:00`) : new Date()}
        chiudi={() => setSceltaGiorno(false)}
        scegli={(d) => {
          setChiusura(giornoIso(d))
          setSceltaGiorno(false)
        }}
      />
    </SafeAreaView>
  )
}

function Riga({
  etichetta,
  valore,
  vuoto,
  onPress,
  ultima,
  children,
}: {
  etichetta: string
  valore?: string
  vuoto?: string
  onPress?: () => void
  ultima?: boolean
  children?: ReactNode
}) {
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
  etichetta: { fontSize: 14, fontWeight: '600', marginTop: spazio.s },
  input: { fontSize: 17, padding: spazio.m, borderRadius: raggio.m, borderWidth: StyleSheet.hairlineWidth },
  area: { minHeight: 120, textAlignVertical: 'top' },
  gruppo: { borderRadius: raggio.l, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: spazio.m, marginTop: spazio.m },
  riga: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, minHeight: 52 },
  rigaEtichetta: { fontSize: 16, width: 130 },
  rigaValore: { fontSize: 16, fontWeight: '600' },
  ricavo: { fontSize: 16, fontWeight: '600', textAlign: 'right', minWidth: 120, paddingVertical: 10 },
})
