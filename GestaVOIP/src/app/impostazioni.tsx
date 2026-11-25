/**
 * Lingua, disponibilita', centralino, account. Le leve del telefono (le stesse
 * del softphone in Odoo) solo con VOIP AI; la lingua per tutti.
 */

import * as Application from 'expo-application'
import { useFocusEffect } from 'expo-router'
import * as Updates from 'expo-updates'
import { useCallback, useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, useColorScheme, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LINGUE, linguaTelefono, loc, t, type SceltaLingua } from '../i18n'
import { useLingua } from '../i18n/Lingua'
import { conTelefono } from '../odoo/sessione'
import { preferenze, type Preferenze } from '../voip/api'
import { useApp, useTelefono } from '../voip/Contesto'
import { telefono } from '../voip/telefono'
import { COLORI_TEMA, ICONE_SCHEDE, schedaAvvio, schedeVisibili, titoloScheda, useAspetto, type ColoreTema, type Modo } from '../ui/Aspetto'
import { Pulsante } from '../ui/Pulsante'
import { Testata } from '../ui/Testata'
import { raggio, spazio, useColori, type Colori } from '../ui/tema'

function Riga({ titolo, testo, children, c }: { titolo: string; testo?: string; children?: React.ReactNode; c: Colori }) {
  return (
    <View style={s.riga}>
      <View style={{ flex: 1 }}>
        <Text style={[s.rigaTitolo, { color: c.testo }]}>{titolo}</Text>
        {testo ? <Text style={[s.rigaTesto, { color: c.testo2 }]}>{testo}</Text> : null}
      </View>
      {children}
    </View>
  )
}

// Quale codice gira: quello della build o un aggiornamento OTA (con la data),
// cosi' chi segnala un problema dice anche da quale versione.
function aggiornamento(): string {
  if (Updates.isEmbeddedLaunch || !Updates.createdAt) {
    return ''
  }
  const quando = Updates.createdAt.toLocaleString(loc(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  return t('impostazioni.aggiornamento', { quando })
}

export default function Impostazioni() {
  const c = useColori()
  const { sessione, esci } = useApp()
  const { disponibile } = useTelefono()
  const { scelta, cambia } = useLingua()
  const { aspetto, cambia: cambiaAspetto } = useAspetto()
  const scuro = useColorScheme() === 'dark'
  const telefonoAttivo = conTelefono(sessione)
  const [pref, setPref] = useState<Preferenze | null>(null)
  const [uscita, setUscita] = useState(false)

  useFocusEffect(
    useCallback(() => {
      if (sessione && conTelefono(sessione)) {
        preferenze(sessione.server).then(setPref).catch(() => setPref(null))
      }
    }, [sessione]),
  )

  async function centralino(valore: boolean) {
    if (!sessione) {
      return
    }
    try {
      const r = await preferenze(sessione.server, { inbound_ring: valore })
      setPref(r)
    } catch (e) {
      // L'ultimo del centralino non puo' togliersi: il server spiega perche'.
      Alert.alert(t('impostazioni.centralinoErrore'), e instanceof Error ? e.message : String(e))
    }
  }

  async function disponibilita(valore: boolean) {
    try {
      await telefono.impostaDisponibile(valore)
    } catch (e) {
      Alert.alert(t('impostazioni.disponibilitaErrore'), e instanceof Error ? e.message : String(e))
    }
  }

  function chiediUscita() {
    Alert.alert(t('impostazioni.esciTitolo'), t(telefonoAttivo ? 'impostazioni.esciTelefono' : 'impostazioni.esciSenzaTelefono'), [
      { text: t('comune.annulla'), style: 'cancel' },
      {
        text: t('comune.esci'),
        style: 'destructive',
        onPress: async () => {
          setUscita(true)
          await esci()
        },
      },
    ])
  }

  const modi: { valore: Modo; nome: string; testo?: string }[] = [
    { valore: 'auto', nome: t('impostazioni.modoAuto'), testo: t('impostazioni.modoAutoTesto') },
    { valore: 'chiaro', nome: t('impostazioni.modoChiaro') },
    { valore: 'scuro', nome: t('impostazioni.modoScuro') },
  ]
  // Ordine delle schede: si spostano solo quelle che questo utente vede (senza
  // telefono niente Tastierino e Recenti), le altre restano al loro posto.
  const visibili = schedeVisibili(aspetto.schede, telefonoAttivo)
  const avvio = schedaAvvio(aspetto, telefonoAttivo)
  function sposta(i: number, verso: -1 | 1) {
    const j = i + verso
    if (j < 0 || j >= visibili.length) {
      return
    }
    const nuove = [...visibili]
    ;[nuove[i], nuove[j]] = [nuove[j], nuove[i]]
    let k = 0
    cambiaAspetto({ schede: aspetto.schede.map((x) => (visibili.includes(x) ? nuove[k++] : x)), personalizzato: true })
  }

  const scheda = [s.scheda, { backgroundColor: c.superficie, borderColor: c.bordo }]
  const nomeTelefono = LINGUE.find((l) => l.valore === linguaTelefono())?.nome || ''
  const scelte: { valore: SceltaLingua; nome: string; testo?: string }[] = [
    { valore: 'auto', nome: t('impostazioni.linguaAuto'), testo: t('impostazioni.linguaAutoTesto', { lingua: nomeTelefono }) },
    ...LINGUE,
  ]

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: c.sfondo }]} edges={['top']}>
      <Testata titolo={t('impostazioni.titolo')} />
      <ScrollView contentContainerStyle={s.contenuto}>

        {telefonoAttivo ? (
          <>
            <View style={scheda}>
              <Riga
                c={c}
                titolo={t('impostazioni.disponibile')}
                testo={disponibile ? t('impostazioni.disponibileSi') : t('impostazioni.disponibileNo')}
              >
                <Switch value={disponibile} onValueChange={disponibilita} trackColor={{ true: c.verde }} />
              </Riga>
              <View style={[s.sep, { backgroundColor: c.bordo }]} />
              <Riga c={c} titolo={t('impostazioni.centralino')} testo={t('impostazioni.centralinoTesto')}>
                <Switch
                  value={!!pref?.inbound_ring}
                  onValueChange={centralino}
                  disabled={!pref}
                  trackColor={{ true: c.primario }}
                />
              </Riga>
            </View>

            <View style={scheda}>
              <Riga c={c} titolo={t('impostazioni.interno')} testo={pref?.extension || '-'} />
              <View style={[s.sep, { backgroundColor: c.bordo }]} />
              <Riga c={c} titolo={t('impostazioni.numeroDiretto')} testo={pref?.direct_number || t('comune.nessuno')} />
            </View>
          </>
        ) : null}

        <Text style={[s.sezione, { color: c.testo2 }]}>{t('impostazioni.lingua')}</Text>
        <View style={scheda}>
          {scelte.map((l, i) => (
            <View key={l.valore}>
              {i > 0 ? <View style={[s.sep, { backgroundColor: c.bordo }]} /> : null}
              <Pressable
                onPress={() => void cambia(l.valore)}
                style={({ pressed }) => pressed && { backgroundColor: c.superficie2 }}
                accessibilityRole="radio"
                accessibilityState={{ selected: scelta === l.valore }}
              >
                <Riga c={c} titolo={l.nome} testo={l.testo}>
                  {scelta === l.valore ? <Ionicons name="checkmark" size={22} color={c.primario} /> : null}
                </Riga>
              </Pressable>
            </View>
          ))}
        </View>

        <Text style={[s.sezione, { color: c.testo2 }]}>{t('impostazioni.aspetto')}</Text>
        <View style={scheda}>
          {modi.map((m, i) => (
            <View key={m.valore}>
              {i > 0 ? <View style={[s.sep, { backgroundColor: c.bordo }]} /> : null}
              <Pressable
                onPress={() => cambiaAspetto({ modo: m.valore })}
                style={({ pressed }) => pressed && { backgroundColor: c.superficie2 }}
                accessibilityRole="radio"
                accessibilityState={{ selected: aspetto.modo === m.valore }}
              >
                <Riga c={c} titolo={m.nome} testo={m.testo}>
                  {aspetto.modo === m.valore ? <Ionicons name="checkmark" size={22} color={c.primario} /> : null}
                </Riga>
              </Pressable>
            </View>
          ))}
        </View>

        <Text style={[s.sezione, { color: c.testo2 }]}>{t('impostazioni.colore')}</Text>
        <View style={[scheda, s.colori]}>
          {(Object.keys(COLORI_TEMA) as ColoreTema[]).map((nome) => {
            const scelto = aspetto.colore === nome
            const tinta = COLORI_TEMA[nome][scuro ? 'scuro' : 'chiaro'][0]
            const etichetta = t(`impostazioni.colore${nome.charAt(0).toUpperCase()}${nome.slice(1)}`)
            return (
              <Pressable
                key={nome}
                onPress={() => cambiaAspetto({ colore: nome })}
                style={s.colore}
                accessibilityRole="radio"
                accessibilityLabel={etichetta}
                accessibilityState={{ selected: scelto }}
              >
                <View style={[s.cerchio, { backgroundColor: tinta, borderColor: scelto ? c.testo : 'transparent' }]}>
                  {scelto ? <Ionicons name="checkmark" size={22} color={scuro ? '#0E1018' : '#FFFFFF'} /> : null}
                </View>
                <Text style={[s.coloreNome, { color: scelto ? c.testo : c.testo2 }]} numberOfLines={1}>
                  {etichetta}
                </Text>
              </Pressable>
            )
          })}
        </View>

        <Text style={[s.sezione, { color: c.testo2 }]}>{t('impostazioni.schede')}</Text>
        <View style={scheda}>
          {visibili.map((nome, i) => (
            <View key={nome}>
              {i > 0 ? <View style={[s.sep, { backgroundColor: c.bordo }]} /> : null}
              <View style={s.rigaScheda}>
                <Ionicons name={ICONE_SCHEDE[nome]} size={22} color={nome === avvio ? c.primario : c.testo2} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.rigaTitolo, { color: c.testo }]} numberOfLines={1}>
                    {titoloScheda(nome)}
                  </Text>
                  {nome === avvio ? (
                    <Text style={[s.rigaTesto, { color: c.primario }]}>{t('impostazioni.schedeAvvio')}</Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => sposta(i, -1)}
                  disabled={i === 0}
                  hitSlop={6}
                  style={({ pressed }) => [s.freccia, { backgroundColor: pressed ? c.superficie2 : 'transparent', opacity: i === 0 ? 0.25 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('impostazioni.schedeSu', { nome: titoloScheda(nome) })}
                >
                  <Ionicons name="chevron-up" size={22} color={c.testo} />
                </Pressable>
                <Pressable
                  onPress={() => sposta(i, 1)}
                  disabled={i === visibili.length - 1}
                  hitSlop={6}
                  style={({ pressed }) => [
                    s.freccia,
                    { backgroundColor: pressed ? c.superficie2 : 'transparent', opacity: i === visibili.length - 1 ? 0.25 : 1 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t('impostazioni.schedeGiu', { nome: titoloScheda(nome) })}
                >
                  <Ionicons name="chevron-down" size={22} color={c.testo} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
        <Text style={[s.nota, { color: c.testo3 }]}>{t('impostazioni.schedeTesto')}</Text>

        <View style={scheda}>
          <Riga c={c} titolo={sessione?.utente.name || ''} testo={sessione?.utente.login} />
          <View style={[s.sep, { backgroundColor: c.bordo }]} />
          <Riga
            c={c}
            titolo={sessione?.azienda || sessione?.db || ''}
            testo={sessione?.server.replace(/^https?:\/\//, '')}
          />
        </View>

        <Pulsante testo={t('comune.esci')} variante="pericolo" onPress={chiediUscita} occupato={uscita} />
        <Text style={[s.versione, { color: c.testo3 }]}>
          GestaVOIP {Application.nativeApplicationVersion || ''} ({Application.nativeBuildVersion || ''})
          {aggiornamento()}
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1 },
  contenuto: { padding: spazio.xl, gap: spazio.l },
  scheda: { borderWidth: StyleSheet.hairlineWidth, borderRadius: raggio.l, overflow: 'hidden' },
  riga: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, padding: spazio.l, minHeight: 60 },
  rigaTitolo: { fontSize: 16, fontWeight: '600' },
  rigaTesto: { fontSize: 13, marginTop: 2 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: spazio.l },
  sezione: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: -spazio.s, marginLeft: spazio.xs },
  versione: { textAlign: 'center', fontSize: 12, marginTop: spazio.s },
  nota: { fontSize: 13, marginTop: -spazio.s, marginHorizontal: spazio.xs },
  colori: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spazio.l, paddingHorizontal: spazio.m },
  colore: { alignItems: 'center', gap: 6, flex: 1 },
  cerchio: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  coloreNome: { fontSize: 12, fontWeight: '600' },
  rigaScheda: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, paddingVertical: spazio.s, paddingLeft: spazio.l, paddingRight: spazio.s, minHeight: 56 },
  freccia: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
})
