/**
 * Odoo accanto al telefono: la stessa sessione del login, e i numeri cliccati
 * in Odoo partono dal softphone.
 */

import { Alert } from 'react-native'
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
      chiama={(numero) => {
        telefono.chiama(numero).catch((e) => Alert.alert('Chiamata non partita', e instanceof Error ? e.message : String(e)))
      }}
    />
  )
}
