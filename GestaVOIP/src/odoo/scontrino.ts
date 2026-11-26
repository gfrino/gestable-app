/**
 * Dati di uno scontrino letti sul telefono, per compilare la spesa da soli.
 *
 * Il testo lo legge l'iPhone (riconoscimento del testo di Apple, nessun servizio
 * esterno). Se c'e' Apple Intelligence il modello sul telefono propone negozio,
 * totale, data e categoria; le regole qui sotto fanno lo stesso lavoro dove il
 * modello non c'e' e controllano le sue risposte: un totale che non compare nel
 * testo, o una data impossibile, non vengono usati.
 */

import { analizzaScontrinoAI, leggiTestoScontrino } from '../../modules/gestable-nativo'
import type { Categoria } from './spese'

export type Letto = {
  nome?: string
  totale?: number
  data?: string
  valuta?: string
  categoriaId?: number
  /** Le proposte vengono da Apple Intelligence (altrimenti dalle regole). */
  daAI: boolean
}

type DaRegole = { negozio?: string; totale?: number; data?: string; valuta?: string; importi: number[] }

// Lettere anche accentate, scritte a mano: niente classi Unicode nelle espressioni regolari.
const LETTERA = /[A-Za-zÀ-ÖØ-öø-ÿ]/g
const IMPORTO = /(\d{1,3}(?:['’]\d{3})+|\d+)[.,](\d{2})(?!\d)/g
const TOTALE = /\b(totale|total|tot\.|totaal|summe|gesamt|gesamtbetrag|zu zahlen|da pagare|à payer|a payer|montant|amount due|importo)\b/i
const NON_TOTALE = /\b(sub\s?tot|subtotale|zwischensumme|netto|iva|mwst|tva|vat|imposta|steuer|resto|rückgeld|change|contanti|bargeld|cash|sconto|rabatt|remise)/i
const PAROLE_INTESTAZIONE = /\b(scontrino|ricevuta|quittung|beleg|receipt|reçu|ticket|fattura|rechnung|facture|invoice|tel\.?|telefono|iva|mwst|tva|uid|che-|via |strasse|str\.|rue |piazza|platz|www\.|@)/i

function importi(riga: string): number[] {
  const trovati: number[] = []
  for (const m of riga.matchAll(IMPORTO)) {
    trovati.push(parseFloat(`${m[1].replace(/['’]/g, '')}.${m[2]}`))
  }
  return trovati
}

function dataValida(a: number, m: number, g: number): string | undefined {
  if (m < 1 || m > 12 || g < 1 || g > 31) {
    return undefined
  }
  const d = new Date(a, m - 1, g, 12)
  if (d.getMonth() !== m - 1) {
    return undefined
  }
  const oggi = Date.now()
  if (d.getTime() > oggi + 86_400_000 || d.getTime() < oggi - 2 * 365 * 86_400_000) {
    return undefined
  }
  return `${a}-${String(m).padStart(2, '0')}-${String(g).padStart(2, '0')}`
}

function trovaData(testo: string): string | undefined {
  for (const m of testo.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
    const d = dataValida(+m[1], +m[2], +m[3])
    if (d) {
      return d
    }
  }
  for (const m of testo.matchAll(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/g)) {
    const anno = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    const d = dataValida(anno, +m[2], +m[1])
    if (d) {
      return d
    }
  }
  return undefined
}

function trovaValuta(testo: string): string | undefined {
  if (/\bCHF\b|\bFr\.|\bSFr/i.test(testo)) {
    return 'CHF'
  }
  if (/\bEUR\b|€/i.test(testo)) {
    return 'EUR'
  }
  if (/\bUSD\b|\$/.test(testo)) {
    return 'USD'
  }
  return undefined
}

function belloNome(t: string): string {
  const pulito = t.replace(/\s{2,}/g, ' ').trim()
  // TUTTO MAIUSCOLO → Iniziali Maiuscole.
  if (pulito.length > 3 && pulito === pulito.toUpperCase()) {
    return pulito.toLowerCase().replace(/(^|[\s'’-])([a-zà-öø-ÿ])/g, (_, a: string, b: string) => a + b.toUpperCase())
  }
  return pulito
}

function trovaNegozio(righe: string[]): string | undefined {
  for (const r of righe.slice(0, 5)) {
    const lettere = (r.match(LETTERA) || []).length
    if (lettere >= 3 && lettere / r.length > 0.5 && !PAROLE_INTESTAZIONE.test(r) && !importi(r).length) {
      return belloNome(r)
    }
  }
  return undefined
}

function trovaTotale(righe: string[], tutti: number[]): number | undefined {
  const candidati: number[] = []
  righe.forEach((r, i) => {
    if (!TOTALE.test(r) || NON_TOTALE.test(r)) {
      return
    }
    const qui = importi(r)
    if (qui.length) {
      candidati.push(qui[qui.length - 1])
    } else if (righe[i + 1]) {
      const dopo = importi(righe[i + 1])
      if (dopo.length) {
        candidati.push(dopo[0])
      }
    }
  })
  if (candidati.length) {
    return Math.max(...candidati)
  }
  return tutti.length ? Math.max(...tutti) : undefined
}

/** Le regole, da sole: servono senza Apple Intelligence e per controllarne le risposte. */
export function daRighe(righe: string[]): DaRegole {
  const testo = righe.join('\n')
  const tutti = righe.flatMap(importi)
  return {
    negozio: trovaNegozio(righe),
    totale: trovaTotale(righe, tutti),
    data: trovaData(testo),
    valuta: trovaValuta(testo),
    importi: tutti,
  }
}

// Parole dello scontrino → nome della categoria in Odoo (in tutte le lingue di Odoo).
const GRUPPI: { parole: RegExp; categoria: RegExp }[] = [
  {
    parole: /ristorante|pizzeria|trattoria|osteria|grotto|bar\b|caff[eè]|café|restaurant|gasthaus|gasthof|menu|coperto|mensa|pranzo|cena|bistro|kaffee|essen/i,
    categoria: /pasti|meal|food|repas|verpflegung|essen|ristor|mahlzeit/i,
  },
  {
    parole: /hotel|albergo|pernottamento|übernachtung|nuitée|booking|airbnb|ostello|pension/i,
    categoria: /alloggio|accommodation|hotel|hébergement|unterkunft|viaggi|travel|reise|voyage/i,
  },
  {
    parole: /\b(ffs|sbb|cff|trenitalia|treno|zug|train|taxi|uber|bus|autopostale|postauto|biglietto|billett|parcheggio|parking|parkhaus|autostrada|vignette|volo|flight|airline)\b/i,
    categoria: /viaggi|travel|reise|voyage|trasport/i,
  },
  {
    parole: /benzina|diesel|carburante|fuel|tankstelle|essence|tamoil|\beni\b|agip|shell|\bbp\b|avia|migrol|socar|esso|\bq8\b/i,
    categoria: /carbur|fuel|treibstoff|benzin|veicol|vehicle|auto|viaggi|travel/i,
  },
  {
    parole: /swisscom|sunrise|\bsalt\b|telefon|abbonamento|mobile|internet|roaming/i,
    categoria: /comunic|communication|telecom|telefon/i,
  },
  {
    parole: /regalo|geschenk|cadeau|gift|fiori|blumen|fleurs/i,
    categoria: /regal|gift|geschenk|cadeau/i,
  },
]

function indovinaCategoria(testo: string, categorie: Categoria[]): number | undefined {
  const usabili = categorie.filter((c) => c.costo <= 0)
  for (const g of GRUPPI) {
    if (g.parole.test(testo)) {
      const c = usabili.find((x) => g.categoria.test(x.nome))
      if (c) {
        return c.id
      }
    }
  }
  return undefined
}

/**
 * Legge le pagine (file:// dello scanner) e propone i dati della spesa.
 * null se il telefono non ha letto niente.
 */
export async function leggiScontrino(pagine: string[], categorie: Categoria[]): Promise<Letto | null> {
  const righe = (await leggiTestoScontrino(pagine)).map((r) => r.trim()).filter(Boolean)
  if (!righe.length) {
    return null
  }
  const testo = righe.join('\n')
  const regole = daRighe(righe)
  const usabili = categorie.filter((c) => c.costo <= 0)
  const ai = await analizzaScontrinoAI(testo, usabili.map((c) => c.nome))

  // Totale dell'AI solo se compare davvero nel testo dello scontrino.
  const totaleAI = ai && ai.totale > 0 && regole.importi.some((x) => Math.abs(x - ai.totale) < 0.005) ? ai.totale : undefined
  const dataAI = ai?.data && /^\d{4}-\d{2}-\d{2}$/.test(ai.data) ? dataValida(+ai.data.slice(0, 4), +ai.data.slice(5, 7), +ai.data.slice(8, 10)) : undefined
  const categoriaAI = ai?.categoria ? usabili.find((c) => c.nome.toLowerCase() === ai.categoria.trim().toLowerCase())?.id : undefined

  const negozio = (ai?.negozio && belloNome(ai.negozio)) || regole.negozio
  // Il tipo di spesa in poche parole («Pranzo»); un elenco di articoli non serve come descrizione.
  const tipo = ai?.descrizione?.trim()
  const descrizione = tipo && tipo.length <= 25 && !/[,;\n]/.test(tipo) ? tipo : undefined
  const nome = descrizione && negozio && !negozio.toLowerCase().includes(descrizione.toLowerCase()) ? `${descrizione} – ${negozio}` : negozio || descrizione

  const letto: Letto = {
    nome: nome || undefined,
    totale: totaleAI ?? regole.totale,
    data: dataAI ?? regole.data,
    valuta: (ai?.valuta && /^[A-Z]{3}$/.test(ai.valuta) ? ai.valuta : undefined) ?? regole.valuta,
    categoriaId: categoriaAI ?? indovinaCategoria(testo, categorie),
    daAI: !!ai,
  }
  return letto.nome || letto.totale || letto.data ? letto : null
}
