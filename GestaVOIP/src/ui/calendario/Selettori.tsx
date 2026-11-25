/**
 * Scelta di un giorno (mese a griglia) e di un'ora (ore e minuti a tasti),
 * scritte in JavaScript: niente moduli nativi, l'app resta aggiornabile senza
 * passare dagli store.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { lingua, loc, t } from '../../i18n'
import { giornoChiave, lettereGiorni } from '../../odoo/calendario'
import { Foglio } from '../Foglio'
import { raggio, spazio, useColori } from '../tema'

function stessoGiorno(a: Date, b: Date): boolean {
  return giornoChiave(a) === giornoChiave(b)
}

/** Foglio con il mese: tocca un giorno per sceglierlo. Tiene l'ora di `valore`. */
export function SceltaGiorno({
  aperto,
  titolo,
  valore,
  chiudi,
  scegli,
}: {
  aperto: boolean
  titolo: string
  valore: Date
  chiudi: () => void
  scegli: (d: Date) => void
}) {
  const c = useColori()
  const [mese, setMese] = useState(() => new Date(valore.getFullYear(), valore.getMonth(), 1))
  const [visto, setVisto] = useState(aperto)
  // Riaperto: riparte dal mese del valore.
  if (aperto !== visto) {
    setVisto(aperto)
    if (aperto) {
      setMese(new Date(valore.getFullYear(), valore.getMonth(), 1))
    }
  }
  const primo = (mese.getDay() + 6) % 7
  const giorni = new Date(mese.getFullYear(), mese.getMonth() + 1, 0).getDate()
  const celle: (Date | null)[] = [
    ...Array.from({ length: primo }, () => null),
    ...Array.from({ length: giorni }, (_, i) => new Date(mese.getFullYear(), mese.getMonth(), i + 1)),
  ]
  while (celle.length % 7) {
    celle.push(null)
  }
  const oggi = new Date()
  const nomeMese = mese.toLocaleDateString(loc(), { month: 'long', year: 'numeric' })
  const sposta = (n: number) => setMese(new Date(mese.getFullYear(), mese.getMonth() + n, 1))

  return (
    <Foglio aperto={aperto} titolo={titolo} chiudi={chiudi} fatto={t('comune.chiudi')}>
      <View style={s.mese}>
        <Pressable onPress={() => sposta(-1)} hitSlop={10} style={s.freccia} accessibilityLabel={t('calendario.mesePrima')} accessibilityRole="button">
          <Ionicons name="chevron-back" size={24} color={c.primario} />
        </Pressable>
        <Text style={[s.meseNome, { color: c.testo }]} numberOfLines={1}>
          {nomeMese.charAt(0).toUpperCase() + nomeMese.slice(1)}
        </Text>
        <Pressable onPress={() => sposta(1)} hitSlop={10} style={s.freccia} accessibilityLabel={t('calendario.meseDopo')} accessibilityRole="button">
          <Ionicons name="chevron-forward" size={24} color={c.primario} />
        </Pressable>
      </View>
      <View style={s.griglia}>
        {lettereGiorni().map((l, i) => (
          <Text key={`l${i}`} style={[s.lettera, { color: i > 4 ? c.testo3 : c.testo2 }]}>
            {l}
          </Text>
        ))}
        {celle.map((d, i) => {
          if (!d) {
            return <View key={`v${i}`} style={s.cella} />
          }
          const scelto = stessoGiorno(d, valore)
          const eOggi = stessoGiorno(d, oggi)
          return (
            <Pressable
              key={giornoChiave(d)}
              style={s.cella}
              onPress={() => {
                const x = new Date(valore)
                x.setFullYear(d.getFullYear(), d.getMonth(), d.getDate())
                scegli(x)
                chiudi()
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: scelto }}
              accessibilityLabel={d.toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' })}
            >
              <View style={[s.numero, scelto && { backgroundColor: c.primario }]}>
                <Text
                  style={[
                    s.numeroTesto,
                    { color: scelto ? c.primarioTesto : eOggi ? c.primario : c.testo },
                    (scelto || eOggi) && { fontWeight: '800' },
                  ]}
                >
                  {d.getDate()}
                </Text>
              </View>
            </Pressable>
          )
        })}
      </View>
      <Pressable
        onPress={() => {
          setMese(new Date(oggi.getFullYear(), oggi.getMonth(), 1))
        }}
        style={s.oggi}
        accessibilityRole="button"
      >
        <Text style={[s.oggiTesto, { color: c.primario }]}>{t('calendario.vaiAOggi')}</Text>
      </Pressable>
    </Foglio>
  )
}

const MINUTI = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

/** Il tasto di un'ora: «09» in italiano, «9 AM» in inglese (12 ore). */
function nomeOra(h: number, dodici: boolean): string {
  return dodici ? `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}` : String(h).padStart(2, '0')
}

/** Foglio con le ore (0-23) e i minuti (a 5): si sceglie l'ora, poi i minuti. */
export function SceltaOra({
  aperto,
  titolo,
  valore,
  chiudi,
  scegli,
}: {
  aperto: boolean
  titolo: string
  valore: Date
  chiudi: () => void
  scegli: (d: Date) => void
}) {
  const c = useColori()
  // In inglese le ore a 12 («12 AM» ... «11 PM»): tasti piu' larghi, 4 per riga.
  const dodici = lingua() === 'en'
  const tasto = (testo: string, attivo: boolean, onPress: () => void, chiave: string, largo = false) => (
    <Pressable
      key={chiave}
      onPress={onPress}
      style={[s.tasto, largo && s.tastoLargo, { borderColor: attivo ? c.primario : c.bordo, backgroundColor: attivo ? c.primario : c.superficie }]}
      accessibilityRole="button"
      accessibilityState={{ selected: attivo }}
    >
      <Text
        style={[s.tastoTesto, largo && s.tastoTestoLargo, { color: attivo ? c.primarioTesto : c.testo }]}
        numberOfLines={1}
        adjustsFontSizeToFit={largo}
        minimumFontScale={0.7}
      >
        {testo}
      </Text>
    </Pressable>
  )
  const conOra = (h: number, m: number) => {
    const x = new Date(valore)
    x.setHours(h, m, 0, 0)
    return x
  }
  return (
    <Foglio aperto={aperto} titolo={titolo} chiudi={chiudi}>
      <ScrollView contentContainerStyle={s.ore}>
        <Text style={[s.sezione, { color: c.testo2 }]}>{t('calendario.ora')}</Text>
        <View style={s.tasti}>
          {Array.from({ length: 24 }, (_, h) =>
            tasto(nomeOra(h, dodici), valore.getHours() === h, () => scegli(conOra(h, valore.getMinutes())), `h${h}`, dodici),
          )}
        </View>
        <Text style={[s.sezione, { color: c.testo2 }]}>{t('calendario.minuti')}</Text>
        <View style={s.tasti}>
          {MINUTI.map((m) =>
            tasto(
              `:${String(m).padStart(2, '0')}`,
              valore.getMinutes() === m,
              () => {
                scegli(conOra(valore.getHours(), m))
                chiudi()
              },
              `m${m}`,
            ),
          )}
        </View>
      </ScrollView>
    </Foglio>
  )
}

const s = StyleSheet.create({
  mese: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spazio.m, paddingVertical: spazio.m },
  freccia: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  meseNome: { flex: 1, textAlign: 'center', fontSize: 20, fontWeight: '800' },
  griglia: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spazio.s },
  lettera: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 13, fontWeight: '700', paddingVertical: spazio.s },
  cella: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  numero: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  numeroTesto: { fontSize: 17, fontWeight: '600' },
  oggi: { alignSelf: 'center', padding: spazio.m, marginTop: spazio.s },
  oggiTesto: { fontSize: 16, fontWeight: '700' },
  ore: { padding: spazio.l, gap: spazio.m },
  sezione: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  tasti: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tasto: { width: '15%', minHeight: 44, borderRadius: raggio.m, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  tastoTesto: { fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  tastoLargo: { width: '23%', paddingHorizontal: 4 },
  tastoTestoLargo: { fontSize: 16 },
})
