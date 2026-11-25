import Ionicons from '@expo/vector-icons/Ionicons'
import { Tabs, useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'
import { conTelefono } from '../../odoo/sessione'
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

  return (
    <Tabs
      initialRouteName={telefono ? 'index' : 'odoo'}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primario,
        tabBarInactiveTintColor: c.testo3,
        tabBarStyle: { backgroundColor: c.superficie, borderTopColor: c.bordo },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          href: telefono ? undefined : null,
          title: 'Tastierino',
          tabBarIcon: ({ color, size }) => <Ionicons name="keypad" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="recenti"
        options={{
          href: telefono ? undefined : null,
          title: 'Recenti',
          tabBarIcon: ({ color, size }) => <Ionicons name="time" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="contatti"
        options={{
          title: 'Contatti',
          tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="calendario"
        options={{
          title: 'Calendario',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="odoo"
        // Il tasto Odoo porta sempre alla home di Odoo, anche se si e' gia' li'.
        listeners={{ tabPress: () => inviaOdoo({ tipo: 'home' }) }}
        options={{
          title: 'Odoo',
          tabBarIcon: ({ color, size }) => <Ionicons name="apps" color={color} size={size} />,
        }}
      />
    </Tabs>
  )
}
