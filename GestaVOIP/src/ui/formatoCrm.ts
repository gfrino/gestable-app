/** Importi, scadenze, icone e colori del CRM, uguali in elenco e scheda. */

import type Ionicons from '@expo/vector-icons/Ionicons'
import { loc, t, tn } from '../i18n'
import type { StatoAttivita } from '../odoo/crm'
import type { Colori } from './tema'

/** «CHF 12’500»: le opportunità si contano senza centesimi, come nel kanban di Odoo. */
export function importo(valore: number, valuta: string): string {
  try {
    return new Intl.NumberFormat(loc(), { style: 'currency', currency: valuta || 'CHF', maximumFractionDigits: 0 }).format(valore)
  } catch {
    return `${valuta} ${Math.round(valore)}`
  }
}

/** Da quello che si scrive («12'500», «12.500,50», «1200.5») a un numero; NaN se non si legge. */
export function leggiImporto(testo: string): number {
  let x = testo.replace(/[\s'’]/g, '')
  const virgola = x.lastIndexOf(',')
  const punto = x.lastIndexOf('.')
  if (virgola > punto) {
    // La virgola e' il decimale (12.500,50): i punti sono migliaia.
    x = x.replace(/\./g, '').replace(',', '.')
  } else {
    x = x.replace(/,/g, '')
  }
  return x ? Number(x) : NaN
}

export function giornoIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function giorno(iso: string): Date {
  return new Date(`${iso}T12:00:00`)
}

/** Giorni da oggi (negativi nel passato). */
export function giorniDaOggi(iso: string): number {
  const oggi = giorno(giornoIso(new Date()))
  return Math.round((giorno(iso).getTime() - oggi.getTime()) / 86_400_000)
}

/** «Oggi», «Domani», «3 giorni fa», «tra 5 giorni», oltre due settimane la data. */
export function quando(iso: string): string {
  if (!iso) {
    return ''
  }
  const n = giorniDaOggi(iso)
  if (n === 0) return t('crm.oggi')
  if (n === 1) return t('crm.domani')
  if (n === -1) return t('crm.ieri')
  if (n < 0 && n > -15) return tn('crm.giorniFa', -n)
  if (n > 0 && n < 15) return tn('crm.traGiorni', n)
  return data(iso)
}

/** «12 dic 2026» (l'anno solo se non è quello in corso). */
export function data(iso: string): string {
  if (!iso) {
    return ''
  }
  const d = giorno(iso)
  return d.toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}

export function coloreAttivita(stato: StatoAttivita, c: Colori): string {
  return stato === 'overdue' ? c.rosso : stato === 'today' ? c.ambra : c.verde
}

/** L'icona di un tipo di attività (Odoo usa FontAwesome fino alla 19, Material nella 20). */
export function iconaAttivita(categoria: string, icona: string): keyof typeof Ionicons.glyphMap {
  if (categoria === 'phonecall' || /phone/.test(icona)) return 'call'
  if (categoria === 'meeting' || /users|calendar/.test(icona)) return 'people'
  if (categoria === 'upload_file' || /upload/.test(icona)) return 'cloud-upload'
  if (/envelope|mail/.test(icona)) return 'mail'
  if (/file|quote/.test(icona)) return 'document-text'
  return 'checkbox-outline'
}

export function colorePriorita(p: number, c: Colori): string {
  return p >= 3 ? c.rosso : p === 2 ? '#E8890C' : p === 1 ? '#D9A400' : c.testo3
}
