/**
 * Il menu laterale (hamburger): presenze, poi le voci scelte in Impostazioni
 * (all'inizio messaggi, attivita', spese; anche schede spostate dalla barra in
 * basso), impostazioni ed esci.
 *
 * Prende il posto della barra in alto di Odoo: il pallino delle presenze, la
 * chat e l'orologio delle attivita' qui sono schermate dell'app.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import * as Application from 'expo-application'
import { useRouter, type Href } from 'expo-router'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ActivityIndicator, Alert, Animated, AppState, Easing, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { loc, t, tn } from '../i18n'
import { cambiaPresenza, contatori, presenza, urlAvatar, type Contatori, type Presenza } from '../odoo/lavoro'
import { conTelefono } from '../odoo/sessione'
import { controllaLogo, logoSalvato, type LogoCliente } from '../odoo/logoCliente'
import { iconaSpese } from '../odoo/spese'
import { useApp } from '../voip/Contesto'
import { ICONE_SCHEDE, schedeVisibili, titoloScheda, useAspetto, type Scheda } from './Aspetto'
import { Avatar } from './Avatar'
import { useDisponibili } from './disponibili'
import { raggio, spazio, useColori, type Colori } from './tema'

type ValoreMenu = {
  apri: () => void
  contatori: Contatori
  aggiorna: () => void
}

const ContestoMenu = createContext<ValoreMenu | null>(null)

const LARGHEZZA = 312
const OGNI_MS = 60_000

function oreBreve(ore: number): string {
  const h = Math.floor(ore)
  const m = Math.round((ore - h) * 60)
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`
}

export function ProviderMenu({ children }: { children: ReactNode }) {
  const { sessione } = useApp()
  const [visibile, setVisibile] = useState(false)
  const [scorre] = useState(() => new Animated.Value(0))
  const [conta, setConta] = useState<Contatori>({ messaggi: 0, attivita: 0 })
  const server = sessione?.server || ''
  const uid = sessione?.utente.uid || 0

  const aggiorna = useCallback(() => {
    if (!server || !uid) {
      return
    }
    contatori(server, uid)
      .then(setConta)
      .catch(() => undefined)
  }, [server, uid])

  // I numeri sul pulsante restano aggiornati finche' l'app e' davanti.
  useEffect(() => {
    aggiorna()
    let timer = setInterval(aggiorna, OGNI_MS)
    const sub = AppState.addEventListener('change', (stato) => {
      clearInterval(timer)
      if (stato === 'active') {
        aggiorna()
        timer = setInterval(aggiorna, OGNI_MS)
      }
    })
    return () => {
      clearInterval(timer)
      sub.remove()
    }
  }, [aggiorna])

  const chiudi = useCallback(() => {
    Animated.timing(scorre, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() =>
      setVisibile(false),
    )
  }, [scorre])

  const valore = useMemo(
    () => ({
      apri: () => {
        setVisibile(true)
        Animated.timing(scorre, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
        aggiorna()
      },
      contatori: conta,
      aggiorna,
    }),
    [conta, aggiorna, scorre],
  )

  return (
    <ContestoMenu.Provider value={valore}>
      {children}
      {visibile ? <Cassetto scorre={scorre} chiudi={chiudi} contatori={conta} /> : null}
    </ContestoMenu.Provider>
  )
}

export function useMenu(): ValoreMenu {
  const v = useContext(ContestoMenu)
  if (!v) {
    throw new Error('useMenu fuori da ProviderMenu')
  }
  return v
}

/** Il pulsante con le tre righe, con un pallino se c'e' qualcosa da vedere. */
export function PulsanteMenu({ chiaro }: { chiaro?: boolean }) {
  const c = useColori()
  const { apri, contatori: n } = useMenu()
  // Il pallino e' per i messaggi; le attivita' hanno il loro numero nel menu.
  const totale = n.messaggi
  return (
    <Pressable
      onPress={apri}
      hitSlop={12}
      style={({ pressed }) => [s.pulsante, { backgroundColor: pressed ? c.superficie2 : 'transparent' }]}
      accessibilityRole="button"
      accessibilityLabel={totale ? tn('accesso.menuDaVedere', totale) : t('accesso.menu')}
    >
      <Ionicons name="menu" size={26} color={chiaro ? '#FFFFFF' : c.testo} />
      {totale ? <View style={[s.pallino, { backgroundColor: c.rosso, borderColor: c.sfondo }]} /> : null}
    </Pressable>
  )
}

function Voce({
  icona,
  immagine,
  testo,
  numero,
  onPress,
  c,
  pericolo,
}: {
  icona: keyof typeof Ionicons.glyphMap
  /** Icona dell'app di Odoo (es. Spese) al posto del simbolo. */
  immagine?: string
  testo: string
  numero?: number
  onPress: () => void
  c: Colori
  pericolo?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.voce, { backgroundColor: pressed ? c.superficie2 : 'transparent' }]}
      accessibilityRole="button"
      accessibilityLabel={numero ? `${testo}, ${numero}` : testo}
    >
      {immagine ? (
        <View style={[s.voceIcona, { backgroundColor: c.superficie, borderColor: c.bordo, borderWidth: StyleSheet.hairlineWidth }]}>
          <Image source={{ uri: immagine }} style={s.voceImmagine} accessibilityIgnoresInvertColors />
        </View>
      ) : (
        <View style={[s.voceIcona, { backgroundColor: pericolo ? c.rossoTenue : c.primarioTenue }]}>
          <Ionicons name={icona} size={20} color={pericolo ? c.rosso : c.primario} />
        </View>
      )}
      <Text style={[s.voceTesto, { color: pericolo ? c.rosso : c.testo }]} numberOfLines={1}>
        {testo}
      </Text>
      {numero ? (
        <View style={[s.numero, { backgroundColor: c.primario }]}>
          <Text style={[s.numeroTesto, { color: c.primarioTesto }]}>{numero > 999 ? '999+' : numero}</Text>
        </View>
      ) : null}
    </Pressable>
  )
}

function Cassetto({ scorre, chiudi, contatori: n }: { scorre: Animated.Value; chiudi: () => void; contatori: Contatori }) {
  const c = useColori()
  const margini = useSafeAreaInsets()
  const router = useRouter()
  const { sessione, esci } = useApp()
  const [pres, setPres] = useState<Presenza | null>(null)
  const [cambia, setCambia] = useState(false)
  const server = sessione?.server || ''
  // Le voci scelte in Impostazioni, solo quelle che questo utente ha (Spese solo con l'app Spese in Odoo).
  const disponibili = useDisponibili()
  const { aspetto } = useAspetto()
  const voci = schedeVisibili(aspetto.menu, disponibili)

  // Le presenze si leggono a ogni apertura del menu.
  useEffect(() => {
    let vivo = true
    if (server) {
      presenza(server).then((p) => vivo && setPres(p))
    }
    return () => {
      vivo = false
    }
  }, [server])

  function vai(percorso: Href) {
    chiudi()
    router.push(percorso)
  }

  /** Messaggi, Attivita' e Spese si aprono sopra le schede; una scheda spostata nel menu si apre come scheda. */
  function apriVoce(x: Scheda) {
    if (x === 'messaggi') {
      vai('/messaggi')
    } else if (x === 'attivita') {
      vai('/attivita')
    } else if (x === 'spese') {
      vai({ pathname: '/spese', params: { scansiona: '1' } })
    } else {
      chiudi()
      router.navigate((x === 'index' ? '/' : `/${x}`) as Href)
    }
  }

  async function timbra() {
    if (!server || !pres) {
      return
    }
    setCambia(true)
    try {
      setPres(await cambiaPresenza(server))
    } catch (e) {
      Alert.alert(t('accesso.presenze'), e instanceof Error ? e.message : String(e))
    } finally {
      setCambia(false)
    }
  }

  function chiediUscita() {
    const avviso = conTelefono(sessione)
      ? t('accesso.uscireTelefono')
      : t('accesso.uscireSenzaTelefono')
    Alert.alert(t('accesso.uscireTitolo'), avviso, [
      { text: t('comune.annulla'), style: 'cancel' },
      {
        text: t('comune.esci'),
        style: 'destructive',
        onPress: () => {
          chiudi()
          void esci()
        },
      },
    ])
  }

  if (!sessione) {
    return null
  }

  const x = scorre.interpolate({ inputRange: [0, 1], outputRange: [-LARGHEZZA - 20, 0] })
  const nome = sessione.utente.name || sessione.utente.login
  const entrata = pres?.entrata?.toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' })

  return (
    <Modal visible transparent animationType="none" onRequestClose={chiudi} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, s.velo, { opacity: scorre }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={chiudi} accessibilityLabel={t('accesso.chiudiMenu')} />
      </Animated.View>
      <Animated.View
        style={[
          s.pannello,
          { backgroundColor: c.sfondo, paddingTop: margini.top + spazio.l, paddingBottom: margini.bottom + spazio.l },
          { transform: [{ translateX: x }] },
        ]}
      >
        <View style={s.testa}>
          <Avatar url={sessione.utente.uid ? urlAvatar(server, 'res.users', sessione.utente.uid) : undefined} nome={nome} lato={56} />
          <View style={{ flex: 1 }}>
            <Text style={[s.nome, { color: c.testo }]} numberOfLines={1}>
              {nome}
            </Text>
            <Text style={[s.azienda, { color: c.testo2 }]} numberOfLines={1}>
              {sessione.azienda || server.replace(/^https?:\/\//, '')}
            </Text>
          </View>
        </View>

        {pres ? (
          <View style={[s.presenza, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
            <View style={[s.punto, { backgroundColor: pres.dentro ? c.verde : c.rosso }]} />
            <View style={{ flex: 1 }}>
              <Text style={[s.presenzaTitolo, { color: c.testo }]} numberOfLines={1}>
                {pres.dentro ? t('accesso.alLavoroDalle', { ora: entrata || '—' }) : t('accesso.nonAlLavoro')}
              </Text>
              <Text style={[s.presenzaTesto, { color: c.testo2 }]} numberOfLines={1}>
                {t('accesso.oggi', { ore: oreBreve(pres.oreOggi) })}
              </Text>
            </View>
            <Pressable
              onPress={timbra}
              disabled={cambia}
              style={({ pressed }) => [
                s.timbra,
                { backgroundColor: pres.dentro ? c.rossoTenue : c.verdeTenue, opacity: pressed ? 0.8 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={pres.dentro ? t('accesso.registraUscita') : t('accesso.registraEntrata')}
            >
              {cambia ? (
                <ActivityIndicator size="small" color={pres.dentro ? c.rosso : c.verde} />
              ) : (
                <Text style={[s.timbraTesto, { color: pres.dentro ? c.rosso : c.verde }]} numberOfLines={1}>
                  {pres.dentro ? t('accesso.timbraUscita') : t('accesso.timbraEntrata')}
                </Text>
              )}
            </Pressable>
          </View>
        ) : null}

        <View style={s.voci}>
          {/* Messaggi e Attivita': chi e' entrato dalla pagina di Odoo (Google, Microsoft) li ha nella vista Odoo. */}
          {voci.map((x) => (
            <Voce
              key={x}
              c={c}
              icona={ICONE_SCHEDE[x]}
              immagine={x === 'spese' ? iconaSpese(server) : undefined}
              testo={titoloScheda(x)}
              numero={x === 'messaggi' ? n.messaggi : x === 'attivita' ? n.attivita : undefined}
              onPress={() => apriVoce(x)}
            />
          ))}
          <Voce c={c} icona="settings" testo={t('impostazioni.titolo')} onPress={() => vai('/impostazioni')} />
        </View>

        <View style={{ flex: 1 }} />
        <LogoAzienda server={server} />
        <Voce c={c} icona="log-out-outline" testo={t('comune.esci')} onPress={chiediUscita} pericolo />
        <Text style={[s.versione, { color: c.testo3 }]}>
          GestABLE {Application.nativeApplicationVersion || ''}
        </Text>
      </Animated.View>
    </Modal>
  )
}

/**
 * Il logo dell'azienda (da GestaClient), con le sue proporzioni, allineato a
 * sinistra sullo sfondo del menu (senza riquadro). Senza logo (404) non occupa spazio.
 */
function LogoAzienda({ server }: { server: string }) {
  const [logo, setLogo] = useState<LogoCliente | undefined>(() => (server ? logoSalvato(server) : undefined))

  useEffect(() => {
    let vivo = true
    if (server) {
      void controllaLogo(server).then((l) => vivo && l !== undefined && setLogo(l))
    }
    return () => {
      vivo = false
    }
  }, [server])

  if (!logo) {
    return null
  }
  const largo = LARGHEZZA - spazio.l * 2 - spazio.s * 2
  // Loghi quadrati o alti: non piu' di 72 punti.
  const alto = Math.min(72, largo / logo.rapporto)
  return (
    <View style={s.logo} accessibilityRole="image" accessibilityLabel="Logo">
      <Image source={{ uri: logo.url, cache: 'force-cache' }} style={{ width: alto * logo.rapporto, height: alto }} resizeMode="contain" />
    </View>
  )
}

const s = StyleSheet.create({
  pulsante: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  pallino: { position: 'absolute', top: 8, right: 7, width: 11, height: 11, borderRadius: 6, borderWidth: 2 },
  velo: { backgroundColor: 'rgba(5,6,12,0.55)' },
  pannello: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: LARGHEZZA,
    paddingHorizontal: spazio.l,
    borderTopRightRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 6, height: 0 },
  },
  testa: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, paddingHorizontal: spazio.xs, marginBottom: spazio.xl },
  nome: { fontSize: 19, fontWeight: '700' },
  azienda: { fontSize: 14, marginTop: 2 },
  presenza: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spazio.m,
    padding: spazio.m,
    borderRadius: raggio.l,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spazio.l,
  },
  punto: { width: 12, height: 12, borderRadius: 6 },
  presenzaTitolo: { fontSize: 15, fontWeight: '600' },
  presenzaTesto: { fontSize: 13, marginTop: 1 },
  timbra: { minWidth: 72, height: 36, borderRadius: 18, paddingHorizontal: spazio.m, alignItems: 'center', justifyContent: 'center' },
  timbraTesto: { fontSize: 15, fontWeight: '700' },
  voci: { gap: 2 },
  voce: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, paddingHorizontal: spazio.s, paddingVertical: 10, borderRadius: raggio.m },
  voceIcona: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  voceImmagine: { width: 28, height: 28 },
  voceTesto: { flex: 1, fontSize: 17, fontWeight: '600' },
  numero: { minWidth: 26, height: 22, borderRadius: 11, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  numeroTesto: { fontSize: 12, fontWeight: '800' },
  versione: { fontSize: 12, textAlign: 'center', marginTop: spazio.s },
  // Senza riquadro: il logo sta sullo sfondo del menu, allineato a sinistra come le voci.
  logo: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: spazio.s,
    paddingVertical: spazio.s,
    marginBottom: spazio.m,
  },
})
