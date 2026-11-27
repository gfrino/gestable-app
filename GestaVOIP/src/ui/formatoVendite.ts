/** Importi, quantità, stati e colori delle Vendite, uguali in elenco e scheda. */

import { loc, t } from '../i18n'
import type { Fatturazione, Stato } from '../odoo/vendite'
import type { Colori } from './tema'

/** «CHF 1’250.50»: nei documenti di vendita i centesimi contano. Senza valuta (listino non ancora noto) solo il numero. */
export function importo(valore: number, valuta: string): string {
  try {
    return new Intl.NumberFormat(loc(), valuta ? { style: 'currency', currency: valuta, minimumFractionDigits: 2, maximumFractionDigits: 2 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valore)
  } catch {
    return `${valuta} ${valore.toFixed(2)}`
  }
}

/** «3», «2.5», «0.75»: senza zeri inutili. */
export function quantita(valore: number): string {
  return new Intl.NumberFormat(loc(), { maximumFractionDigits: 3 }).format(valore)
}

export function testoStato(stato: Stato): string {
  return t(`vendite.stato.${stato}`)
}

export function coloreStato(stato: Stato, c: Colori): { testo: string; sfondo: string } {
  switch (stato) {
    case 'sale':
      return { testo: c.verde, sfondo: c.verdeTenue }
    case 'sent':
      return { testo: c.primario, sfondo: c.primarioTenue }
    case 'cancel':
      return { testo: c.rosso, sfondo: c.rossoTenue }
    default:
      return { testo: c.testo2, sfondo: c.superficie2 }
  }
}

/** Solo gli stati di fatturazione che servono a chi vende («Da fatturare», «Fatturato»). */
export function testoFatturazione(f: Fatturazione): string {
  return f === 'to invoice' ? t('vendite.daFatturare') : f === 'invoiced' ? t('vendite.fatturato') : f === 'upselling' ? t('vendite.upselling') : ''
}
