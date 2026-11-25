/**
 * Odoo dentro l'app, come nell'app desktop.
 *
 * Il cookie di sessione e' quello del login dell'app: iOS e Android lo
 * condividono fra le chiamate dell'app e la vista web, quindi chi e' entrato
 * con email e password trova Odoo gia' aperto. Senza VOIP AI l'accesso lo fa
 * invece la pagina di login di Odoo (database, doppio fattore e accesso con
 * Google compresi).
 *
 * La barra in alto di Odoo non c'e': presenze, chat e attivita' stanno nel
 * menu dell'app (☰), il pannello di Odoo (sottomenu dell'app e utente) si apre
 * dal pulsante a destra, e la home e' la griglia delle app (tasto Odoo in
 * basso). Vedi odooIniettato.ts.
 *
 * I numeri di telefono cliccati in Odoo partono dal softphone quando c'e',
 * altrimenti dal telefono del sistema. I link verso altri siti si aprono nel
 * browser: dentro l'app non ci sarebbe modo di tornare indietro.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView, type WebViewNavigation } from 'react-native-webview'
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes'
import { t } from '../i18n'
import { ascoltaOdoo, prendiInAttesa, type ComandoOdoo } from './comandiOdoo'
import { PulsanteMenu } from './MenuLaterale'
import { APRI_PANNELLO, dopoIlCaricamento, MOSTRA_HOME, PRIMA_DEL_CARICAMENTO, vaiA } from './odooIniettato'
import { Pulsante } from './Pulsante'
import { spazio, useColori } from './tema'

// Siti di accesso che devono restare dentro l'app, altrimenti il login con
// Google o Microsoft finirebbe nel browser e Odoo non lo saprebbe mai.
const ACCESSO_ESTERNO = ['accounts.google.com', 'login.microsoftonline.com', 'appleid.apple.com']

function origine(url: string): string {
  const m = /^(https?:\/\/[^/?#]+)/i.exec(url)
  return m ? m[1].toLowerCase() : ''
}

function host(url: string): string {
  return origine(url).replace(/^https?:\/\//, '')
}

type Props = {
  server: string
  /** Titolo della barra: il nome dell'azienda, se si conosce. */
  titolo?: string
  /** Chi chiama i numeri cliccati; senza, si usa il telefono del sistema. */
  chiama?: (numero: string) => void
}

export function VistaOdoo({ server, titolo, chiama }: Props) {
  const c = useColori()
  const vista = useRef<WebView>(null)
  const indietro = useRef(false)
  const pronta = useRef(false)
  const base = origine(server)
  // Un record chiesto prima che la vista esistesse (da un'attivita'): si apre
  // quello invece della home.
  const [iniziale] = useState(() => {
    const c0 = prendiInAttesa()
    return c0?.tipo === 'apri' ? c0.percorso : ''
  })
  const homeAlCaricamento = useRef(!iniziale)
  // Un record chiesto mentre la pagina carica: si apre appena e' pronta.
  const recordInAttesa = useRef('')
  const [errore, setErrore] = useState(false)
  const [chiave, setChiave] = useState(0)
  const [nelLogin, setNelLogin] = useState(false)

  // Comandi dal resto dell'app: home (tasto Odoo) o apri un record.
  useEffect(
    () =>
      ascoltaOdoo((comando: ComandoOdoo) => {
        if (!pronta.current) {
          if (comando.tipo === 'home') {
            homeAlCaricamento.current = true
            recordInAttesa.current = ''
          } else {
            recordInAttesa.current = comando.percorso
            homeAlCaricamento.current = false
          }
          return
        }
        vista.current?.injectJavaScript(comando.tipo === 'home' ? MOSTRA_HOME : vaiA(comando.percorso))
      }),
    [],
  )

  // Android: il tasto indietro torna alla pagina precedente di Odoo, non
  // chiude l'app.
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') {
        return
      }
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (indietro.current) {
          vista.current?.goBack()
          return true
        }
        return false
      })
      return () => sub.remove()
    }, []),
  )

  function apriFuori(url: string) {
    Linking.openURL(url).catch(() => Alert.alert(t('accesso.link'), t('accesso.linkNonApribile')))
  }

  function decidi(r: ShouldStartLoadRequest): boolean {
    const url = r.url
    if (/^tel:/i.test(url)) {
      const numero = decodeURIComponent(url.replace(/^tel:/i, '')).trim()
      if (chiama) {
        chiama(numero)
      } else {
        apriFuori(url)
      }
      return false
    }
    if (/^(about|blob|data|javascript):/i.test(url) || r.isTopFrame === false) {
      return true
    }
    if (!/^https?:/i.test(url)) {
      // mailto:, sms:, maps:, whatsapp: ... li apre l'app del sistema.
      apriFuori(url)
      return false
    }
    if (origine(url) === base || ACCESSO_ESTERNO.includes(host(url))) {
      return true
    }
    apriFuori(url)
    return false
  }

  function ricarica() {
    setErrore(false)
    if (vista.current) {
      vista.current.reload()
    } else {
      setChiave((k) => k + 1)
    }
  }

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.superficie }]} edges={['top']}>
      <View style={[s.barra, { borderBottomColor: c.bordo }]}>
        <PulsanteMenu />
        <Text style={[s.titolo, { color: c.testo }]} numberOfLines={1}>
          {titolo || host(server)}
        </Text>
        <Pressable onPress={ricarica} hitSlop={10} style={s.tasto} accessibilityRole="button" accessibilityLabel={t('accesso.ricaricaOdoo')}>
          <Ionicons name="refresh" size={22} color={c.testo2} />
        </Pressable>
        {!nelLogin ? (
          <Pressable
            onPress={() => vista.current?.injectJavaScript(APRI_PANNELLO)}
            hitSlop={10}
            style={s.tasto}
            accessibilityRole="button"
            accessibilityLabel={t('accesso.menuOdoo')}
          >
            <Ionicons name="reorder-three-outline" size={26} color={c.testo} />
          </Pressable>
        ) : null}
      </View>

      {errore ? (
        <View style={[s.errore, { backgroundColor: c.sfondo }]}>
          <Ionicons name="cloud-offline-outline" size={44} color={c.testo3} />
          <Text style={[s.erroreTesto, { color: c.testo2 }]}>{t('accesso.odooNonSiApre')}</Text>
          <Pulsante testo={t('comune.riprova')} onPress={ricarica} />
        </View>
      ) : (
        <WebView
          key={chiave}
          ref={vista}
          source={{ uri: `${base}${iniziale || '/web'}` }}
          style={{ flex: 1, backgroundColor: c.sfondo }}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          domStorageEnabled
          javaScriptEnabled
          setSupportMultipleWindows={false}
          allowsBackForwardNavigationGestures
          allowsInlineMediaPlayback
          applicationNameForUserAgent="GestaVOIP"
          originWhitelist={['*']}
          injectedJavaScriptBeforeContentLoaded={PRIMA_DEL_CARICAMENTO}
          injectedJavaScript={dopoIlCaricamento()}
          // Su iOS lo script dopo il caricamento parte solo se la vista ha anche
          // un ricevitore di messaggi: questo, che per ora non riceve nulla.
          onMessage={() => undefined}
          onShouldStartLoadWithRequest={decidi}
          onNavigationStateChange={(n: WebViewNavigation) => {
            indietro.current = n.canGoBack
            setNelLogin(/\/web\/login|\/login\b/.test(n.url))
          }}
          onLoadEnd={() => {
            pronta.current = true
            // Alla prima apertura si parte dalla home; «Ricarica» resta dov'e'.
            if (recordInAttesa.current) {
              const percorso = recordInAttesa.current
              recordInAttesa.current = ''
              vista.current?.injectJavaScript(vaiA(percorso))
            } else if (homeAlCaricamento.current) {
              homeAlCaricamento.current = false
              vista.current?.injectJavaScript(MOSTRA_HOME)
            }
          }}
          onLoadStart={() => {
            pronta.current = false
          }}
          startInLoadingState
          renderLoading={() => (
            <View style={[StyleSheet.absoluteFill, s.carica, { backgroundColor: c.sfondo }]}>
              <ActivityIndicator color={c.primario} />
            </View>
          )}
          onError={() => setErrore(true)}
          // iOS chiude la vista web se resta in secondo piano a lungo: si
          // ricarica invece di lasciare una pagina bianca.
          onContentProcessDidTerminate={() => vista.current?.reload()}
          onRenderProcessGone={() => setChiave((k) => k + 1)}
        />
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1 },
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spazio.xs,
    paddingHorizontal: spazio.s,
    paddingVertical: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titolo: { flex: 1, fontSize: 17, fontWeight: '700', marginLeft: spazio.xs },
  tasto: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  carica: { alignItems: 'center', justifyContent: 'center' },
  errore: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spazio.l, padding: spazio.xl },
  erroreTesto: { fontSize: 16, textAlign: 'center' },
})
