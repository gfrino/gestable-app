import Ionicons from '@expo/vector-icons/Ionicons'
import { Tabs, useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'
import { useTelefono } from '../../voip/Contesto'
import { useColori } from '../../ui/tema'

export default function LayoutSchede() {
  const c = useColori()
  const { chiamata } = useTelefono()
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
          title: 'Tastierino',
          tabBarIcon: ({ color, size }) => <Ionicons name="keypad" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="recenti"
        options={{
          title: 'Recenti',
          tabBarIcon: ({ color, size }) => <Ionicons name="time" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="odoo"
        options={{
          title: 'Odoo',
          tabBarIcon: ({ color, size }) => <Ionicons name="apps" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="impostazioni"
        options={{
          title: 'Impostazioni',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings" color={color} size={size} />,
        }}
      />
    </Tabs>
  )
}
