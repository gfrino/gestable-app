/**
 * Scheda GestABLE: le app di Odoo rifatte per il telefono (Helpdesk, Spese,
 * Messaggi, Attivita'...). Compaiono solo quelle che l'utente ha in Odoo; le
 * stesse app spariscono dalla griglia di Odoo. Odoo completo si apre dal menu ≡
 * in alto a destra.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect, useRouter, type Href } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Animated, Easing, Image, Modal, Pressable, ScrollView, StyleSheet, Text, useColorScheme, useWindowDimensions, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { spesePossibili } from '../../../modules/gestable-nativo'
import { t } from '../../i18n'
import { APP, conHelpdesk, menuOdoo, menuSalvato } from '../../odoo/capacita'
import { iconaSpese } from '../../odoo/spese'
import { inviaOdoo, rottaOdoo } from '../../ui/comandiOdoo'
import { PulsanteMenu, useMenu } from '../../ui/MenuLaterale'
import { AURORA, AURORA_CHIARA } from '../../ui/odooIniettato'
import { raggio, spazio, useColori } from '../../ui/tema'
import { useApp } from '../../voip/Contesto'

const LOGO = require('../../../assets/logo-gestable.png') as number

type App = {
  chiave: string
  nome: string
  percorso: Href
  /** Icona dell'app di Odoo (dal server) o un simbolo. */
  immagine?: string
  icona?: keyof typeof Ionicons.glyphMap
  numero?: number
}

/** Icona dell'Helpdesk come in Odoo: OCA e Enterprise la tengono in moduli diversi. */
function iconaHelpdesk(server: string, menu: Set<string> | null): string {
  return menu?.has(APP.helpdesk)
    ? `${server}/helpdesk_mgmt/static/description/icon.png`
    : `${server}/helpdesk/static/description/icon.png`
}

export default function SchedaGestable() {
  const c = useColori()
  const scuro = useColorScheme() === 'dark'
  const router = useRouter()
  const { width } = useWindowDimensions()
  const { sessione } = useApp()
  const { contatori } = useMenu()
  const server = sessione?.server || ''
  const uid = sessione?.utente.uid || 0
  const [menu, setMenu] = useState<Set<string> | null>(() => menuSalvato(server, uid))
  const [aperto, setAperto] = useState(false)

  useFocusEffect(
    useCallback(() => {
      if (server && uid) {
        menuOdoo(server, false, uid)
          .then((m) => m && setMenu(m))
          .catch(() => undefined)
      }
    }, [server, uid]),
  )

  const nativo = !!uid
  const apps: App[] = [
    ...(nativo && conHelpdesk(menu)
      ? [{ chiave: 'helpdesk', nome: t('helpdesk.app'), percorso: '/helpdesk' as Href, immagine: iconaHelpdesk(server, menu) }]
      : []),
    ...(nativo && spesePossibili && menu?.has(APP.spese)
      ? [{ chiave: 'spese', nome: t('spese.titolo'), percorso: '/spese' as Href, immagine: iconaSpese(server) }]
      : []),
    ...(nativo
      ? [
          { chiave: 'messaggi', nome: t('accesso.messaggi'), percorso: '/messaggi' as Href, icona: 'chatbubbles' as const, numero: contatori.messaggi },
          { chiave: 'attivita', nome: t('accesso.attivita'), percorso: '/attivita' as Href, icona: 'checkmark-done-circle' as const, numero: contatori.attivita },
        ]
      : []),
  ]

  // Quattro app per riga sul telefono, sei sui display piu' larghi.
  const colonne = width >= 600 ? 6 : 4
  const lato = Math.floor((width - spazio.l * 2) / colonne)

  function apriOdoo() {
    setAperto(false)
    inviaOdoo({ tipo: 'home' })
    router.navigate(rottaOdoo())
  }

  return (
    <SafeAreaView style={[s.pagina, { backgroundColor: scuro ? '#232846' : '#EEF2F8' }]} edges={['top']}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { experimental_backgroundImage: scuro ? AURORA : AURORA_CHIARA }]} />
      <View style={s.barra}>
        <PulsanteMenu />
        <Image source={LOGO} style={s.logo} accessibilityIgnoresInvertColors />
        <Text style={[s.titolo, { color: c.testo }]} numberOfLines={1}>
          GestABLE
        </Text>
        <Pressable
          onPress={() => setAperto(true)}
          hitSlop={10}
          style={s.tasto}
          accessibilityRole="button"
          accessibilityLabel={t('gestable.menu')}
        >
          <Ionicons name="reorder-three-outline" size={28} color={c.testo} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.contenuto}>
        <Text style={[s.sotto, { color: c.testo2 }]}>{t('gestable.sottotitolo')}</Text>
        <View style={s.griglia}>
          {apps.map((a) => (
            <Pressable
              key={a.chiave}
              onPress={() => router.push(a.percorso)}
              style={({ pressed }) => [s.app, { width: lato, opacity: pressed ? 0.7 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={a.numero ? `${a.nome}, ${a.numero}` : a.nome}
            >
              <View style={[s.tessera, { backgroundColor: scuro ? '#2E3456' : '#FFFFFF' }]}>
                {a.immagine ? (
                  <Image source={{ uri: a.immagine }} style={s.immagine} accessibilityIgnoresInvertColors />
                ) : (
                  <Ionicons name={a.icona || 'apps'} size={34} color={c.primario} />
                )}
                {a.numero ? (
                  <View style={[s.numero, { backgroundColor: c.rosso, borderColor: scuro ? '#232846' : '#EEF2F8' }]}>
                    <Text style={s.numeroTesto}>{a.numero > 99 ? '99+' : a.numero}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[s.nome, { color: c.testo }]} numberOfLines={1}>
                {a.nome}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={[s.nota, { color: c.testo3 }]}>{t('gestable.prossimamente')}</Text>
      </ScrollView>

      <MenuDestro aperto={aperto} chiudi={() => setAperto(false)} apriOdoo={apriOdoo} />
    </SafeAreaView>
  )
}

/** Il pannello che entra da destra (come il menu di Odoo): per ora Odoo completo. */
function MenuDestro({ aperto, chiudi, apriOdoo }: { aperto: boolean; chiudi: () => void; apriOdoo: () => void }) {
  const c = useColori()
  const margini = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const larghezza = Math.min(320, Math.round(width * 0.82))
  const [scorre] = useState(() => new Animated.Value(0))

  useEffect(() => {
    if (aperto) {
      scorre.setValue(0)
      Animated.timing(scorre, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
    }
  }, [aperto, scorre])

  function esci(poi?: () => void) {
    Animated.timing(scorre, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
      chiudi()
      poi?.()
    })
  }

  if (!aperto) {
    return null
  }
  const x = scorre.interpolate({ inputRange: [0, 1], outputRange: [larghezza + 24, 0] })

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => esci()} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, s.velo, { opacity: scorre }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => esci()} accessibilityLabel={t('comune.chiudi')} />
      </Animated.View>
      <Animated.View
        style={[s.pannello, { width: larghezza, backgroundColor: c.sfondo, paddingTop: margini.top + spazio.m, transform: [{ translateX: x }] }]}
      >
        <View style={s.pannelloTesta}>
          <Text style={[s.pannelloTitolo, { color: c.testo }]}>{t('gestable.menu')}</Text>
          <Pressable
            onPress={() => esci()}
            hitSlop={10}
            style={[s.chiudi, { backgroundColor: c.superficie, borderColor: c.bordo }]}
            accessibilityRole="button"
            accessibilityLabel={t('comune.chiudi')}
          >
            <Ionicons name="close" size={22} color={c.testo} />
          </Pressable>
        </View>
        <Pressable
          onPress={() => esci(apriOdoo)}
          style={({ pressed }) => [s.voce, { backgroundColor: pressed ? c.superficie2 : c.superficie, borderColor: c.bordo }]}
          accessibilityRole="button"
        >
          <View style={[s.voceIcona, { backgroundColor: c.primarioTenue }]}>
            <Ionicons name="apps" size={22} color={c.primario} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.voceTesto, { color: c.testo }]} numberOfLines={1}>
              {t('gestable.odoo')}
            </Text>
            <Text style={[s.voceSotto, { color: c.testo2 }]} numberOfLines={2}>
              {t('gestable.odooTesto')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.testo3} />
        </Pressable>
      </Animated.View>
    </Modal>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1 },
  barra: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, paddingHorizontal: spazio.m, paddingVertical: spazio.s, minHeight: 56 },
  logo: { width: 30, height: 30 },
  titolo: { flex: 1, fontSize: 24, fontWeight: '800', letterSpacing: -0.3 },
  tasto: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  contenuto: { paddingHorizontal: spazio.l, paddingBottom: spazio.xxl },
  sotto: { fontSize: 15, marginTop: spazio.xs, marginBottom: spazio.l, paddingHorizontal: spazio.xs },
  griglia: { flexDirection: 'row', flexWrap: 'wrap' },
  app: { alignItems: 'center', marginBottom: spazio.l },
  tessera: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1B1F3B',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  immagine: { width: 44, height: 44 },
  numero: { position: 'absolute', top: -6, right: -6, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  numeroTesto: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  nome: { fontSize: 13, fontWeight: '600', marginTop: spazio.s, maxWidth: '96%', textAlign: 'center' },
  nota: { fontSize: 13, textAlign: 'center', marginTop: spazio.l },
  velo: { backgroundColor: 'rgba(5,6,12,0.45)' },
  pannello: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    paddingHorizontal: spazio.l,
    borderTopLeftRadius: 28,
    borderBottomLeftRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: -6, height: 0 },
  },
  pannelloTesta: { flexDirection: 'row', alignItems: 'center', marginBottom: spazio.l, paddingLeft: spazio.xs },
  pannelloTitolo: { flex: 1, fontSize: 22, fontWeight: '800' },
  chiudi: { width: 40, height: 40, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  voce: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, padding: spazio.m, borderRadius: raggio.l, borderWidth: StyleSheet.hairlineWidth },
  voceIcona: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  voceTesto: { fontSize: 16, fontWeight: '700' },
  voceSotto: { fontSize: 13, marginTop: 2 },
})
