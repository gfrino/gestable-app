/**
 * Odoo senza VOIP AI: l'app e' Odoo e basta, a tutto schermo.
 */

import { useApp } from '../voip/Contesto'
import { VistaOdoo } from '../ui/VistaOdoo'

export default function SoloOdoo() {
  const { sessione } = useApp()
  if (!sessione) {
    return null
  }
  // Per uscire: menu ☰ › Esci.
  return <VistaOdoo server={sessione.server} />
}
