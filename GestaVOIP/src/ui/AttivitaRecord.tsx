/**
 * Le attivita' di un record (parte del chatter): elenco con «fatta» in un
 * tocco e «Pianifica attivita'» (che cosa, quando, promemoria). Uguale al CRM,
 * ma per qualsiasi modello di Odoo.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useCallback, useEffect, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { t } from '../i18n'
import { attivitaDi, attivitaFatta, pianificaAttivita, tipiAttivitaDi, type AttivitaRecord as Voce, type TipoAttivita } from '../odoo/attivitaRecord'
import { Caricamento } from './Caricamento'
import { Foglio } from './Foglio'
import { coloreAttivita, data, giornoIso, iconaAttivita, quando } from './formatoCrm'
import { Pulsante } from './Pulsante'
import { raggio, spazio, useColori } from './tema'

const QUANDO = [
  { giorni: 0, testo: 'crm.oggi' },
  { giorni: 1, testo: 'crm.domani' },
  { giorni: 3, testo: 'crm.tra3' },
  { giorni: 7, testo: 'crm.traSettimana' },
  { giorni: 14, testo: 'crm.tra2Settimane' },
]

function traGiorni(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return giornoIso(d)
}

type Props = { server: string; uid: number; modello: string; id: number; versione?: number }

export function AttivitaRecord({ server, uid, modello, id, versione = 0 }: Props) {
  const c = useColori()
  const [lista, setLista] = useState<Voce[] | null>(null)
  const [occupato, setOccupato] = useState('')
  const [foglio, setFoglio] = useState(false)
  const [tipi, setTipi] = useState<TipoAttivita[]>([])
  const [tipo, setTipo] = useState<TipoAttivita | null>(null)
  const [scadenza, setScadenza] = useState(() => traGiorni(0))
  const [riassunto, setRiassunto] = useState('')

  const carica = useCallback(async () => {
    setLista(await attivitaDi(server, modello, id).catch(() => []))
  }, [server, modello, id])

  // Si ricarica quando cambia il record o la scheda si aggiorna (versione).
  useEffect(() => {
    let vivo = true
    attivitaDi(server, modello, id)
      .catch(() => [] as Voce[])
      .then((r) => vivo && setLista(r))
    return () => {
      vivo = false
    }
  }, [server, modello, id, versione])

  async function fai(chiave: string, azione: () => Promise<void>) {
    setOccupato(chiave)
    try {
      await azione()
      await carica()
    } catch (e) {
      Alert.alert(t('crm.attivitaNonSalvata'), e instanceof Error ? e.message : String(e))
    }
    setOccupato('')
  }

  async function apri() {
    setRiassunto('')
    setFoglio(true)
    const l = tipi.length ? tipi : await tipiAttivitaDi(server, modello).catch(() => [] as TipoAttivita[])
    setTipi(l)
    const primo = tipo && l.some((x) => x.id === tipo.id) ? tipo : l[0] || null
    setTipo(primo)
    setScadenza(traGiorni(primo?.giorni || 0))
  }

  return (
    <>
      {!lista ? (
        <Caricamento dimensione={20} />
      ) : lista.length ? (
        lista.map((a) => (
          <View key={a.id} style={[s.riga, { borderColor: c.bordo }]}>
            <View style={[s.icona, { backgroundColor: c.superficie2 }]}>
              <Ionicons name={iconaAttivita(a.categoria, a.icona)} size={18} color={coloreAttivita(a.stato, c)} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.titolo, { color: c.testo }]} numberOfLines={2}>
                {a.riassunto || a.tipo}
              </Text>
              <Text style={[s.piccolo, { color: coloreAttivita(a.stato, c) }]} numberOfLines={1}>
                {[quando(a.scadenza), a.riassunto ? a.tipo : '', a.persona && a.persona[0] !== uid ? a.persona[1] : ''].filter(Boolean).join(' · ')}
              </Text>
              {a.nota ? (
                <Text style={[s.piccolo, { color: c.testo2 }]} numberOfLines={3}>
                  {a.nota}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => void fai(`fatta-${a.id}`, () => attivitaFatta(server, a.id))}
              disabled={!!occupato}
              hitSlop={8}
              style={[s.fatta, { borderColor: c.verde }]}
              accessibilityRole="button"
              accessibilityLabel={`${t('crm.fatta')}: ${a.riassunto || a.tipo}`}
            >
              {occupato === `fatta-${a.id}` ? <Caricamento dimensione={16} /> : <Ionicons name="checkmark" size={18} color={c.verde} />}
            </Pressable>
          </View>
        ))
      ) : (
        <Text style={[s.vuoto, { color: c.testo3 }]}>{t('crm.nessunaAttivita')}</Text>
      )}
      <Pulsante testo={t('crm.pianifica')} variante="tenue" onPress={() => void apri()} />

      <Foglio aperto={foglio} titolo={t('crm.pianifica')} chiudi={() => setFoglio(false)} fatto={t('comune.chiudi')}>
        <ScrollView contentContainerStyle={s.foglio} keyboardShouldPersistTaps="handled">
          <Text style={[s.etichetta, { color: c.testo2 }]}>{t('crm.tipoAttivita')}</Text>
          <View style={s.pillole}>
            {tipi.map((x) => {
              const scelto = tipo?.id === x.id
              return (
                <Pressable
                  key={x.id}
                  onPress={() => {
                    setTipo(x)
                    setScadenza(traGiorni(x.giorni))
                  }}
                  style={[s.pillola, { backgroundColor: scelto ? c.primario : c.superficie, borderColor: scelto ? c.primario : c.bordo }]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: scelto }}
                >
                  <Ionicons name={iconaAttivita(x.categoria, x.icona)} size={15} color={scelto ? '#FFFFFF' : c.primario} />
                  <Text style={[s.pillolaTesto, { color: scelto ? '#FFFFFF' : c.testo }]} numberOfLines={1}>
                    {x.nome}
                  </Text>
                </Pressable>
              )
            })}
          </View>
          <Text style={[s.etichetta, { color: c.testo2 }]}>{t('crm.quandoAttivita')}</Text>
          <View style={s.pillole}>
            {QUANDO.map((q) => {
              const scelto = scadenza === traGiorni(q.giorni)
              return (
                <Pressable
                  key={q.giorni}
                  onPress={() => setScadenza(traGiorni(q.giorni))}
                  style={[s.pillola, { backgroundColor: scelto ? c.primario : c.superficie, borderColor: scelto ? c.primario : c.bordo }]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: scelto }}
                >
                  <Text style={[s.pillolaTesto, { color: scelto ? '#FFFFFF' : c.testo }]} numberOfLines={1}>
                    {t(q.testo)}
                  </Text>
                </Pressable>
              )
            })}
          </View>
          <Text style={[s.piccolo, { color: c.testo2 }]}>{data(scadenza)}</Text>
          <Text style={[s.etichetta, { color: c.testo2 }]}>{t('crm.riassunto')}</Text>
          <TextInput
            value={riassunto}
            onChangeText={setRiassunto}
            placeholder={t('crm.riassuntoEsempio')}
            placeholderTextColor={c.testo3}
            style={[s.input, { color: c.testo, backgroundColor: c.superficie, borderColor: c.bordo }]}
          />
          <Pulsante
            testo={t('crm.pianifica')}
            occupato={occupato === 'pianifica'}
            onPress={() => {
              if (!tipo) {
                return
              }
              void fai('pianifica', async () => {
                await pianificaAttivita(server, modello, id, { tipoId: tipo.id, data: scadenza, riassunto, persona: uid })
                setFoglio(false)
              })
            }}
          />
        </ScrollView>
      </Foglio>
    </>
  )
}

const s = StyleSheet.create({
  riga: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, paddingVertical: spazio.s, borderBottomWidth: StyleSheet.hairlineWidth },
  icona: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  titolo: { fontSize: 14, fontWeight: '600' },
  piccolo: { fontSize: 12, fontWeight: '600', marginTop: 1 },
  fatta: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  vuoto: { fontSize: 14 },
  foglio: { padding: spazio.l, gap: spazio.s },
  etichetta: { fontSize: 14, fontWeight: '600', marginTop: spazio.s },
  pillole: { flexDirection: 'row', flexWrap: 'wrap', gap: spazio.s },
  pillola: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 38, borderRadius: 19, borderWidth: StyleSheet.hairlineWidth },
  pillolaTesto: { fontSize: 15, fontWeight: '600' },
  input: { fontSize: 16, padding: spazio.m, borderRadius: raggio.m, borderWidth: StyleSheet.hairlineWidth },
})
