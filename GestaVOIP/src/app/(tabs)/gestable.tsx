/**
 * Scheda GestABLE: le app di Odoo rifatte per il telefono (Helpdesk e Ferie;
 * Spese, Messaggi e Attivita' stanno nel menu ☰). Compaiono solo quelle che
 * l'utente ha in Odoo; le stesse app spariscono dalla griglia di Odoo. Il menu ≡ in alto a destra e'
 * quello della scheda Odoo (voci dell'account) con in cima «Odoo Web».
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect, useRouter, type Href } from 'expo-router'
import { useCallback, useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, Text, useColorScheme, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { t } from '../../i18n'
import { leggi } from '../../odoo/archivio'
import { APP, conHelpdesk, menuOdoo, menuSalvato } from '../../odoo/capacita'
import { iconaFerie } from '../../odoo/ferie'
import { inviaOdoo, rottaOdoo } from '../../ui/comandiOdoo'
import { MenuOdoo, type DatiPannello } from '../../ui/MenuOdoo'
import { PulsanteMenu } from '../../ui/MenuLaterale'
import { AURORA, AURORA_CHIARA } from '../../ui/odooIniettato'
import { StatoVuoto } from '../../ui/StatoVuoto'
import { spazio, useColori } from '../../ui/tema'
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
  const server = sessione?.server || ''
  const uid = sessione?.utente.uid || 0
  const [menu, setMenu] = useState<Set<string> | null>(() => menuSalvato(server, uid))
  // Menu di destra come nella scheda Odoo: «Odoo Web» in alto, poi le voci
  // dell'account di Odoo salvate dalla scheda Odoo l'ultima volta che ha caricato.
  const [pannello, setPannello] = useState<DatiPannello | null>(null)

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
    ...(nativo && menu?.has(APP.ferie) ? [{ chiave: 'ferie', nome: t('ferie.app'), percorso: '/ferie' as Href, immagine: iconaFerie(server) }] : []),
  ]

  // Quattro app per riga sul telefono, sei sui display piu' larghi.
  const colonne = width >= 600 ? 6 : 4
  const lato = Math.floor((width - spazio.l * 2) / colonne)

  function apriMenu() {
    setPannello({ app: null, sezioni: [], utente: leggi<DatiPannello['utente']>(server, uid, 'menu-utente') || [] })
  }

  function apriOdoo() {
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
          onPress={apriMenu}
          hitSlop={10}
          style={s.tasto}
          accessibilityRole="button"
          accessibilityLabel={t('accesso.menuOdoo')}
        >
          <Ionicons name="reorder-three-outline" size={28} color={c.testo} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.contenuto}>
        {menu && !apps.length ? (
          <StatoVuoto icona="apps-outline" titolo={t('gestable.nessunaApp')} testo={t('gestable.nessunaAppTesto')} />
        ) : null}
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
      </ScrollView>

      <MenuOdoo
        dati={pannello}
        azienda={sessione?.azienda || ''}
        chiudi={() => setPannello(null)}
        scegliMenu={() => undefined}
        scegliUtente={(i) => {
          const voce = pannello?.utente.find((v) => v.i === i)
          if (voce) {
            inviaOdoo({ tipo: 'utente', testo: voce.testo })
          }
          router.navigate(rottaOdoo())
        }}
        prima={{ testo: t('gestable.odoo'), icona: 'apps', onPress: apriOdoo }}
      />
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  pagina: { flex: 1 },
  barra: { flexDirection: 'row', alignItems: 'center', gap: spazio.s, paddingHorizontal: spazio.m, paddingVertical: spazio.s, minHeight: 56 },
  logo: { width: 30, height: 30 },
  titolo: { flex: 1, fontSize: 24, fontWeight: '800', letterSpacing: -0.3 },
  tasto: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  contenuto: { paddingHorizontal: spazio.l, paddingTop: spazio.m, paddingBottom: spazio.xxl },
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
})
