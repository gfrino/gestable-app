import Ionicons from '@expo/vector-icons/Ionicons'
import { Tabs, useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'
import { Image } from 'react-native'
import { conTelefono } from '../../odoo/sessione'
import { ICONE_SCHEDE, SCHEDE_TELEFONO, schedaAvvio, titoloScheda, useAspetto } from '../../ui/Aspetto'
import { useApp, useTelefono } from '../../voip/Contesto'
import { useColori } from '../../ui/tema'

// La «G» del logo, a un colore (si tinge come le altre icone della barra).
const G = require('../../../assets/caricamento-g.png') as number

export default function LayoutSchede() {
  const c = useColori()
  const { chiamata } = useTelefono()
  const { sessione } = useApp()
  // Stessa barra per tutti i server; Tastierino e Recenti solo con VOIP AI,
  // senza l'app si apre su Odoo.
  const telefono = conTelefono(sessione)
  const router = useRouter()
  const aperta = useRef(false)

  // La schermata della chiamata si apre da sola quando una chiamata parte o
  // viene accettata (anche da CallKit, con l'app ripresa dallo schermo
  // bloccato), e si chiude quando la chiamata finisce.
  useEffect(() => {
    const viva = !!chiamata && chiamata.fase !== 'in-arrivo'
    if (viva && !aperta.current) {
      aperta.current = true
      router.push('/chiamata')
    } else if (!chiamata && aperta.current) {
      aperta.current = false
      if (router.canGoBack()) {
        router.back()
      }
    }
  }, [chiamata, router])

  // Ordine scelto in Impostazioni; la prima scheda visibile si apre all'avvio.
  const { aspetto } = useAspetto()
  const { schede } = aspetto
  const prima = schedaAvvio(aspetto, telefono)

  return (
    <Tabs
      initialRouteName={prima}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primario,
        tabBarInactiveTintColor: c.testo3,
        tabBarStyle: { backgroundColor: c.superficie, borderTopColor: c.bordo },
      }}
    >
      {schede.map((nome) => (
        <Tabs.Screen
          key={nome}
          name={nome}
          options={{
            href: telefono || !SCHEDE_TELEFONO.includes(nome) ? undefined : null,
            title: titoloScheda(nome),
            tabBarIcon: ({ color, size }) =>
              nome === 'gestable' ? (
                <Image source={G} style={{ width: size, height: size, tintColor: color }} accessibilityIgnoresInvertColors />
              ) : (
                <Ionicons name={ICONE_SCHEDE[nome]} color={color} size={size} />
              ),
          }}
        />
      ))}
      {/* Odoo completo: si apre dal menu ≡ di GestABLE e da «Apri in Odoo»; non ha
          un tasto in basso. Si prepara dietro dall'avvio (vedi odoo.tsx). */}
      <Tabs.Screen name="odoo" options={{ href: null, lazy: false, title: 'Odoo' }} />
    </Tabs>
  )
}
