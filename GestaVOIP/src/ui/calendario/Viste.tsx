/**
 * Le viste Settimana e Mese della scheda Calendario, e la carta di un
 * appuntamento usata anche nella vista Giorno.
 *
 * Settimana: i sette giorni uno sotto l'altro, a sinistra la data (si tocca per
 * aprire quel giorno), a destra i suoi appuntamenti.
 * Mese: la griglia del mese; nelle celle strette (iPhone) i pallini, in quelle
 * larghe (iPhone Duo aperto, iPad) i titoli. Toccare un giorno apre quel giorno.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useState, type ReactElement } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type RefreshControlProps } from 'react-native'
import { loc, t, tn } from '../../i18n'
import { delGiorno, giornoChiave, giornoEsteso, lettereGiorni, oraBreve, type Evento } from '../../odoo/calendario'
import { raggio, spazio, useColori } from '../tema'

export function piuGiorni(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function lunedi(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

/** I lunedi' delle settimane che mostrano il mese di «d» (da 4 a 6). */
export function settimaneDelMese(d: Date): Date[] {
  const primo = lunedi(new Date(d.getFullYear(), d.getMonth(), 1))
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const lista: Date[] = []
  for (let s = primo; s <= ultimo; s = piuGiorni(s, 7)) {
    lista.push(s)
  }
  return lista
}

type Carta = {
  evento: Evento
  adesso: number
  larghezzaOre: number
  onPress: () => void
  /** Settimana: una riga sola, senza invitati e videochiamata. */
  compatta?: boolean
}

export function CartaEvento({ evento: e, adesso, larghezzaOre, onPress, compatta }: Carta) {
  const c = useColori()
  const inCorso = !e.tuttoIlGiorno && e.inizio.getTime() <= adesso && adesso < e.fine.getTime()
  const passato = !e.tuttoIlGiorno && e.fine.getTime() < adesso
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        compatta ? s.cartaCompatta : s.carta,
        { backgroundColor: pressed ? c.superficie2 : c.superficie, borderColor: inCorso ? c.primario : c.bordo, opacity: passato ? 0.6 : 1 },
      ]}
    >
      <View style={[s.ore, { width: larghezzaOre }]}>
        {e.tuttoIlGiorno ? (
          <Text style={[s.tutto, { color: c.primario }]}>{t('calendario.tuttoIlGiorno')}</Text>
        ) : (
          <>
            <Text style={[compatta ? s.oraInizioCompatta : s.oraInizio, { color: c.testo }]} numberOfLines={1}>
              {oraBreve(e.inizio)}
            </Text>
            <Text style={[s.oraFine, { color: c.testo3 }]} numberOfLines={1}>
              {oraBreve(e.fine)}
            </Text>
          </>
        )}
      </View>
      <View style={{ flex: 1, gap: compatta ? 2 : 3 }}>
        <View style={s.rigaTitolo}>
          <Text style={[compatta ? s.titoloCompatto : s.titolo, { color: c.testo }]} numberOfLines={compatta ? 1 : 2}>
            {e.titolo}
          </Text>
          {inCorso ? (
            <View style={[s.ora, { backgroundColor: c.verdeTenue }]}>
              <Text style={[s.oraTesto, { color: c.verde }]}>{t('calendario.adesso')}</Text>
            </View>
          ) : null}
        </View>
        {e.luogo ? (
          <View style={s.dettaglio}>
            <Ionicons name="location-outline" size={14} color={c.testo2} />
            <Text style={[s.dettaglioTesto, { color: c.testo2 }]} numberOfLines={1}>
              {e.luogo}
            </Text>
          </View>
        ) : null}
        {e.video && !compatta ? (
          <View style={s.dettaglio}>
            <Ionicons name="videocam-outline" size={14} color={c.testo2} />
            <Text style={[s.dettaglioTesto, { color: c.testo2 }]}>{t('calendario.videochiamata')}</Text>
          </View>
        ) : null}
        {e.partecipanti > 1 && !compatta ? (
          <View style={s.dettaglio}>
            <Ionicons name="people-outline" size={14} color={c.testo2} />
            <Text style={[s.dettaglioTesto, { color: c.testo2 }]}>{tn('calendario.partecipanti', e.partecipanti)}</Text>
          </View>
        ) : null}
      </View>
      {compatta ? null : <Ionicons name="chevron-forward" size={18} color={c.testo3} />}
    </Pressable>
  )
}

/** Lettura per VoiceOver: «Mercoledì 25 novembre, 2 appuntamenti». */
function etichettaGiorno(d: Date, n: number): string {
  return `${giornoEsteso(d)}, ${n ? tn('calendario.appuntamenti', n) : t('calendario.nessunAppuntamento')}`
}

type Comuni = {
  oggi: Date
  onGiorno: (d: Date) => void
  refreshControl: ReactElement<RefreshControlProps>
}

export function VistaSettimana({
  inizio,
  dati,
  errore,
  adesso,
  larghezzaOre,
  oggi,
  onGiorno,
  onEvento,
  refreshControl,
}: Comuni & {
  inizio: Date
  dati: Evento[] | undefined
  errore: string
  adesso: number
  larghezzaOre: number
  onEvento: (id: number) => void
}) {
  const c = useColori()
  return (
    <ScrollView contentContainerStyle={s.settimana} refreshControl={refreshControl}>
      {errore && !dati ? <Text style={[s.errore, { color: c.rosso }]}>{errore}</Text> : null}
      {Array.from({ length: 7 }, (_, g) => {
        const giorno = piuGiorni(inizio, g)
        const eOggi = giornoChiave(giorno) === giornoChiave(oggi)
        const lista = dati ? delGiorno(dati, giorno) : null
        return (
          <View key={g} style={[s.giornoSettimana, g > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.bordo }]}>
            <Pressable
              onPress={() => onGiorno(giorno)}
              hitSlop={4}
              style={({ pressed }) => [s.data, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel={etichettaGiorno(giorno, lista?.length || 0)}
            >
              <Text style={[s.dataGiorno, { color: eOggi ? c.primario : g > 4 ? c.testo3 : c.testo2 }]} numberOfLines={1}>
                {giorno.toLocaleDateString(loc(), { weekday: 'short' }).replace('.', '')}
              </Text>
              <View style={[s.dataNumero, eOggi && { backgroundColor: c.primario }]}>
                <Text style={[s.dataNumeroTesto, { color: eOggi ? c.primarioTesto : c.testo }]}>{giorno.getDate()}</Text>
              </View>
            </Pressable>
            <View style={s.eventiGiorno}>
              {!lista ? (
                <View style={[s.segnaposto, { backgroundColor: c.superficie2 }]} />
              ) : !lista.length ? (
                <Pressable onPress={() => onGiorno(giorno)} style={s.libero} accessibilityRole="button">
                  <Text style={[s.liberoTesto, { color: c.testo3 }]}>{t('calendario.libero')}</Text>
                </Pressable>
              ) : (
                lista.map((e) => (
                  <CartaEvento key={e.id} evento={e} adesso={adesso} larghezzaOre={larghezzaOre} onPress={() => onEvento(e.id)} compatta />
                ))
              )}
            </View>
          </View>
        )
      })}
    </ScrollView>
  )
}

export function VistaMese({
  mese,
  perSettimana,
  scelto,
  errore,
  oggi,
  onGiorno,
  refreshControl,
}: Comuni & {
  /** Un giorno qualsiasi del mese da mostrare. */
  mese: Date
  perSettimana: Record<string, Evento[]>
  scelto: Date
  errore: string
}) {
  const c = useColori()
  const [misura, setMisura] = useState({ w: 0, h: 0 })
  const settimane = settimaneDelMese(mese)
  const larghezzaCella = misura.w / 7
  const altezzaCella = misura.h / settimane.length
  // Celle larghe: i titoli (quanti ne stanno); strette: i pallini.
  const conTitoli = larghezzaCella >= 72
  const titoliMax = Math.max(1, Math.floor((altezzaCella - 34) / 16))
  const chiaveOggi = giornoChiave(oggi)
  const chiaveScelto = giornoChiave(scelto)
  const manca = settimane.some((x) => !perSettimana[giornoChiave(x)])

  return (
    <ScrollView contentContainerStyle={s.mese} refreshControl={refreshControl}>
      {manca ? (
        errore ? (
          <Text style={[s.errore, { color: c.rosso }]}>{errore}</Text>
        ) : (
          <ActivityIndicator color={c.primario} style={s.attesa} />
        )
      ) : null}
      <View style={s.lettere}>
        {lettereGiorni().map((l, g) => (
          <Text key={g} style={[s.lettera, { color: g > 4 ? c.testo3 : c.testo2 }]}>
            {l}
          </Text>
        ))}
      </View>
      <View style={s.griglia} onLayout={(ev) => setMisura({ w: ev.nativeEvent.layout.width, h: ev.nativeEvent.layout.height })}>
        {settimane.map((inizio) => {
          const dati = perSettimana[giornoChiave(inizio)]
          return (
            <View key={giornoChiave(inizio)} style={[s.riga, { borderTopColor: c.bordo }]}>
              {Array.from({ length: 7 }, (_, g) => {
                const giorno = piuGiorni(inizio, g)
                const chiave = giornoChiave(giorno)
                const fuori = giorno.getMonth() !== mese.getMonth()
                const eOggi = chiave === chiaveOggi
                const eScelto = chiave === chiaveScelto
                const lista = dati ? delGiorno(dati, giorno) : []
                return (
                  <Pressable
                    key={chiave}
                    onPress={() => onGiorno(giorno)}
                    style={({ pressed }) => [s.cella, pressed && { backgroundColor: c.superficie2 }]}
                    accessibilityRole="button"
                    accessibilityLabel={etichettaGiorno(giorno, lista.length)}
                  >
                    <View style={[s.numero, eScelto && { backgroundColor: c.primario }]}>
                      <Text
                        style={[
                          s.numeroTesto,
                          { color: eScelto ? c.primarioTesto : eOggi ? c.primario : fuori ? c.testo3 : c.testo },
                          (eScelto || eOggi) && { fontWeight: '800' },
                        ]}
                      >
                        {giorno.getDate()}
                      </Text>
                    </View>
                    {!lista.length ? null : conTitoli ? (
                      <View style={[s.titoli, fuori && { opacity: 0.5 }]}>
                        {lista.slice(0, lista.length > titoliMax ? titoliMax - 1 : titoliMax).map((e) => (
                          <Text
                            key={e.id}
                            numberOfLines={1}
                            style={[s.titoloCella, { backgroundColor: c.primarioTenue, color: c.testo }]}
                          >
                            {e.titolo}
                          </Text>
                        ))}
                        {lista.length > titoliMax ? (
                          <Text style={[s.altri, { color: c.testo2 }]} numberOfLines={1}>
                            +{lista.length - titoliMax + 1}
                          </Text>
                        ) : null}
                      </View>
                    ) : (
                      <View style={[s.pallini, fuori && { opacity: 0.5 }]}>
                        {lista.slice(0, 3).map((e) => (
                          <View key={e.id} style={[s.pallino, { backgroundColor: c.primario }]} />
                        ))}
                        {lista.length > 3 ? <Text style={[s.altri, { color: c.testo2 }]}>+{lista.length - 3}</Text> : null}
                      </View>
                    )}
                  </Pressable>
                )
              })}
            </View>
          )
        })}
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  carta: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, padding: spazio.m, borderRadius: raggio.l, borderWidth: 1 },
  cartaCompatta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spazio.s,
    paddingVertical: spazio.s,
    paddingHorizontal: spazio.m,
    borderRadius: raggio.m,
    borderWidth: 1,
  },
  ore: { alignItems: 'flex-start' },
  oraInizio: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  oraInizioCompatta: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  oraFine: { fontSize: 13, fontVariant: ['tabular-nums'], marginTop: 2 },
  tutto: { fontSize: 12, fontWeight: '700', lineHeight: 15 },
  rigaTitolo: { flexDirection: 'row', alignItems: 'center', gap: spazio.s },
  titolo: { flex: 1, fontSize: 16, fontWeight: '700' },
  titoloCompatto: { flex: 1, fontSize: 15, fontWeight: '700' },
  ora: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  oraTesto: { fontSize: 11, fontWeight: '800' },
  dettaglio: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dettaglioTesto: { flex: 1, fontSize: 13 },
  errore: { fontSize: 15, textAlign: 'center', marginVertical: spazio.s },

  settimana: { paddingHorizontal: spazio.l, paddingTop: spazio.xs, paddingBottom: spazio.xxl },
  giornoSettimana: { flexDirection: 'row', gap: spazio.m, paddingVertical: spazio.m },
  data: { width: 44, alignItems: 'center', gap: 2 },
  dataGiorno: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  dataNumero: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dataNumeroTesto: { fontSize: 18, fontWeight: '700' },
  eventiGiorno: { flex: 1, gap: spazio.s, justifyContent: 'center' },
  segnaposto: { height: 40, borderRadius: raggio.m, opacity: 0.6 },
  libero: { minHeight: 40, justifyContent: 'center' },
  liberoTesto: { fontSize: 15 },

  mese: { flexGrow: 1, paddingHorizontal: spazio.s, paddingBottom: spazio.m },
  lettere: { flexDirection: 'row', paddingBottom: spazio.xs },
  lettera: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700' },
  griglia: { flex: 1 },
  riga: { flex: 1, minHeight: 64, flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  cella: { flex: 1, alignItems: 'center', paddingTop: 4, gap: 3, borderRadius: raggio.s, overflow: 'hidden' },
  numero: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  numeroTesto: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  pallini: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 14 },
  attesa: { position: 'absolute', top: 0, right: spazio.m },
  pallino: { width: 6, height: 6, borderRadius: 3 },
  titoli: { alignSelf: 'stretch', gap: 2, paddingHorizontal: 2 },
  titoloCella: { fontSize: 11, fontWeight: '600', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, overflow: 'hidden' },
  altri: { fontSize: 11, lineHeight: 14, fontWeight: '700', textAlign: 'center' },
})
