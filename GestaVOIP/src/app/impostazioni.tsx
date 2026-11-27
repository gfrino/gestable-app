/**
 * Lingua, disponibilita', centralino, account. Le leve del telefono (le stesse
 * del softphone in Odoo) solo con VOIP AI; la lingua per tutti.
 */

import * as Application from 'expo-application'
import { useFocusEffect } from 'expo-router'
import * as Updates from 'expo-updates'
import { useCallback, useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, useColorScheme, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LINGUE, linguaTelefono, loc, t, type SceltaLingua } from '../i18n'
import { useLingua } from '../i18n/Lingua'
import { conTelefono } from '../odoo/sessione'
import { chiediPermesso, permesso, pushDisponibile, registraTelefono, serverConNotifiche, type Permesso } from '../notifiche/push'
import { segnalaErrore } from '../ui/crash'
import { preferenze, type Preferenze } from '../voip/api'
import { useApp, useTelefono } from '../voip/Contesto'
import { telefono } from '../voip/telefono'
import {
  COLORI_TEMA,
  ICONE_SCHEDE,
  MAX_IN_BASSO,
  rimonta,
  schedaAvvio,
  schedeVisibili,
  titoloScheda,
  useAspetto,
  type ColoreTema,
  type Modo,
  type Scheda,
} from '../ui/Aspetto'
import { useDisponibili } from '../ui/disponibili'
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
  const disponibili = useDisponibili()
  const [pref, setPref] = useState<Preferenze | null>(null)
  const [uscita, setUscita] = useState(false)
  // Notifiche dei messaggi: solo iPhone e solo se il server ha il modulo GestABLE.
  const [notifiche, setNotifiche] = useState<Permesso | 'senza-modulo' | null>(null)

  const leggiNotifiche = useCallback(async () => {
    if (!pushDisponibile() || !sessione?.utente.uid) {
      return setNotifiche(null)
    }
    try {
      setNotifiche((await serverConNotifiche(sessione.server)) ? await permesso() : 'senza-modulo')
    } catch {
      setNotifiche(null)
    }
  }, [sessione])

  useFocusEffect(
    useCallback(() => {
      if (sessione && conTelefono(sessione)) {
        preferenze(sessione.server).then(setPref).catch(() => setPref(null))
      }
      void leggiNotifiche()
    }, [sessione, leggiNotifiche]),
  )

  async function attivaNotifiche() {
    if (!sessione) {
      return
    }
    try {
      if (await chiediPermesso()) {
        registraTelefono(sessione.server).catch((e) => segnalaErrore(e, 'notifiche: impostazioni'))
      }
    } catch (e) {
      segnalaErrore(e, 'notifiche: impostazioni')
    }
    void leggiNotifiche()
  }

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
  // Menu e schede: un solo elenco, sopra la linea la barra in basso, sotto il
  // menu ≡. Le frecce spostano di un posto, anche oltre la linea. Si spostano
  // solo i posti che questo utente vede (senza telefono niente Tastierino e
  // Recenti, Spese solo con l'app Spese), gli altri restano dove sono.
  const inBasso = schedeVisibili(aspetto.schede, disponibili)
  const nelMenu = schedeVisibili(aspetto.menu, disponibili)
  const avvio = schedaAvvio(aspetto, disponibili)
  function salva(basso: Scheda[], menu: Scheda[]) {
    cambiaAspetto({
      schede: rimonta(aspetto.schede, basso, disponibili),
      menu: rimonta(aspetto.menu, menu, disponibili),
      personalizzato: true,
    })
  }
  /** Su o giu' nella sua lista; dal fondo della barra scende in cima al menu, dalla cima del menu sale in fondo alla barra. */
  function sposta(x: Scheda, verso: -1 | 1) {
    const basso = [...inBasso]
    const menu = [...nelMenu]
    const i = basso.indexOf(x)
    if (i >= 0) {
      if (verso === 1 && i === basso.length - 1) {
        basso.pop()
        menu.unshift(x)
      } else if (i + verso >= 0 && i + verso < basso.length) {
        ;[basso[i], basso[i + verso]] = [basso[i + verso], basso[i]]
      }
    } else {
      const j = menu.indexOf(x)
      if (verso === -1 && j === 0) {
        menu.shift()
        basso.push(x)
      } else if (j + verso >= 0 && j + verso < menu.length) {
        ;[menu[j], menu[j + verso]] = [menu[j + verso], menu[j]]
      }
    }
    salva(basso, menu)
  }
  /** Le frecce che non si possono usare: in basso resta almeno una scheda e ce ne stanno al massimo MAX_IN_BASSO. */
  function puoSalire(x: Scheda): boolean {
    const i = inBasso.indexOf(x)
    if (i >= 0) {
      return i > 0
    }
    return nelMenu.indexOf(x) > 0 || inBasso.length < MAX_IN_BASSO
  }
  function puoScendere(x: Scheda): boolean {
    const i = inBasso.indexOf(x)
    if (i >= 0) {
      return i < inBasso.length - 1 || inBasso.length > 1
    }
    return nelMenu.indexOf(x) < nelMenu.length - 1
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

        {notifiche ? (
          <View style={scheda}>
            <Riga
              c={c}
              titolo={t('notifiche.titolo')}
              testo={
                notifiche === 'concesso'
                  ? t('notifiche.attive')
                  : notifiche === 'negato'
                    ? t('notifiche.spente')
                    : notifiche === 'senza-modulo'
                      ? t('notifiche.senzaModulo')
                      : t('notifiche.daAttivare')
              }
            >
              {notifiche === 'concesso' || notifiche === 'da-chiedere' ? (
                <Switch
                  value={notifiche === 'concesso'}
                  disabled={notifiche === 'concesso'}
                  onValueChange={(v) => {
                    if (v) {
                      void attivaNotifiche()
                    }
                  }}
                  trackColor={{ true: c.verde }}
                />
              ) : null}
            </Riga>
            {notifiche === 'negato' ? (
              <>
                <View style={[s.sep, { backgroundColor: c.bordo }]} />
                <Pressable onPress={() => void Linking.openSettings()} accessibilityRole="button">
                  <Riga c={c} titolo={t('notifiche.apriImpostazioni')}>
                    <Ionicons name="open-outline" size={18} color={c.primario} />
                  </Riga>
                </Pressable>
              </>
            ) : null}
          </View>
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
          <Text style={[s.gruppo, { color: c.testo2 }]}>{t('impostazioni.schedeInBasso')}</Text>
          {inBasso.map((nome, i) => (
            <View key={nome}>
              {i > 0 ? <View style={[s.sep, { backgroundColor: c.bordo }]} /> : null}
              <RigaPosto
                c={c}
                nome={nome}
                avvio={nome === avvio}
                su={puoSalire(nome)}
                giu={puoScendere(nome)}
                onSu={() => sposta(nome, -1)}
                onGiu={() => sposta(nome, 1)}
              />
            </View>
          ))}
          <View style={[s.lineaMenu, { borderTopColor: c.bordo, backgroundColor: c.superficie2 }]}>
            <Ionicons name="menu" size={18} color={c.testo2} />
            <Text style={[s.gruppoTesto, { color: c.testo2 }]}>{t('impostazioni.schedeNelMenu')}</Text>
          </View>
          {nelMenu.map((nome, i) => (
            <View key={nome}>
              {i > 0 ? <View style={[s.sep, { backgroundColor: c.bordo }]} /> : null}
              <RigaPosto
                c={c}
                nome={nome}
                su={puoSalire(nome)}
                giu={puoScendere(nome)}
                onSu={() => sposta(nome, -1)}
                onGiu={() => sposta(nome, 1)}
              />
            </View>
          ))}
          {nelMenu.length === 0 ? (
            <Text style={[s.vuoto, { color: c.testo3 }]}>{t('impostazioni.schedeMenuVuoto')}</Text>
          ) : null}
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
          GestABLE {Application.nativeApplicationVersion || ''} ({Application.nativeBuildVersion || ''})
          {aggiornamento()}
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

/** Una riga di «Menu e schede»: icona, nome, frecce su e giu'. */
function RigaPosto({
  c,
  nome,
  avvio,
  su,
  giu,
  onSu,
  onGiu,
}: {
  c: Colori
  nome: Scheda
  avvio?: boolean
  su: boolean
  giu: boolean
  onSu: () => void
  onGiu: () => void
}) {
  return (
    <View style={s.rigaScheda}>
      <Ionicons name={ICONE_SCHEDE[nome]} size={22} color={avvio ? c.primario : c.testo2} />
      <View style={{ flex: 1 }}>
        <Text style={[s.rigaTitolo, { color: c.testo }]} numberOfLines={1}>
          {titoloScheda(nome)}
        </Text>
        {avvio ? <Text style={[s.rigaTesto, { color: c.primario }]}>{t('impostazioni.schedeAvvio')}</Text> : null}
      </View>
      <Pressable
        onPress={onSu}
        disabled={!su}
        hitSlop={6}
        style={({ pressed }) => [s.freccia, { backgroundColor: pressed ? c.superficie2 : 'transparent', opacity: su ? 1 : 0.25 }]}
        accessibilityRole="button"
        accessibilityState={{ disabled: !su }}
        accessibilityLabel={t('impostazioni.schedeSu', { nome: titoloScheda(nome) })}
      >
        <Ionicons name="chevron-up" size={22} color={c.testo} />
      </Pressable>
      <Pressable
        onPress={onGiu}
        disabled={!giu}
        hitSlop={6}
        style={({ pressed }) => [s.freccia, { backgroundColor: pressed ? c.superficie2 : 'transparent', opacity: giu ? 1 : 0.25 }]}
        accessibilityRole="button"
        accessibilityState={{ disabled: !giu }}
        accessibilityLabel={t('impostazioni.schedeGiu', { nome: titoloScheda(nome) })}
      >
        <Ionicons name="chevron-down" size={22} color={c.testo} />
      </Pressable>
    </View>
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
  gruppo: { fontSize: 13, fontWeight: '600', paddingHorizontal: spazio.l, paddingTop: spazio.m, paddingBottom: spazio.xs },
  lineaMenu: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spazio.s,
    paddingHorizontal: spazio.l,
    paddingVertical: spazio.s,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  gruppoTesto: { fontSize: 13, fontWeight: '600' },
  vuoto: { fontSize: 14, paddingHorizontal: spazio.l, paddingVertical: spazio.m },
})
