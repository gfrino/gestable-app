/** Importi, date e colori degli stati delle Spese, uguali in lista e scheda. */

import { loc } from '../i18n'
import type { StatoSpesa } from '../odoo/spese'
import type { Colori } from './tema'

export function importo(valore: number, valuta: string): string {
  try {
    return new Intl.NumberFormat(loc(), { style: 'currency', currency: valuta || 'CHF' }).format(valore)
  } catch {
    return `${valuta} ${valore.toFixed(2)}`
  }
}

export function giorno(data: string): string {
  if (!data) {
    return ''
  }
  const d = new Date(`${data}T12:00:00`)
  return d.toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}

export function coloreStato(stato: StatoSpesa, c: Colori): string {
  return stato === 'bozza' ? c.ambra : stato === 'rifiutata' ? c.rosso : stato === 'inviata' ? c.primario : c.verde
}
