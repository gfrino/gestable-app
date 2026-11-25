/**
 * Odoo dentro l'app, per tutti i server. Con VOIP AI i numeri cliccati in Odoo
 * partono dal softphone dell'app; senza, li gestisce Odoo.
 */

import { Alert } from 'react-native'
import { t } from '../../i18n'
import { conTelefono } from '../../odoo/sessione'
import { useApp } from '../../voip/Contesto'
import { telefono } from '../../voip/telefono'
import { VistaOdoo } from '../../ui/VistaOdoo'

export default function SchedaOdoo() {
  const { sessione } = useApp()
  if (!sessione) {
    return null
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
