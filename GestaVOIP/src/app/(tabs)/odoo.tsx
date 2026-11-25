/**
 * Odoo dentro l'app, per tutti i server. Con VOIP AI i numeri cliccati in Odoo
 * partono dal softphone dell'app; senza, li gestisce Odoo.
 */

import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Alert, View } from 'react-native'
import { t } from '../../i18n'
import { conTelefono } from '../../odoo/sessione'
import { useApp } from '../../voip/Contesto'
import { telefono } from '../../voip/telefono'
import { useColori } from '../../ui/tema'
import { VistaOdoo } from '../../ui/VistaOdoo'

// Dopo l'avvio si lascia qualche secondo alla schermata aperta (dati, telefono),
// poi Odoo comincia a caricare dietro: quando lo si apre e' gia' pronto.
const ATTESA_MS = 3000

export default function SchedaOdoo() {
  const { sessione } = useApp()
  const c = useColori()
  const [carica, setCarica] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setCarica(true), ATTESA_MS)
    return () => clearTimeout(timer)
  }, [])
  // Aperto prima dei tre secondi: si carica subito.
  useFocusEffect(useCallback(() => setCarica(true), []))
  if (!sessione) {
    return null
  }
  if (!carica) {
    return <View style={{ flex: 1, backgroundColor: c.sfondo }} />
  }
  return (
    <VistaOdoo
      server={sessione.server}
      titolo={sessione.azienda}
      chiama={
        conTelefono(sessione)
          ? (numero) => {
              telefono.chiama(numero).catch((e) => Alert.alert(t('schede.chiamataNonPartita'), e instanceof Error ? e.message : String(e)))
            }
          : undefined
      }
    />
  )
}
