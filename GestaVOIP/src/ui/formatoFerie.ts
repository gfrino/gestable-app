/** Giorni, periodi e colori degli stati delle Ferie, uguali in elenco e richiesta nuova. */

import { loc, tn } from '../i18n'
import type { StatoFerie } from '../odoo/ferie'
import type { Colori } from './tema'

/** 2, 2,5, 16,6: al massimo due decimali, senza zeri inutili. */
export function numero(n: number): string {
  return new Intl.NumberFormat(loc(), { maximumFractionDigits: 2 }).format(n)
}

/** «3 giorni», «1 giorno», «7,5 ore». */
export function durata(n: number, ore = false): string {
  return tn(ore ? 'ferie.ore' : 'ferie.giorni', n, { n: numero(n) })
}

function data(iso: string): Date {
  return new Date(`${iso}T12:00:00`)
}

/** «lun 21 dic», «14 – 16 dic», «28 dic – 2 gen 2027»: l'anno solo se non e' quello in corso. */
export function periodo(dal: string, al: string): string {
  if (!dal) {
    return ''
  }
  const a = data(dal)
  const b = data(al || dal)
  const anno = b.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
  if (dal === al || !al) {
    return a.toLocaleDateString(loc(), { weekday: 'short', day: 'numeric', month: 'short', year: anno })
  }
  const stessoMese = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
  const inizio = stessoMese
    ? a.toLocaleDateString(loc(), { day: 'numeric' })
    : a.toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: a.getFullYear() !== b.getFullYear() ? 'numeric' : undefined })
  return `${inizio} – ${b.toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: anno })}`
}

/** Giorno e mese brevi per il bollino a sinistra della richiesta. */
export function bollino(iso: string): { giorno: string; mese: string } {
  if (!iso) {
    return { giorno: '', mese: '' }
  }
  const d = data(iso)
  return { giorno: String(d.getDate()), mese: d.toLocaleDateString(loc(), { month: 'short' }).replace('.', '') }
}

export function coloreStato(stato: StatoFerie, c: Colori): string {
  return stato === 'attesa' ? c.ambra : stato === 'approvata' ? c.verde : stato === 'rifiutata' ? c.rosso : c.testo3
}

/** AAAA-MM-GG del giorno locale (non UTC: a mezzanotte toISOString sbaglia giorno). */
export function giornoIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
