/** Disponibilita', centralino, account. Le stesse leve del softphone in Odoo. */

import * as Application from 'expo-application'
import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { preferenze, type Preferenze } from '../../voip/api'
import { useApp, useTelefono } from '../../voip/Contesto'
import { telefono } from '../../voip/telefono'
import { Pulsante } from '../../ui/Pulsante'
import { raggio, spazio, useColori, type Colori } from '../../ui/tema'

function Riga({ titolo, testo, children, c }: { titolo: string; testo?: string; children?: React.ReactNode; c: Colori }) {
  return (
    <View style={s.riga}>
      <View style={{ flex: 1 }}>
        <Text style={[s.rigaTitolo, { color: c.testo }]}>{titolo}</Text>
        {testo ? <Text style={[s.rigaTesto, { color: c.testo2 }]}>{testo}</Text> : null}
      </View>
      {children}
    </View>
  )
}

export default function Impostazioni() {
  const c = useColori()
  const { sessione, esci } = useApp()
  const { disponibile } = useTelefono()
  const [pref, setPref] = useState<Preferenze | null>(null)
  const [uscita, setUscita] = useState(false)

  useFocusEffect(
    useCallback(() => {
      if (sessione) {
        preferenze(sessione.server).then(setPref).catch(() => setPref(null))
      }
    }, [sessione]),
  )

  async function centralino(valore: boolean) {
    if (!sessione) {
      return
    }
    try {
      const r = await preferenze(sessione.server, { inbound_ring: valore })
      setPref(r)
    } catch (e) {
      // L'ultimo del centralino non puo' togliersi: il server spiega perche'.
      Alert.alert('Centralino', e instanceof Error ? e.message : String(e))
    }
  }

  async function disponibilita(valore: boolean) {
    try {
      await telefono.impostaDisponibile(valore)
    } catch (e) {
      Alert.alert('Disponibilita', e instanceof Error ? e.message : String(e))
    }
  }

  function chiediUscita() {
    Alert.alert('Uscire da GestaVOIP?', 'Il telefono smette di squillare finche\' non rientri.', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Esci',
        style: 'destructive',
        onPress: async () => {
          setUscita(true)
          await esci()
        },
      },
    ])
  }

  const scheda = [s.scheda, { backgroundColor: c.superficie, borderColor: c.bordo }]

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top']}>
      <ScrollView contentContainerStyle={s.contenuto}>
        <Text style={[s.titolo, { color: c.testo }]}>Impostazioni</Text>

        <View style={scheda}>
          <Riga
            c={c}
            titolo="Disponibile"
            testo={disponibile ? 'Le chiamate squillano su questo telefono.' : 'Questo telefono non squilla.'}
          >
            <Switch value={disponibile} onValueChange={disponibilita} trackColor={{ true: c.verde }} />
          </Riga>
          <View style={[s.sep, { backgroundColor: c.bordo }]} />
          <Riga
            c={c}
            titolo="Ricevo le chiamate del centralino"
            testo="Spento: ti chiamano solo sul tuo interno o numero diretto."
          >
            <Switch
              value={!!pref?.inbound_ring}
              onValueChange={centralino}
              disabled={!pref}
              trackColor={{ true: c.primario }}
            />
          </Riga>
        </View>

        <View style={scheda}>
          <Riga c={c} titolo="Interno" testo={pref?.extension || '-'} />
          <View style={[s.sep, { backgroundColor: c.bordo }]} />
          <Riga c={c} titolo="Numero diretto" testo={pref?.direct_number || 'Nessuno'} />
        </View>

        <View style={scheda}>
          <Riga c={c} titolo={sessione?.utente.name || ''} testo={sessione?.utente.login} />
          <View style={[s.sep, { backgroundColor: c.bordo }]} />
          <Riga
            c={c}
            titolo={sessione?.azienda || sessione?.db || ''}
            testo={sessione?.server.replace(/^https?:\/\//, '')}
          />
        </View>

        <Pulsante testo="Esci" variante="pericolo" onPress={chiediUscita} occupato={uscita} />
        <Text style={[s.versione, { color: c.testo3 }]}>
          GestaVOIP {Application.nativeApplicationVersion || ''} ({Application.nativeBuildVersion || ''})
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1 },
  contenuto: { padding: spazio.xl, gap: spazio.l },
  titolo: { fontSize: 30, fontWeight: '700' },
  scheda: { borderWidth: StyleSheet.hairlineWidth, borderRadius: raggio.l, overflow: 'hidden' },
  riga: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, padding: spazio.l, minHeight: 60 },
  rigaTitolo: { fontSize: 16, fontWeight: '600' },
  rigaTesto: { fontSize: 13, marginTop: 2 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: spazio.l },
  versione: { textAlign: 'center', fontSize: 12, marginTop: spazio.s },
})
