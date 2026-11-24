/**
 * Odoo senza VOIP AI: l'app e' Odoo e basta, a tutto schermo.
 */

import { useApp } from '../voip/Contesto'
import { VistaOdoo } from '../ui/VistaOdoo'

export default function SoloOdoo() {
  const { sessione, esci } = useApp()
  if (!sessione) {
    return null
  }
  return <VistaOdoo server={sessione.server} esci={() => void esci()} />
}
