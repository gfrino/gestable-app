/**
 * Foglio per cercare persone in Odoo: gli invitati (contatti, piu' d'uno; con
 * un'email nuova si crea il contatto) o l'organizzatore (utenti interni, uno).
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { cercaInvitati, cercaUtenti, creaInvitato, type Persona } from '../../odoo/calendario'
import { urlAvatar } from '../../odoo/lavoro'
import { Avatar } from '../Avatar'
import { Foglio } from '../Foglio'
import { raggio, spazio, useColori } from '../tema'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Props = {
  aperto: boolean
  server: string
  tipo: 'invitati' | 'organizzatore'
  scelti: Persona[]
  chiudi: () => void
  /** Invitati: aggiunge o toglie. Organizzatore: sceglie e chiude. */
  tocca: (p: Persona) => void
}

export function CercaPersone({ aperto, server, tipo, scelti, chiudi, tocca }: Props) {
  const c = useColori()
  const [testo, setTesto] = useState('')
  const [lista, setLista] = useState<Persona[] | null>(null)
  const [errore, setErrore] = useState('')
  const [creo, setCreo] = useState(false)

  useEffect(() => {
    if (!aperto) {
      return
    }
    let valido = true
    const t = setTimeout(() => {
      ;(tipo === 'invitati' ? cercaInvitati(server, testo) : cercaUtenti(server, testo))
        .then((r) => valido && (setLista(r), setErrore('')))
        .catch((e: unknown) => valido && setErrore(e instanceof Error ? e.message : String(e)))
    }, 250)
    return () => {
      valido = false
      clearTimeout(t)
    }
  }, [aperto, server, tipo, testo])

  function chiudiTutto() {
    setTesto('')
    setLista(null)
    chiudi()
  }

  async function invitaEmail() {
    setCreo(true)
    try {
      const p = await creaInvitato(server, testo)
      tocca(p)
      setTesto('')
    } catch (e) {
      Alert.alert('Invitato non aggiunto', e instanceof Error ? e.message : String(e))
    } finally {
      setCreo(false)
    }
  }

  const ids = new Set(scelti.map((p) => p.id))
  const emailNuova = tipo === 'invitati' && EMAIL.test(testo.trim()) && !lista?.some((p) => p.email.toLowerCase() === testo.trim().toLowerCase())

  return (
    <Foglio aperto={aperto} titolo={tipo === 'invitati' ? 'Invitati' : 'Organizzatore'} chiudi={chiudiTutto}>
      <View style={[s.cerca, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
        <Ionicons name="search" size={18} color={c.testo3} />
        <TextInput
          style={[s.campo, { color: c.testo }]}
          value={testo}
          onChangeText={setTesto}
          placeholder={tipo === 'invitati' ? 'Nome, email o azienda' : 'Nome o login'}
          placeholderTextColor={c.testo3}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          returnKeyType="search"
          accessibilityLabel="Cerca"
        />
      </View>
      {emailNuova ? (
        <Pressable
          onPress={invitaEmail}
          disabled={creo}
          style={({ pressed }) => [s.riga, { backgroundColor: pressed ? c.superficie2 : 'transparent' }]}
          accessibilityRole="button"
        >
          <View style={[s.piu, { backgroundColor: c.primarioTenue }]}>
            {creo ? <ActivityIndicator color={c.primario} /> : <Ionicons name="mail-outline" size={18} color={c.primario} />}
          </View>
          <Text style={[s.nome, { color: c.primario }]} numberOfLines={1}>
            Invita {testo.trim()}
          </Text>
        </Pressable>
      ) : null}
      {errore ? (
        <Text style={[s.vuoto, { color: c.rosso }]}>{errore}</Text>
      ) : !lista ? (
        <ActivityIndicator style={{ marginTop: spazio.xl }} color={c.primario} />
      ) : (
        <FlatList
          data={lista}
          keyExtractor={(p) => String(p.id)}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={[s.vuoto, { color: c.testo2 }]}>Nessuno trovato.</Text>}
          renderItem={({ item: p }) => {
            const scelto = ids.has(p.id)
            return (
              <Pressable
                onPress={() => {
                  tocca(p)
                  if (tipo === 'organizzatore') {
                    chiudiTutto()
                  }
                }}
                style={({ pressed }) => [s.riga, { backgroundColor: pressed ? c.superficie2 : 'transparent' }]}
                accessibilityRole="button"
                accessibilityState={{ selected: scelto }}
              >
                <Avatar url={urlAvatar(server, tipo === 'invitati' ? 'res.partner' : 'res.users', p.id)} nome={p.nome} lato={38} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.nome, { color: c.testo }]} numberOfLines={1}>
                    {p.nome}
                  </Text>
                  {p.email || p.azienda ? (
                    <Text style={[s.sotto, { color: c.testo2 }]} numberOfLines={1}>
                      {[p.azienda, p.email].filter(Boolean).join(' · ')}
                    </Text>
                  ) : null}
                </View>
                <Ionicons
                  name={scelto ? 'checkmark-circle' : tipo === 'invitati' ? 'add-circle-outline' : 'ellipse-outline'}
                  size={26}
                  color={scelto ? c.primario : c.testo3}
                />
              </Pressable>
            )
          }}
        />
      )}
    </Foglio>
  )
}

const s = StyleSheet.create({
  cerca: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spazio.s,
    margin: spazio.l,
    paddingHorizontal: spazio.m,
    borderRadius: raggio.m,
    borderWidth: 1,
  },
  campo: { flex: 1, fontSize: 17, paddingVertical: 12 },
  riga: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, paddingHorizontal: spazio.l, paddingVertical: spazio.s, minHeight: 56 },
  piu: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  nome: { fontSize: 16, fontWeight: '600' },
  sotto: { fontSize: 13, marginTop: 1 },
  vuoto: { fontSize: 15, textAlign: 'center', marginTop: spazio.xl, paddingHorizontal: spazio.xl },
})
