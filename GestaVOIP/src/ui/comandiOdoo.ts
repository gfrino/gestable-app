/**
 * Comandi per la vista di Odoo da qualsiasi schermata: tornare alla home di
 * Odoo, aprire un record (da un'attivita' o da una notifica).
 *
 * Se la vista non e' ancora montata il comando resta in attesa e lo esegue
 * appena c'e'.
 */

export type ComandoOdoo = { tipo: 'home' } | { tipo: 'apri'; percorso: string }

type Ascoltatore = (c: ComandoOdoo) => void

let ascoltatore: Ascoltatore | null = null
let inAttesa: ComandoOdoo | null = null

export function inviaOdoo(c: ComandoOdoo) {
  if (ascoltatore) {
    ascoltatore(c)
  } else {
    inAttesa = c
  }
}

export function ascoltaOdoo(fn: Ascoltatore): () => void {
  ascoltatore = fn
  if (inAttesa) {
    const c = inAttesa
    inAttesa = null
    fn(c)
  }
  return () => {
    if (ascoltatore === fn) {
      ascoltatore = null
    }
  }
}

/** Il comando in attesa, se la vista appena montata deve aprire un record invece della home. */
export function prendiInAttesa(): ComandoOdoo | null {
  const c = inAttesa
  inAttesa = null
  return c
}

/**
 * Dove sta la vista di Odoo: la scheda Odoo se c'e' il telefono, altrimenti la
 * schermata intera. «/odoo» da solo e' ambiguo (corrisponde a tutte e due).
 */
export function rottaOdoo(conTelefono: boolean): '/(tabs)/odoo' | '/odoo' {
  return conTelefono ? '/(tabs)/odoo' : '/odoo'
}
