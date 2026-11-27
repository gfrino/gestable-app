/**
 * Le viste Settimana e Mese della scheda Calendario, e la carta di un
 * appuntamento usata anche nella vista Giorno.
 *
 * Settimana: i sette giorni uno sotto l'altro, a sinistra la data (si tocca per
 * aprire quel giorno), a destra i suoi appuntamenti.
 * Mese: la griglia del mese; nelle celle strette (iPhone) fino a 10
 * pallini in file da 5, in quelle larghe (iPhone Duo aperto) i titoli.
 * Toccare un giorno apre quel giorno.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useState, type ReactElement } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type RefreshControlProps } from 'react-native'
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

/**
 * Il numero del giorno nel suo cerchio (oggi, giorno scelto), centrato
 * davvero: il cerchio cresce con il testo grande scelto nelle impostazioni del
 * telefono e lascia margine attorno al numero; il testo occupa tutta la
 * larghezza del cerchio con il centro del testo (le cifre «tabulari» lo
 * spostavano a sinistra) e scende di quel poco che le cifre, senza parti sotto
 * la riga, lasciano vuoto in alto.
 */
export function NumeroGiorno({
  numero,
  dimensione,
  minimo = 0,
  sfondo,
  colore,
  grassetto,
}: {
  numero: number
  /** Dimensione del testo prima dell'ingrandimento del telefono. */
  dimensione: number
  /** Diametro minimo del cerchio. */
  minimo?: number
  sfondo?: string
  colore: string
  grassetto?: boolean
}) {
  const { fontScale } = useWindowDimensions()
  const testo = dimensione * Math.max(1, fontScale)
  const d = Math.max(minimo, Math.ceil(testo * 2))
  return (
    <View style={[s.cerchio, { width: d, height: d, borderRadius: d / 2, backgroundColor: sfondo }]}>
      <Text
        style={[
          s.cerchioTesto,
          {
            width: d,
            fontSize: dimensione,
            lineHeight: Math.round(dimensione * 1.2),
            color: colore,
            fontWeight: grassetto ? '700' : '500',
            transform: [{ translateY: testo * SPOSTA_CIFRE }],
          },
        ]}
      >
        {numero}
      </Text>
    </View>
  )
}

/** Quanto scendono le cifre (in em) per stare al centro del cerchio. */
const SPOSTA_CIFRE = 0

type Carta = {
  evento: Evento
  adesso: number
  larghezzaOre: number
  onPress: () => void
}

export function CartaEvento({ evento: e, adesso, larghezzaOre, onPress }: Carta) {
  const c = useColori()
  const inCorso = !e.tuttoIlGiorno && e.inizio.getTime() <= adesso && adesso < e.fine.getTime()
  const passato = !e.tuttoIlGiorno && e.fine.getTime() < adesso
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        s.carta,
        { backgroundColor: pressed ? c.superficie2 : c.superficie, borderColor: inCorso ? c.primario : c.bordo, opacity: passato ? 0.6 : 1 },
      ]}
    >
      <View style={[s.ore, { width: larghezzaOre }]}>
        {e.tuttoIlGiorno ? (
          <Text style={[s.tutto, { color: c.primario }]}>{t('calendario.tuttoIlGiorno')}</Text>
        ) : (
          <>
            <Text style={[s.oraInizio, { color: c.testo }]} numberOfLines={1}>
              {oraBreve(e.inizio)}
            </Text>
            <Text style={[s.oraFine, { color: c.testo3 }]} numberOfLines={1}>
              {oraBreve(e.fine)}
            </Text>
          </>
        )}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={s.rigaTitolo}>
          <Text style={[s.titolo, { color: c.testo }]} numberOfLines={2}>
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
        {e.video ? (
          <View style={s.dettaglio}>
            <Ionicons name="videocam-outline" size={14} color={c.testo2} />
            <Text style={[s.dettaglioTesto, { color: c.testo2 }]}>{t('calendario.videochiamata')}</Text>
          </View>
        ) : null}
        {e.partecipanti > 1 ? (
          <View style={s.dettaglio}>
            <Ionicons name="people-outline" size={14} color={c.testo2} />
            <Text style={[s.dettaglioTesto, { color: c.testo2 }]}>{tn('calendario.partecipanti', e.partecipanti)}</Text>
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.testo3} />
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

/** Un appuntamento nel riquadro di un giorno della settimana. */
function RigaSettimana({ evento: e, adesso, larghezzaOre, primo, onPress }: { evento: Evento; adesso: number; larghezzaOre: number; primo: boolean; onPress: () => void }) {
  const c = useColori()
  const inCorso = !e.tuttoIlGiorno && e.inizio.getTime() <= adesso && adesso < e.fine.getTime()
  const passato = !e.tuttoIlGiorno && e.fine.getTime() < adesso
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.riga7, pressed && { backgroundColor: c.superficie2 }]}>
      {primo ? null : <View style={[s.divisore, { backgroundColor: c.bordo, left: spazio.s + larghezzaOre + spazio.m }]} />}
      <View style={[s.ore7, { width: larghezzaOre, opacity: passato ? 0.5 : 1 }]}>
        {e.tuttoIlGiorno ? (
          <Text style={[s.tutto, { color: c.primario }]}>{t('calendario.tuttoIlGiorno')}</Text>
        ) : (
          <>
            <Text style={[s.ora7, { color: c.testo }]} numberOfLines={1}>
              {oraBreve(e.inizio)}
            </Text>
            <Text style={[s.oraFine7, { color: c.testo3 }]} numberOfLines={1}>
              {oraBreve(e.fine)}
            </Text>
          </>
        )}
      </View>
      <View style={{ flex: 1, gap: 2, opacity: passato ? 0.5 : 1 }}>
        <View style={s.rigaTitolo}>
          <Text style={[s.titolo7, { color: c.testo }]} numberOfLines={1}>
            {e.titolo}
          </Text>
          {inCorso ? (
            <View style={[s.ora, { backgroundColor: c.verdeTenue }]}>
              <Text style={[s.oraTesto, { color: c.verde }]}>{t('calendario.adesso')}</Text>
            </View>
          ) : null}
        </View>
        {e.luogo || e.video ? (
          <View style={s.dettaglio}>
            <Ionicons name={e.luogo ? 'location-outline' : 'videocam-outline'} size={13} color={c.testo3} />
            <Text style={[s.dettaglio7, { color: c.testo2 }]} numberOfLines={1}>
              {e.luogo || t('calendario.videochiamata')}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  )
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
  // Le ore in questa vista hanno un carattere piu' piccolo: colonna piu' stretta.
  const ore = Math.round(larghezzaOre * 0.9)
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
              <NumeroGiorno
                numero={giorno.getDate()}
                dimensione={18}
                sfondo={eOggi ? c.primario : undefined}
                colore={eOggi ? c.primarioTesto : g > 4 ? c.testo2 : c.testo}
                grassetto={eOggi}
              />
            </Pressable>
            <View style={s.eventiGiorno}>
              {!lista ? (
                <View style={[s.segnaposto, { backgroundColor: c.superficie2 }]} />
              ) : !lista.length ? (
                <Pressable onPress={() => onGiorno(giorno)} style={({ pressed }) => [s.libero, pressed && { opacity: 0.6 }]} accessibilityRole="button">
                  <Text style={[s.liberoTesto, { color: c.testo3 }]}>{t('calendario.libero')}</Text>
                </Pressable>
              ) : (
                lista.map((e, i) => (
                  <RigaSettimana key={e.id} evento={e} adesso={adesso} larghezzaOre={ore} primo={i === 0} onPress={() => onEvento(e.id)} />
                ))
              )}
            </View>
          </View>
        )
      })}
    </ScrollView>
  )
}

const PALLINI_MAX = 10 // in file da 5

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
  const titoliMax = Math.max(1, Math.floor((altezzaCella - 40) / 18))
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
            <View key={giornoChiave(inizio)} style={[s.rigaMese, { borderTopColor: c.bordo }]}>
              {Array.from({ length: 7 }, (_, g) => {
                const giorno = piuGiorni(inizio, g)
                const chiave = giornoChiave(giorno)
                const fuori = giorno.getMonth() !== mese.getMonth()
                const eOggi = chiave === chiaveOggi
                const eScelto = chiave === chiaveScelto && !eOggi
                const lista = dati ? delGiorno(dati, giorno) : []
                return (
                  <Pressable
                    key={chiave}
                    onPress={() => onGiorno(giorno)}
                    style={({ pressed }) => [s.cella, pressed && { backgroundColor: c.superficie2 }]}
                    accessibilityRole="button"
                    accessibilityLabel={etichettaGiorno(giorno, lista.length)}
                  >
                    <NumeroGiorno
                      numero={giorno.getDate()}
                      dimensione={15}
                      sfondo={eOggi ? c.primario : eScelto ? c.primarioTenue : undefined}
                      colore={eOggi ? c.primarioTesto : eScelto ? c.primario : fuori ? c.testo3 : g > 4 ? c.testo2 : c.testo}
                      grassetto={eOggi || eScelto}
                    />
                    {!lista.length ? null : conTitoli ? (
                      <View style={[s.titoli, fuori && { opacity: 0.5 }]}>
                        {lista.slice(0, lista.length > titoliMax ? titoliMax - 1 : titoliMax).map((e) => (
                          <Text key={e.id} numberOfLines={1} style={[s.titoloCella, { backgroundColor: c.primarioTenue, color: c.testo }]}>
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
                        {lista.slice(0, PALLINI_MAX).map((e) => (
                          <View key={e.id} style={[s.pallino, { backgroundColor: c.primario }]} />
                        ))}
                        {lista.length > PALLINI_MAX ? (
                          <Text style={[s.altri, { color: c.testo2 }]}>+{lista.length - PALLINI_MAX}</Text>
                        ) : null}
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

const PALLINO = 5
const PALLINO_SPAZIO = 3

const s = StyleSheet.create({
  carta: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, padding: spazio.m, borderRadius: raggio.l, borderWidth: 1 },
  ore: { alignItems: 'flex-start' },
  oraInizio: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  oraFine: { fontSize: 13, fontVariant: ['tabular-nums'], marginTop: 2 },
  tutto: { fontSize: 12, fontWeight: '700', lineHeight: 15 },
  rigaTitolo: { flexDirection: 'row', alignItems: 'center', gap: spazio.s },
  titolo: { flex: 1, fontSize: 16, fontWeight: '700' },
  ora: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  oraTesto: { fontSize: 11, fontWeight: '800' },
  dettaglio: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dettaglioTesto: { flex: 1, fontSize: 13 },
  errore: { fontSize: 15, textAlign: 'center', marginVertical: spazio.s },

  settimana: { paddingHorizontal: spazio.l, paddingTop: spazio.xs, paddingBottom: spazio.xxl },
  giornoSettimana: { flexDirection: 'row', gap: spazio.s, paddingVertical: spazio.s },
  data: { minWidth: 44, alignItems: 'center', gap: 2, paddingTop: 6 },
  dataGiorno: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  eventiGiorno: { flex: 1 },
  riga7: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, paddingVertical: 10, paddingHorizontal: spazio.s, borderRadius: raggio.m },
  divisore: { position: 'absolute', top: 0, right: 0, height: StyleSheet.hairlineWidth },
  ore7: { alignItems: 'flex-start' },
  ora7: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  oraFine7: { fontSize: 12, fontVariant: ['tabular-nums'], marginTop: 1 },
  titolo7: { flex: 1, fontSize: 15, fontWeight: '600' },
  dettaglio7: { flex: 1, fontSize: 13 },
  segnaposto: { height: 44, marginVertical: 6, borderRadius: raggio.m, opacity: 0.6 },
  libero: { minHeight: 56, justifyContent: 'center', paddingHorizontal: spazio.s },
  liberoTesto: { fontSize: 14 },

  mese: { flexGrow: 1, paddingHorizontal: spazio.s, paddingBottom: spazio.m },
  lettere: { flexDirection: 'row', paddingBottom: 6 },
  lettera: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },
  attesa: { position: 'absolute', top: 0, right: spazio.m },
  griglia: { flex: 1 },
  rigaMese: { flex: 1, minHeight: 60, flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  cella: { flex: 1, alignItems: 'center', paddingTop: 6, gap: 5, borderRadius: raggio.m, overflow: 'hidden' },
  cerchio: { alignItems: 'center', justifyContent: 'center' },
  cerchioTesto: { textAlign: 'center', includeFontPadding: false },
  pallini: {
    width: PALLINO * 5 + PALLINO_SPAZIO * 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: PALLINO_SPAZIO,
  },
  pallino: { width: PALLINO, height: PALLINO, borderRadius: PALLINO / 2 },
  titoli: { alignSelf: 'stretch', gap: 3, paddingHorizontal: 4 },
  titoloCella: { fontSize: 11, fontWeight: '500', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5, overflow: 'hidden' },
  altri: { fontSize: 10, lineHeight: PALLINO + 2, fontWeight: '700', textAlign: 'center' },
})
