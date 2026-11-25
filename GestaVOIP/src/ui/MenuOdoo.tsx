/**
 * Menu di destra della scheda Odoo, disegnato dall'app al posto del pannello
 * di Odoo: le sezioni dell'app aperta (Vendite → Ordini, Clienti...) e le voci
 * del menu utente di Odoo (profilo, documentazione, supporto...).
 *
 * I dati li manda la pagina (odooIniettato: __gvPannello) e le scelte tornano a
 * lei (__gvScegli, __gvVoceUtente), cosi' funziona con ogni app e versione di
 * Odoo senza elenchi scritti qui. In basso a destra, piccolo, il logo GestABLE.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { Animated, Easing, Image, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useEffect, useState } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { t } from '../i18n'
import { raggio, spazio, useColori } from './tema'

export type DatiPannello = {
  app: { id: number; nome: string } | null
  sezioni: { nome: string; voci: { id: number; nome: string }[] }[]
  utente: { i: number; id: string; testo: string }[]
}

const LOGO = require('../../assets/logo-gestable.png') as number

// Icone per le voci note del menu utente di Odoo; le altre prendono un punto.
const ICONE_UTENTE: Record<string, keyof typeof Ionicons.glyphMap> = {
  documentation: 'book-outline',
  support: 'help-buoy-outline',
  profile: 'person-circle-outline',
  settings: 'person-circle-outline',
  odoo_account: 'cloud-outline',
  account: 'cloud-outline',
  shortcuts: 'flash-outline',
  subscription: 'card-outline',
}

/** Icona di una voce utente: per identificativo noto, poi dal testo, poi una generica. */
function iconaUtente(v: { id: string; testo: string }): keyof typeof Ionicons.glyphMap {
  if (ICONE_UTENTE[v.id]) {
    return ICONE_UTENTE[v.id]
  }
  const t = v.testo.toLowerCase()
  if (/support|assisten|aiuto|help|hilfe|aide/.test(t)) {
    return 'help-buoy-outline'
  }
  if (/document/.test(t)) {
    return 'book-outline'
  }
  if (/abbonament|subscri|abonnement/.test(t)) {
    return 'card-outline'
  }
  return 'open-outline'
}

type Props = {
  dati: DatiPannello | null
  azienda: string
  chiudi: () => void
  scegliMenu: (id: number) => void
  scegliUtente: (i: number) => void
}

export function MenuOdoo({ dati, azienda, chiudi, scegliMenu, scegliUtente }: Props) {
  const c = useColori()
  const margini = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const larghezza = Math.min(340, Math.round(width * 0.86))
  const [scorre] = useState(() => new Animated.Value(0))
  const aperto = !!dati

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

  if (!dati) {
    return null
  }

  const x = scorre.interpolate({ inputRange: [0, 1], outputRange: [larghezza + 24, 0] })

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => esci()} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, s.velo, { opacity: scorre }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => esci()} accessibilityLabel={t('accesso.chiudiMenu')} />
      </Animated.View>
      <Animated.View
        style={[
          s.pannello,
          { width: larghezza, backgroundColor: c.sfondo, paddingTop: margini.top + spazio.m, transform: [{ translateX: x }] },
        ]}
      >
        {/* Il logo GestABLE, piccolo, su un alone del colore del tema: resta in basso mentre le voci scorrono. */}
        <View pointerEvents="none" style={[s.alone, { experimental_backgroundImage: `radial-gradient(circle at 75% 75%, ${c.primarioTenue} 0%, transparent 70%)` }]} />
        <Image source={LOGO} style={[s.logo, { bottom: margini.bottom + spazio.l }]} accessibilityLabel="GestABLE" />

        <View style={s.testa}>
          <View style={{ flex: 1 }}>
            <Text style={[s.titolo, { color: c.testo }]} numberOfLines={1}>
              {dati.app?.nome || 'Odoo'}
            </Text>
            <Text style={[s.sottotitolo, { color: c.testo2 }]} numberOfLines={1}>
              {azienda}
            </Text>
          </View>
          <Pressable
            onPress={() => esci()}
            hitSlop={10}
            style={({ pressed }) => [s.chiudi, { backgroundColor: pressed ? c.superficie2 : c.superficie, borderColor: c.bordo }]}
            accessibilityRole="button"
            accessibilityLabel={t('accesso.chiudiMenu')}
          >
            <Ionicons name="close" size={22} color={c.testo} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: margini.bottom + 130 }} showsVerticalScrollIndicator={false}>
          {dati.sezioni.map((sez, k) => (
            <View key={`${sez.nome}-${k}`} style={s.blocco}>
              {sez.nome ? <Text style={[s.sezione, { color: c.testo2 }]}>{sez.nome}</Text> : null}
              <View style={[s.scheda, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
                {sez.voci.map((v, i) => (
                  <View key={v.id}>
                    {i > 0 ? <View style={[s.sep, { backgroundColor: c.bordo }]} /> : null}
                    <Pressable
                      onPress={() => esci(() => scegliMenu(v.id))}
                      style={({ pressed }) => [s.voce, pressed && { backgroundColor: c.superficie2 }]}
                      accessibilityRole="button"
                    >
                      <Text style={[s.voceTesto, { color: c.testo }]} numberOfLines={2}>
                        {v.nome}
                      </Text>
                      <Ionicons name="chevron-forward" size={18} color={c.testo3} />
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          ))}

          {dati.utente.length ? (
            <View style={s.blocco}>
              <Text style={[s.sezione, { color: c.testo2 }]}>{t('accesso.menuAccount')}</Text>
              <View style={[s.scheda, { backgroundColor: c.superficie, borderColor: c.bordo }]}>
                {dati.utente.map((v, i) => (
                  <View key={`${v.id}-${v.i}`}>
                    {i > 0 ? <View style={[s.sep, { backgroundColor: c.bordo }]} /> : null}
                    <Pressable
                      onPress={() => esci(() => scegliUtente(v.i))}
                      style={({ pressed }) => [s.voce, pressed && { backgroundColor: c.superficie2 }]}
                      accessibilityRole="button"
                    >
                      <View style={[s.icona, { backgroundColor: c.primarioTenue }]}>
                        <Ionicons name={iconaUtente(v)} size={18} color={c.primario} />
                      </View>
                      <Text style={[s.voceTesto, { color: c.testo }]} numberOfLines={1}>
                        {v.testo}
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
      </Animated.View>
    </Modal>
  )
}

const s = StyleSheet.create({
  velo: { backgroundColor: 'rgba(5,6,12,0.45)' },
  pannello: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    paddingHorizontal: spazio.l,
    borderTopLeftRadius: 28,
    borderBottomLeftRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: -6, height: 0 },
  },
  alone: { position: 'absolute', right: -80, bottom: -80, width: 340, height: 340 },
  // Logo grande e trasparente al 60%: una firma discreta, non un elemento da toccare.
  logo: { position: 'absolute', right: spazio.l, width: 90, height: 90, opacity: 0.4 },
  testa: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, marginBottom: spazio.l, paddingLeft: spazio.xs },
  titolo: { fontSize: 22, fontWeight: '800', letterSpacing: -0.2 },
  sottotitolo: { fontSize: 13, marginTop: 2 },
  chiudi: { width: 40, height: 40, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  blocco: { marginBottom: spazio.l },
  sezione: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spazio.s, marginLeft: spazio.xs },
  scheda: { borderRadius: raggio.l, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: spazio.l },
  voce: { flexDirection: 'row', alignItems: 'center', gap: spazio.m, paddingHorizontal: spazio.l, paddingVertical: 13, minHeight: 50 },
  voceTesto: { flex: 1, fontSize: 16, fontWeight: '600' },
  icona: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
})
