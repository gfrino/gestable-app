/**
 * Accesso in due passi: prima l'indirizzo di Odoo, poi email e password (e il
 * codice, per chi ha la verifica in due passaggi attiva in Odoo).
 *
 * Il primo passo verifica subito il server e mostra il nome dell'azienda:
 * chi sbaglia indirizzo lo vede prima di digitare la password, non dopo.
 */

import { useState } from 'react'
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { t } from '../i18n'
import { ErroreOdoo, normalizzaIndirizzo, type InfoServer } from '../odoo/client'
import { useApp } from '../voip/Contesto'
import { raggio, spazio, useColori } from '../ui/tema'
import { Pulsante } from '../ui/Pulsante'
import { Caricamento } from '../ui/Caricamento'

export default function Login() {
  const c = useColori()
  const { verificaServer, entra, entraConCodice, entraSoloOdoo } = useApp()
  const [indirizzo, setIndirizzo] = useState('')
  const [server, setServer] = useState('')
  const [info, setInfo] = useState<InfoServer | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Password giusta, Odoo aspetta il codice della verifica in due passaggi.
  const [chiediCodice, setChiediCodice] = useState(false)
  const [codice, setCodice] = useState('')
  const [occupato, setOccupato] = useState(false)
  const [errore, setErrore] = useState('')

  async function verifica() {
    const url = normalizzaIndirizzo(indirizzo)
    if (!url) {
      setErrore(t('accesso.scriviIndirizzo'))
      return
    }
    setOccupato(true)
    setErrore('')
    try {
      setInfo(await verificaServer(url))
      setServer(url)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e))
    } finally {
      setOccupato(false)
    }
  }

  async function accedi() {
    if (!info || !email.trim() || !password) {
      setErrore(t('accesso.scriviEmailPassword'))
      return
    }
    setOccupato(true)
    setErrore('')
    try {
      await entra(server, info, email, password)
    } catch (e) {
      if (e instanceof ErroreOdoo && e.tipo === 'codice') {
        setChiediCodice(true)
      } else {
        setErrore(e instanceof Error ? e.message : String(e))
      }
      setOccupato(false)
    }
  }

  async function confermaCodice() {
    if (!info || !codice.trim()) {
      setErrore(t('accesso.scriviCodice'))
      return
    }
    setOccupato(true)
    setErrore('')
    try {
      await entraConCodice(server, info, codice)
    } catch (e) {
      setCodice('')
      if (e instanceof ErroreOdoo && e.tipo === 'sessione') {
        // Troppo tempo fra password e codice: si riparte dalla password.
        setChiediCodice(false)
        setPassword('')
      }
      setErrore(e instanceof Error ? e.message : String(e))
      setOccupato(false)
    }
  }

  function annullaCodice() {
    setChiediCodice(false)
    setCodice('')
    setPassword('')
    setErrore('')
  }

  async function apriOdoo() {
    setOccupato(true)
    await entraSoloOdoo(server)
  }

  const cambiaServer = (
    <Pressable
      onPress={() => {
        setInfo(null)
        setPassword('')
        setChiediCodice(false)
        setCodice('')
        setErrore('')
      }}
      style={[s.server, { backgroundColor: c.primarioTenue }]}
      accessibilityRole="button"
      accessibilityLabel={t('accesso.cambiaServer')}
    >
      <Text style={[s.serverNome, { color: c.primario }]} numberOfLines={1}>
        {info?.company || info?.db || server.replace(/^https?:\/\//, '')}
      </Text>
      <Text style={[s.serverUrl, { color: c.testo2 }]} numberOfLines={1}>
        {info?.company || info?.db
          ? t('accesso.indirizzoCambia', { indirizzo: server.replace(/^https?:\/\//, '') })
          : t('accesso.cambiaIndirizzo')}
      </Text>
    </Pressable>
  )

  const campo = [s.campo, { backgroundColor: c.superficie, borderColor: c.bordo, color: c.testo }]

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.contenuto} keyboardShouldPersistTaps="handled">
          <Image source={require('../../assets/logo-gestable.png')} style={s.logo} resizeMode="contain" accessibilityIgnoresInvertColors />
          <Text style={[s.titolo, { color: c.testo }]}>GestaVOIP</Text>
          <Text style={[s.sottotitolo, { color: c.testo2 }]}>{t('accesso.sottotitolo')}</Text>

          {!info ? (
            <View style={s.blocco}>
              <Text style={[s.etichetta, { color: c.testo2 }]}>{t('accesso.indirizzoOdoo')}</Text>
              <TextInput
                style={campo}
                value={indirizzo}
                onChangeText={setIndirizzo}
                placeholder={t('accesso.indirizzoEsempio')}
                placeholderTextColor={c.testo3}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="next"
                onSubmitEditing={verifica}
              />
              <Pulsante testo={t('accesso.continua')} onPress={verifica} occupato={occupato} />
            </View>
          ) : chiediCodice ? (
            <View style={s.blocco}>
              {cambiaServer}
              <View style={[s.nota, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
                <Text style={[s.notaTitolo, { color: c.testo }]}>{t('accesso.dueFattori')}</Text>
                <Text style={[s.notaTesto, { color: c.testo2 }]}>{t('accesso.dueFattoriTesto')}</Text>
              </View>
              <Text style={[s.etichetta, { color: c.testo2 }]}>{t('accesso.codice')}</Text>
              <TextInput
                style={[campo, s.codice]}
                value={codice}
                onChangeText={setCodice}
                placeholder="123456"
                placeholderTextColor={c.testo3}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={8}
                autoFocus
                returnKeyType="go"
                onSubmitEditing={confermaCodice}
              />
              <Pulsante testo={t('accesso.conferma')} onPress={confermaCodice} occupato={occupato} />
              <Pressable onPress={annullaCodice} hitSlop={8} style={s.indietro} accessibilityRole="button">
                <Text style={[s.indietroTesto, { color: c.primario }]} numberOfLines={1}>
                  {t('accesso.tornaPassword')}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={s.blocco}>
              {cambiaServer}
              {!info.voip ? (
                <View style={[s.nota, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
                  <Text style={[s.notaTitolo, { color: c.testo }]}>{t('accesso.senzaTelefono')}</Text>
                  <Text style={[s.notaTesto, { color: c.testo2 }]}>{t('accesso.senzaTelefonoTesto')}</Text>
                </View>
              ) : null}
              <Text style={[s.etichetta, { color: c.testo2 }]}>{t('accesso.email')}</Text>
              <TextInput
                style={campo}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="username"
                autoComplete="email"
                returnKeyType="next"
              />
              <Text style={[s.etichetta, { color: c.testo2 }]}>{t('accesso.password')}</Text>
              <TextInput
                style={campo}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textContentType="password"
                autoComplete="password"
                returnKeyType="go"
                onSubmitEditing={accedi}
              />
              <Pulsante testo={t('accesso.accedi')} onPress={accedi} occupato={occupato} />
              {!info.voip ? (
                // Chi entra con Google o Microsoft non ha una password di Odoo:
                // entra dalla pagina di Odoo (le schede dell'app chiedono poi
                // l'accesso con email e password).
                <Pressable onPress={apriOdoo} hitSlop={8} style={s.indietro} accessibilityRole="button">
                  <Text style={[s.indietroTesto, { color: c.primario }]} numberOfLines={1}>
                    {t('accesso.accediGoogle')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}

          {errore ? (
            <View style={[s.errore, { backgroundColor: c.rossoTenue }]}>
              <Text style={{ color: c.rosso }}>{errore}</Text>
            </View>
          ) : null}
          {occupato && !info ? <Caricamento dimensione={44} style={{ marginTop: spazio.l }} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1 },
  contenuto: { padding: spazio.xl, paddingTop: spazio.xxl * 2, gap: spazio.s },
  logo: { width: 88, height: 88, alignSelf: 'center' },
  nota: { borderWidth: 1, borderRadius: raggio.l, padding: spazio.l, gap: spazio.xs, marginVertical: spazio.s },
  notaTitolo: { fontSize: 16, fontWeight: '600' },
  notaTesto: { fontSize: 15, lineHeight: 21 },
  titolo: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginTop: spazio.m },
  sottotitolo: { fontSize: 15, textAlign: 'center', marginBottom: spazio.xl },
  blocco: { gap: spazio.s },
  etichetta: { fontSize: 13, fontWeight: '600', marginTop: spazio.s },
  campo: {
    borderWidth: 1,
    borderRadius: raggio.m,
    paddingHorizontal: spazio.l,
    paddingVertical: 14,
    fontSize: 17,
  },
  server: { borderRadius: raggio.m, padding: spazio.l, gap: 2 },
  serverNome: { fontSize: 17, fontWeight: '700' },
  serverUrl: { fontSize: 13 },
  codice: { fontSize: 24, letterSpacing: 6, textAlign: 'center' },
  indietro: { alignSelf: 'center', padding: spazio.s },
  indietroTesto: { fontSize: 15, fontWeight: '600' },
  errore: { borderRadius: raggio.m, padding: spazio.m, marginTop: spazio.m },
})
