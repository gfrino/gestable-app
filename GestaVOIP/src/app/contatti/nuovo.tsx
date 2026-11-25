/** Nuovo contatto in Odoo: persona o azienda, con i recapiti essenziali. */

import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { creaContatto, haCellulare } from '../../odoo/contatti'
import { Pulsante } from '../../ui/Pulsante'
import { Testata } from '../../ui/Testata'
import { raggio, spazio, useColori } from '../../ui/tema'
import { useApp } from '../../voip/Contesto'

export default function NuovoContatto() {
  const c = useColori()
  const router = useRouter()
  const { sessione } = useApp()
  const server = sessione?.server || ''
  const [eAzienda, setEAzienda] = useState(false)
  const [nome, setNome] = useState('')
  const [azienda, setAzienda] = useState('')
  const [funzione, setFunzione] = useState('')
  const [telefono, setTelefono] = useState('')
  const [cellulare, setCellulare] = useState('')
  const [email, setEmail] = useState('')
  const [conCellulare, setConCellulare] = useState(false)
  const [salva, setSalva] = useState(false)

  // Odoo 19 non ha il campo cellulare: lo si mostra solo dove esiste.
  useFocusEffect(
    useCallback(() => {
      haCellulare(server)
        .then(setConCellulare)
        .catch(() => setConCellulare(false))
    }, [server]),
  )

  async function conferma() {
    if (!nome.trim()) {
      Alert.alert('Nuovo contatto', eAzienda ? "Scrivi il nome dell'azienda." : 'Scrivi il nome.')
      return
    }
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      Alert.alert('Nuovo contatto', "L'email non sembra giusta.")
      return
    }
    setSalva(true)
    try {
      const id = await creaContatto(server, { eAzienda, nome, azienda, funzione, telefono, cellulare, email })
      router.replace({ pathname: '/contatti/[id]', params: { id: String(id) } })
    } catch (e) {
      Alert.alert('Contatto non salvato', e instanceof Error ? e.message : String(e))
      setSalva(false)
    }
  }

  const campo = [s.campo, { backgroundColor: c.superficie, borderColor: c.bordo, color: c.testo }]
  const etichetta = (t: string) => <Text style={[s.etichetta, { color: c.testo2 }]}>{t}</Text>

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top', 'bottom']}>
      <Testata titolo="Nuovo contatto" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.contenuto} keyboardShouldPersistTaps="handled">
          <View style={[s.segmenti, { backgroundColor: c.superficie }]}>
            {[
              { v: false, t: 'Persona' },
              { v: true, t: 'Azienda' },
            ].map((x) => {
              const attivo = x.v === eAzienda
              return (
                <Pressable
                  key={x.t}
                  onPress={() => setEAzienda(x.v)}
                  style={[s.segmento, attivo && { backgroundColor: c.primarioTenue }]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: attivo }}
                >
                  <Text style={[s.segmentoTesto, { color: attivo ? c.primario : c.testo2 }]}>{x.t}</Text>
                </Pressable>
              )
            })}
          </View>

          {etichetta(eAzienda ? 'Nome azienda' : 'Nome e cognome')}
          <TextInput style={campo} value={nome} onChangeText={setNome} autoFocus autoCapitalize="words" placeholderTextColor={c.testo3} />

          {!eAzienda ? (
            <>
              {etichetta('Azienda (facoltativa)')}
              <TextInput style={campo} value={azienda} onChangeText={setAzienda} autoCapitalize="words" />
              {etichetta('Ruolo (facoltativo)')}
              <TextInput style={campo} value={funzione} onChangeText={setFunzione} autoCapitalize="sentences" />
            </>
          ) : null}

          {etichetta('Telefono')}
          <TextInput style={campo} value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" textContentType="telephoneNumber" />
          {conCellulare ? (
            <>
              {etichetta('Cellulare')}
              <TextInput style={campo} value={cellulare} onChangeText={setCellulare} keyboardType="phone-pad" />
            </>
          ) : null}
          {etichetta('Email')}
          <TextInput
            style={campo}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
          />

          <View style={{ height: spazio.s }} />
          <Pulsante testo="Salva" onPress={conferma} occupato={salva} />
          {!eAzienda && azienda.trim() ? (
            <Text style={[s.nota, { color: c.testo3 }]}>
              Se in Odoo c&apos;è già un&apos;azienda con questo nome, il contatto viene collegato a lei.
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1 },
  contenuto: { padding: spazio.l, gap: spazio.s, paddingBottom: spazio.xxl },
  segmenti: { flexDirection: 'row', padding: 4, borderRadius: raggio.m, marginBottom: spazio.s },
  segmento: { flex: 1, paddingVertical: 9, borderRadius: raggio.s, alignItems: 'center' },
  segmentoTesto: { fontSize: 15, fontWeight: '700' },
  etichetta: { fontSize: 13, fontWeight: '600', marginTop: spazio.s },
  campo: { borderWidth: 1, borderRadius: raggio.m, paddingHorizontal: spazio.l, paddingVertical: 12, fontSize: 16 },
  nota: { fontSize: 13, textAlign: 'center' },
})
