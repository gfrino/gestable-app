/**
 * Calendario del team: i colleghi scelti (come i «Partecipanti» con la spunta
 * nel calendario di Odoo) e di chi e' ogni appuntamento.
 *
 * - `TeamCalendario` (contesto): il mio contatto e i colleghi scelti con il
 *   loro colore; le carte degli appuntamenti lo leggono per il pallino colorato
 *   e il nome del collega.
 * - `SceltaColleghi`: il foglio con i colleghi da spuntare (cerca per nome).
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { createContext, useContext, useEffect, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { t } from '../../i18n'
import { colleghi as caricaColleghi, coloreCollega, type Collega, type Evento } from '../../odoo/calendario'
import { urlAvatar } from '../../odoo/lavoro'
import { Avatar } from '../Avatar'
import { Caricamento } from '../Caricamento'
import { Foglio } from '../Foglio'
import { raggio, spazio, useColori } from '../tema'

export type Team = { io: number | null; scelti: Collega[] }

export const TeamCalendario = createContext<Team>({ io: null, scelti: [] })

/** Di chi e' l'appuntamento: colore del pallino e nomi dei colleghi scelti che partecipano. Null senza colleghi scelti. */
export function useDiChi(e: Evento): { colore: string | null; nomi: string[] } | null {
  const team = useContext(TeamCalendario)
  const c = useColori()
  if (!team.scelti.length) {
    return null
  }
  const ids = new Set(e.partnerIds || [])
  const loro = team.scelti.filter((x) => ids.has(x.partnerId))
  const mio = team.io !== null && ids.has(team.io)
  return { colore: mio ? c.primario : loro.length ? coloreCollega(loro[0].partnerId) : null, nomi: loro.map((x) => x.nome) }
}

type Props = {
  aperto: boolean
  server: string
  uid: number
  scelti: Collega[]
  chiudi: () => void
  cambia: (scelti: Collega[]) => void
}

export function SceltaColleghi({ aperto, server, uid, scelti, chiudi, cambia }: Props) {
  const c = useColori()
  const [tutti, setTutti] = useState<Collega[] | null>(null)
  const [errore, setErrore] = useState('')
  const [testo, setTesto] = useState('')

  useEffect(() => {
    if (!aperto || tutti) {
      return
    }
    caricaColleghi(server, uid)
      .then(setTutti)
      .catch((e: unknown) => setErrore(e instanceof Error ? e.message : String(e)))
  }, [aperto, tutti, server, uid])

  const q = testo.trim().toLowerCase()
  const presi = new Set(scelti.map((x) => x.partnerId))
  // Prima quelli gia' scelti, poi gli altri; la ricerca filtra tutti.
  const lista = (tutti || [])
    .filter((x) => !q || x.nome.toLowerCase().includes(q))
    .sort((a, b) => Number(presi.has(b.partnerId)) - Number(presi.has(a.partnerId)) || a.nome.localeCompare(b.nome))

  function tocca(x: Collega) {
    cambia(presi.has(x.partnerId) ? scelti.filter((y) => y.partnerId !== x.partnerId) : [...scelti, x])
  }

  return (
    <Foglio aperto={aperto} titolo={t('calendario.team')} chiudi={chiudi} fatto={t('comune.fine')}>
      <Text style={[s.aiuto, { color: c.testo2 }]}>{t('calendario.teamAiuto')}</Text>
      <View style={[s.cerca, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
        <Ionicons name="search" size={18} color={c.testo3} />
        <TextInput
          style={[s.campo, { color: c.testo }]}
          value={testo}
          onChangeText={setTesto}
          placeholder={t('calendario.cerca')}
          placeholderTextColor={c.testo3}
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>
      {scelti.length ? (
        <Pressable onPress={() => cambia([])} style={s.nessuno} accessibilityRole="button">
          <Text style={[s.nessunoTesto, { color: c.primario }]} numberOfLines={1}>
            {t('calendario.soloIMiei')}
          </Text>
        </Pressable>
      ) : null}
      {errore ? (
        <Text style={[s.aiuto, { color: c.rosso }]}>{errore}</Text>
      ) : !tutti ? (
        <Caricamento style={{ marginTop: spazio.xl }} />
      ) : (
        <FlatList
          data={lista}
          keyExtractor={(x) => String(x.partnerId)}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item }) => {
            const preso = presi.has(item.partnerId)
            const colore = coloreCollega(item.partnerId)
            return (
              <Pressable
                onPress={() => tocca(item)}
                style={({ pressed }) => [s.riga, { backgroundColor: pressed ? c.superficie2 : 'transparent' }]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: preso }}
              >
                <Avatar url={urlAvatar(server, 'res.users', item.uid)} nome={item.nome} lato={40} />
                <Text style={[s.nome, { color: c.testo }]} numberOfLines={1}>
                  {item.nome}
                </Text>
                <View style={[s.colore, { backgroundColor: colore }]} />
                <Ionicons name={preso ? 'checkbox' : 'square-outline'} size={26} color={preso ? colore : c.testo3} />
              </Pressable>
            )
          }}
        />
      )}
    </Foglio>
  )
}

const s = StyleSheet.create({
  aiuto: { fontSize: 14, paddingHorizontal: spazio.l, paddingTop: spazio.m, lineHeight: 19 },
  cerca: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, marginHorizontal: spazio.l, marginTop: spazio.m, paddingHorizontal: spazio.m, borderRadius: raggio.m, borderWidth: 1 },
  campo: { flex: 1, fontSize: 16, paddingVertical: 10 },
  nessuno: { alignSelf: 'flex-start', paddingHorizontal: spazio.l, paddingVertical: spazio.s },
  nessunoTesto: { fontSize: 15, fontWeight: '600' },
  riga: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, paddingHorizontal: spazio.l, paddingVertical: 10 },
  nome: { flex: 1, fontSize: 16 },
  colore: { width: 10, height: 10, borderRadius: 5 },
})
