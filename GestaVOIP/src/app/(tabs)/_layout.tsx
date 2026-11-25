import Ionicons from '@expo/vector-icons/Ionicons'
import { Tabs, useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'
import { conTelefono } from '../../odoo/sessione'
import { ICONE_SCHEDE, SCHEDE_TELEFONO, schedaAvvio, titoloScheda, useAspetto } from '../../ui/Aspetto'
import { useApp, useTelefono } from '../../voip/Contesto'
import { inviaOdoo } from '../../ui/comandiOdoo'
import { useColori } from '../../ui/tema'

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
          // Il tasto Odoo porta sempre alla home di Odoo, anche se si e' gia' li'.
          listeners={nome === 'odoo' ? { tabPress: () => inviaOdoo({ tipo: 'home' }) } : undefined}
          options={{
            href: telefono || !SCHEDE_TELEFONO.includes(nome) ? undefined : null,
            title: titoloScheda(nome),
            tabBarIcon: ({ color, size }) => <Ionicons name={ICONE_SCHEDE[nome]} color={color} size={size} />,
          }}
        />
      ))}
    </Tabs>
  )
}
