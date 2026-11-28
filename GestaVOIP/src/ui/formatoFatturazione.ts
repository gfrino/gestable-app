/** Stati, tipi e colori della Fatturazione, uguali in elenco e scheda. Importi e quantità come nelle Vendite. */

import { t } from '../i18n'
import type { StatoFattura, Tipo } from '../odoo/fatturazione'
import type { Colori } from './tema'

export { importo, quantita } from './formatoVendite'

export function testoStato(stato: StatoFattura): string {
  return t(`fatturazione.stato.${stato}`)
}

export function coloreStato(stato: StatoFattura, c: Colori): { testo: string; sfondo: string } {
  switch (stato) {
    case 'pagata':
      return { testo: c.verde, sfondo: c.verdeTenue }
    case 'inPagamento':
    case 'parziale':
      return { testo: c.primario, sfondo: c.primarioTenue }
    case 'daPagare':
    case 'bloccata':
      return { testo: c.ambra, sfondo: c.ambraTenue }
    case 'annullata':
    case 'stornata':
      return { testo: c.rosso, sfondo: c.rossoTenue }
    default:
      return { testo: c.testo2, sfondo: c.superficie2 }
  }
}

/** «Fattura», «Nota di credito», «Fattura fornitore», «Nota di credito fornitore». */
export function testoTipo(tipo: Tipo): string {
  return tipo === 'entry' ? '' : t(`fatturazione.tipo.${tipo}`)
}

/** Fatture e note dei clienti (si inviano); quelle dei fornitori no. */
export function diCliente(tipo: Tipo): boolean {
  return tipo === 'out_invoice' || tipo === 'out_refund'
}
