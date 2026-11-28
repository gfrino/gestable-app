/**
 * Apre un documento di Odoo da una notifica o da un'attivita': la schermata
 * nativa dell'app se c'e' (CRM, Vendite, Fatturazione, Helpdesk, Ferie, Spese, Contatti, Calendario,
 * chat), altrimenti il documento nella vista di Odoo Web.
 *
 * La vista di Odoo e' una scheda (nascosta): da una schermata aperta sopra le
 * schede si torna indietro fino a lei (dismissTo, che non ne apre una seconda
 * copia); da una scheda (Messaggi o Attivita' spostati nella barra in basso)
 * dismissTo non ha nulla da chiudere e non farebbe niente: si cambia scheda.
 */

import type { useRouter } from 'expo-router'
import { spesePossibili } from '../../modules/gestable-nativo'
import { percorsoRecord } from '../odoo/lavoro'
import { inviaOdoo, rottaOdoo } from './comandiOdoo'

type Router = ReturnType<typeof useRouter>

/** Il nome del documento, per i titoli delle schermate che lo usano (chat). */
type Extra = { nome?: string }

function nativa(router: Router, modello: string, id: number, extra: Extra): boolean {
  const params = { id: String(id) }
  switch (modello) {
    case 'crm.lead':
      router.push({ pathname: '/crm/[id]', params })
      return true
    case 'sale.order':
      router.push({ pathname: '/vendite/[id]', params })
      return true
    case 'account.move':
      router.push({ pathname: '/fatturazione/[id]', params })
      return true
    case 'helpdesk.ticket':
      router.push({ pathname: '/helpdesk/[id]', params })
      return true
    case 'res.partner':
      router.push({ pathname: '/contatti/[id]', params })
      return true
    case 'calendar.event':
      router.push({ pathname: '/calendario/[id]', params })
      return true
    case 'hr.leave':
      router.push('/ferie')
      return true
    case 'hr.expense':
      if (!spesePossibili) {
        return false
      }
      router.push({ pathname: '/spese/[id]', params })
      return true
    case 'discuss.channel':
      router.push({ pathname: '/messaggi/[id]', params: { ...params, tipo: 'channel', nome: extra.nome || '' } })
      return true
    default:
      return false
  }
}

export function apriInOdooWeb(router: Router, modello: string, id: number) {
  inviaOdoo({ tipo: 'apri', percorso: percorsoRecord(modello, id) })
  if (router.canDismiss()) {
    router.dismissTo(rottaOdoo())
  } else {
    router.navigate(rottaOdoo())
  }
}

export function apriRecord(router: Router, modello: string, id: number, extra: Extra = {}) {
  if (!modello || !id) {
    return
  }
  if (!nativa(router, modello, id, extra)) {
    apriInOdooWeb(router, modello, id)
  }
}
