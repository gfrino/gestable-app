/**
 * Mostra una schermata nativa solo se l'app di Odoo che le serve c'e'.
 *
 * Senza (non installata, o non per questo utente) spiega cosa fare: chiedere
 * all'amministratore del proprio Odoo. Chi e' entrato con Google o Microsoft
 * dalla pagina di Odoo ha la sessione solo dentro la vista Odoo: per le
 * schermate dell'app serve l'accesso con email e password.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { menuOdoo } from '../odoo/capacita'
import { ErroreOdoo } from '../odoo/client'
import { useApp } from '../voip/Contesto'
import { PulsanteMenu } from './MenuLaterale'
import { Pulsante } from './Pulsante'
import { raggio, spazio, useColori } from './tema'

type Props = {
  /** xmlid del menu dell'app in Odoo; senza, basta l'accesso con email e password. */
  xmlid?: string
  /** Nome dell'app come lo vede l'utente in Odoo («Calendario»). */
  app: string
  titolo: string
  icona: keyof typeof Ionicons.glyphMap
  children: ReactNode
}

type Stato = 'controllo' | 'ok' | 'manca' | 'accesso'

export function RichiedeApp({ xmlid, app, titolo, icona, children }: Props) {
  const { sessione, esci } = useApp()
  const server = sessione?.server || ''
  const nativo = !!sessione?.utente.uid
  const [stato, setStato] = useState<Stato>(nativo && xmlid ? 'controllo' : nativo ? 'ok' : 'accesso')
  // Mancava: tornando sulla scheda si richiede a Odoo, senza la copia in memoria.
  const mancava = useRef(false)

  // Si ricontrolla tornando sulla scheda: l'amministratore puo' averla appena installata.
  useFocusEffect(
    useCallback(() => {
      if (!nativo) {
        setStato('accesso')
        return
      }
      if (!xmlid) {
        setStato('ok')
        return
      }
      let vivo = true
      menuOdoo(server, mancava.current)
        .then((m) => {
          mancava.current = !!m && !m.has(xmlid)
          if (vivo) {
            setStato(mancava.current ? 'manca' : 'ok')
          }
        })
        .catch((e: unknown) => vivo && setStato(e instanceof ErroreOdoo && e.tipo === 'sessione' ? 'accesso' : 'ok'))
      return () => {
        vivo = false
      }
    }, [server, nativo, xmlid]),
  )

  if (stato === 'ok') {
    return <>{children}</>
  }
  return (
    <Avviso
      titolo={titolo}
      icona={icona}
      stato={stato}
      app={app}
      server={server}
      esci={() => void esci()}
    />
  )
}

function Avviso({
  titolo,
  icona,
  stato,
  app,
  server,
  esci,
}: {
  titolo: string
  icona: keyof typeof Ionicons.glyphMap
  stato: Stato
  app: string
  server: string
  esci: () => void
}) {
  const c = useColori()
  const router = useRouter()
  const indirizzo = server.replace(/^https?:\/\//, '')
  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top']}>
      <View style={s.testa}>
        <PulsanteMenu />
        <Text style={[s.titolo, { color: c.testo }]} numberOfLines={1}>
          {titolo}
        </Text>
      </View>
      {stato === 'controllo' ? (
        <ActivityIndicator style={{ marginTop: spazio.xxl }} color={c.primario} />
      ) : (
        <View style={s.centro}>
          <View style={[s.cerchio, { backgroundColor: c.primarioTenue }]}>
            <Ionicons name={icona} size={40} color={c.primario} />
          </View>
          {stato === 'manca' ? (
            <>
              <Text style={[s.grande, { color: c.testo }]}>{app} non è attivo</Text>
              <Text style={[s.testo, { color: c.testo2 }]}>
                In questo Odoo ({indirizzo}) l&apos;app {app} non è installata, oppure il tuo utente non la può usare.
              </Text>
              <View style={[s.riquadro, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
                <Ionicons name="person-circle-outline" size={22} color={c.primario} />
                <Text style={[s.riquadroTesto, { color: c.testo }]}>
                  Chiedi all&apos;amministratore del tuo Odoo di installare l&apos;app {app} e di darti l&apos;accesso.
                  Poi torna qui: la scheda si attiva da sola.
                </Text>
              </View>
              <View style={s.pulsanti}>
                <Pulsante testo="Apri Odoo" variante="tenue" onPress={() => router.navigate('/(tabs)/odoo')} />
              </View>
            </>
          ) : (
            <>
              <Text style={[s.grande, { color: c.testo }]}>Serve l&apos;accesso con email</Text>
              <Text style={[s.testo, { color: c.testo2 }]}>
                Sei entrato dalla pagina di Odoo (per esempio con Google o Microsoft). {titolo} nell&apos;app funziona
                con l&apos;accesso con email e password di Odoo.
              </Text>
              <View style={s.pulsanti}>
                <Pulsante testo="Accedi con email" onPress={esci} />
                <Pulsante testo="Apri Odoo" variante="tenue" onPress={() => router.navigate('/(tabs)/odoo')} />
              </View>
            </>
          )}
        </View>
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1 },
  testa: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, paddingHorizontal: spazio.m, paddingVertical: spazio.s },
  titolo: { flex: 1, fontSize: 30, fontWeight: '800', letterSpacing: -0.3 },
  centro: { flex: 1, alignItems: 'center', paddingHorizontal: spazio.xl, paddingTop: spazio.xxl, gap: spazio.m },
  cerchio: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: spazio.s },
  grande: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  testo: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  riquadro: {
    flexDirection: 'row',
    gap: spazio.m,
    padding: spazio.l,
    borderRadius: raggio.l,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spazio.s,
  },
  riquadroTesto: { flex: 1, fontSize: 15, lineHeight: 21 },
  pulsanti: { alignSelf: 'stretch', gap: spazio.s, marginTop: spazio.l },
})
