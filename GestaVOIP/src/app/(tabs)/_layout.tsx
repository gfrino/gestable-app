import Ionicons from '@expo/vector-icons/Ionicons'
import { Tabs, useRouter } from 'expo-router'
import { useEffect, useRef } from 'react'
import { Image } from 'react-native'
import { ICONE_SCHEDE, MENU, ROTTA, SCHEDE, schedaAvvio, schedeVisibili, titoloScheda, useAspetto, type Scheda } from '../../ui/Aspetto'
import { useDisponibili } from '../../ui/disponibili'
import { useMenu } from '../../ui/MenuLaterale'
import { useTelefono } from '../../voip/Contesto'
import { useColori } from '../../ui/tema'

// La «G» del logo con il suo spicchio, a un colore (si tinge come le altre
// icone della barra). Fatta da Grafiche/Logo GestABLE.png.
const G = require('../../../assets/scheda-g.png') as number

export default function LayoutSchede() {
  const c = useColori()
  const { chiamata } = useTelefono()
  // Stessa barra per tutti i server; Tastierino e Recenti solo con VOIP AI,
  // Messaggi/Attivita'/Spese solo se ci sono (e se l'utente li ha messi in basso).
  const disponibili = useDisponibili()
  const { contatori } = useMenu()
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
  // Ogni schermata di app/(tabs) va dichiarata: quelle non in basso con href null
  // (si aprono lo stesso dal menu ≡). L'ordine dei figli e' l'ordine della barra.
  const { aspetto } = useAspetto()
  const inBasso = schedeVisibili(aspetto.schede, disponibili)
  const nascoste = [...SCHEDE, ...MENU].filter((x) => !inBasso.includes(x))
  const prima = schedaAvvio(aspetto, disponibili)
  const numero = (x: Scheda) => (x === 'messaggi' ? contatori.messaggi : x === 'attivita' ? contatori.attivita : 0)

  return (
    <Tabs
      initialRouteName={ROTTA[prima]}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primario,
        tabBarInactiveTintColor: c.testo3,
        tabBarStyle: { backgroundColor: c.superficie, borderTopColor: c.bordo },
      }}
    >
      {[...inBasso, ...nascoste].map((nome) => (
        <Tabs.Screen
          key={nome}
          name={ROTTA[nome]}
          options={{
            href: inBasso.includes(nome) ? undefined : null,
            title: titoloScheda(nome),
            tabBarBadge: numero(nome) ? (numero(nome) > 99 ? '99+' : numero(nome)) : undefined,
            tabBarBadgeStyle: { backgroundColor: c.primario, color: c.primarioTesto },
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
