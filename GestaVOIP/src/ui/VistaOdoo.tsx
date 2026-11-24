/**
 * Odoo dentro l'app, come nell'app desktop.
 *
 * Il cookie di sessione e' quello del login dell'app: iOS e Android lo
 * condividono fra le chiamate dell'app e la vista web, quindi chi e' entrato
 * con email e password trova Odoo gia' aperto. Senza VOIP AI l'accesso lo fa
 * invece la pagina di login di Odoo (database, doppio fattore e accesso con
 * Google compresi).
 *
 * I numeri di telefono cliccati in Odoo partono dal softphone quando c'e',
 * altrimenti dal telefono del sistema. I link verso altri siti si aprono nel
 * browser: dentro l'app non ci sarebbe modo di tornare indietro.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { ActivityIndicator, Alert, BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView, type WebViewNavigation } from 'react-native-webview'
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes'
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
  /** Se c'e', la barra mostra il tasto per uscire e cambiare server. */
  esci?: () => void
}

export function VistaOdoo({ server, titolo, chiama, esci }: Props) {
  const c = useColori()
  const vista = useRef<WebView>(null)
  const indietro = useRef(false)
  const [errore, setErrore] = useState('')
  const [chiave, setChiave] = useState(0)
  const base = origine(server)

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
    Linking.openURL(url).catch(() => Alert.alert('Link', 'Nessuna app sa aprire questo link.'))
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
    setErrore('')
    if (vista.current) {
      vista.current.reload()
    } else {
      setChiave((k) => k + 1)
    }
  }

  function chiediUscita() {
    if (!esci) {
      return
    }
    Alert.alert('Uscire?', "Esci da Odoo su questo telefono. Per rientrare servono di nuovo l'indirizzo e l'accesso.", [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Esci', style: 'destructive', onPress: esci },
    ])
  }

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.superficie }]} edges={['top']}>
      <View style={[s.barra, { borderBottomColor: c.bordo }]}>
        <Text style={[s.titolo, { color: c.testo }]} numberOfLines={1}>
          {titolo || host(server)}
        </Text>
        <Pressable onPress={ricarica} hitSlop={12} style={s.tasto} accessibilityRole="button" accessibilityLabel="Ricarica Odoo">
          <Ionicons name="refresh" size={22} color={c.testo2} />
        </Pressable>
        {esci ? (
          <Pressable onPress={chiediUscita} hitSlop={12} style={s.tasto} accessibilityRole="button" accessibilityLabel="Esci e cambia server">
            <Ionicons name="log-out-outline" size={22} color={c.testo2} />
          </Pressable>
        ) : null}
      </View>

      {errore ? (
        <View style={[s.errore, { backgroundColor: c.sfondo }]}>
          <Ionicons name="cloud-offline-outline" size={44} color={c.testo3} />
          <Text style={[s.erroreTesto, { color: c.testo2 }]}>{errore}</Text>
          <Pulsante testo="Riprova" onPress={ricarica} />
        </View>
      ) : (
        <WebView
          key={chiave}
          ref={vista}
          source={{ uri: `${base}/web` }}
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
          onShouldStartLoadWithRequest={decidi}
          onNavigationStateChange={(n: WebViewNavigation) => {
            indietro.current = n.canGoBack
          }}
          startInLoadingState
          renderLoading={() => (
            <View style={[StyleSheet.absoluteFill, s.carica, { backgroundColor: c.sfondo }]}>
              <ActivityIndicator color={c.primario} />
            </View>
          )}
          onError={() => setErrore("Odoo non si apre: controlla la connessione a internet.")}
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
    gap: spazio.l,
    paddingHorizontal: spazio.l,
    paddingVertical: spazio.s,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titolo: { flex: 1, fontSize: 16, fontWeight: '600' },
  tasto: { padding: 4 },
  carica: { alignItems: 'center', justifyContent: 'center' },
  errore: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spazio.l, padding: spazio.xl },
  erroreTesto: { fontSize: 16, textAlign: 'center' },
})
