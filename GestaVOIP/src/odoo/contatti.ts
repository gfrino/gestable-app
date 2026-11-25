/**
 * I contatti di Odoo (res.partner): ricerca a pagine, scheda, contatto nuovo.
 *
 * Odoo 19 non ha piu' il campo «mobile» (solo «phone»): i campi si leggono
 * da fields_get una volta per server e si chiedono solo quelli che esistono.
 */

import { callKw } from './client'

type Id = number
type M2o = [number, string] | false

const campiDi = new Map<string, Promise<Set<string>>>()

function campiPartner(server: string): Promise<Set<string>> {
  let p = campiDi.get(server)
  if (!p) {
    p = callKw<Record<string, unknown>>(server, 'res.partner', 'fields_get', [], { attributes: ['type'] }).then(
      (f) => new Set(Object.keys(f)),
    )
    p.catch(() => campiDi.delete(server))
    campiDi.set(server, p)
  }
  return p
}

function solo(campi: Set<string>, voluti: string[]): string[] {
  return voluti.filter((c) => campi.has(c))
}

export type Contatto = {
  id: Id
  nome: string
  /** Ha una foto vera in Odoo (senza, Odoo da' una sagoma grigia: meglio le iniziali). */
  foto: boolean
  azienda: string
  aziendaId: Id | null
  eAzienda: boolean
  funzione: string
  citta: string
  telefono: string
  cellulare: string
  email: string
}

type Riga = {
  id: Id
  name: string | false
  parent_id: M2o
  is_company: boolean
  function?: string | false
  city?: string | false
  phone?: string | false
  mobile?: string | false
  email?: string | false
}

function daRiga(r: Riga, conFoto: Set<Id>): Contatto {
  return {
    id: r.id,
    // Alcuni nomi in Odoo iniziano con spazi: si tolgono.
    nome: (r.name || '').trim(),
    foto: conFoto.has(r.id),
    azienda: r.parent_id ? r.parent_id[1] : '',
    aziendaId: r.parent_id ? r.parent_id[0] : null,
    eAzienda: !!r.is_company,
    funzione: r.function || '',
    citta: r.city || '',
    telefono: r.phone || '',
    cellulare: r.mobile || '',
    email: r.email || '',
  }
}

/** Fra questi, quali hanno una foto caricata. Una sola richiesta leggera. */
async function conFoto(server: string, ids: Id[]): Promise<Set<Id>> {
  if (!ids.length) {
    return new Set()
  }
  const r = await callKw<Id[]>(server, 'res.partner', 'search', [[['id', 'in', ids], ['image_1920', '!=', false]]]).catch(
    () => [] as Id[],
  )
  return new Set(r)
}

export type Filtro = 'tutti' | 'aziende' | 'persone'

export async function cercaContatti(
  server: string,
  testo: string,
  filtro: Filtro,
  offset: number,
  limite = 60,
): Promise<Contatto[]> {
  const campi = await campiPartner(server)
  const dominio: unknown[] = [['name', '!=', false]]
  if (filtro === 'aziende') {
    dominio.push(['is_company', '=', true])
  } else if (filtro === 'persone') {
    dominio.push(['is_company', '=', false])
  }
  const t = testo.trim()
  if (!t) {
    // Senza ricerca: solo i nomi che iniziano con una cifra o una lettera.
    // Fuori quelli con simboli davanti (oltre 1300 su ticinoweb.online: numeri
    // «+41...» creati dalle chiamate, «"Mario" <mario@...>» dalle email, «*», «#»),
    // che Odoo metterebbe in cima. Con la ricerca si trovano lo stesso.
    dominio.push(['name', '>=', '0'])
  }
  if (t) {
    const cifre = t.replace(/\D/g, '')
    if (cifre.length >= 4 && campi.has('phone_mobile_search')) {
      // Un numero: la ricerca di Odoo che ignora spazi e prefissi.
      dominio.push('|', ['phone_mobile_search', 'ilike', t], ['name', 'ilike', t])
    } else {
      dominio.push('|', '|', ['name', 'ilike', t], ['email', 'ilike', t], ['commercial_company_name', 'ilike', t])
    }
  }
  const righe = await callKw<Riga[]>(server, 'res.partner', 'search_read', [], {
    domain: dominio,
    fields: solo(campi, ['name', 'parent_id', 'is_company', 'function', 'city', 'phone', 'mobile', 'email']),
    order: 'name asc, id asc',
    offset,
    limit: limite,
  })
  const foto = await conFoto(server, righe.map((r) => r.id))
  return righe.map((r) => daRiga(r, foto))
}

export type SchedaContatto = Contatto & {
  indirizzo: string
  sito: string
  partitaIva: string
  etichette: string[]
  note: string
  persone: Contatto[]
}

export async function schedaContatto(server: string, id: Id): Promise<SchedaContatto | null> {
  const campi = await campiPartner(server)
  const [r] = await callKw<
    (Riga & {
      street?: string | false
      street2?: string | false
      zip?: string | false
      country_id?: M2o
      website?: string | false
      vat?: string | false
      category_id?: Id[]
      comment?: string | false
      child_ids?: Id[]
    })[]
  >(server, 'res.partner', 'read', [
    [id],
    solo(campi, [
      'name', 'parent_id', 'is_company', 'function', 'city', 'phone', 'mobile', 'email',
      'street', 'street2', 'zip', 'country_id', 'website', 'vat', 'category_id', 'comment', 'child_ids',
    ]),
  ])
  if (!r) {
    return null
  }
  const [etichette, persone] = await Promise.all([
    r.category_id?.length
      ? callKw<{ id: Id; name: string }[]>(server, 'res.partner.category', 'read', [r.category_id, ['name']]).catch(() => [])
      : Promise.resolve([]),
    r.child_ids?.length
      ? callKw<Riga[]>(server, 'res.partner', 'search_read', [], {
          domain: [['parent_id', '=', id], ['name', '!=', false]],
          fields: solo(campi, ['name', 'parent_id', 'is_company', 'function', 'city', 'phone', 'mobile', 'email']),
          order: 'name asc',
          limit: 50,
        }).catch(() => [])
      : Promise.resolve([]),
  ])
  const citta = [r.zip, r.city].filter(Boolean).join(' ')
  const foto = await conFoto(server, [r.id, ...persone.map((p) => p.id)])
  return {
    ...daRiga(r, foto),
    indirizzo: [r.street, r.street2, citta, r.country_id ? r.country_id[1] : ''].filter(Boolean).join('\n'),
    sito: r.website || '',
    partitaIva: r.vat || '',
    etichette: etichette.map((e) => e.name),
    note: r.comment || '',
    persone: persone.map((p) => daRiga(p, foto)),
  }
}

/** Il server ha il campo «mobile»? (Odoo 17 si', Odoo 19 no.) */
export async function haCellulare(server: string): Promise<boolean> {
  return (await campiPartner(server)).has('mobile')
}

export type NuovoContatto = {
  eAzienda: boolean
  nome: string
  azienda: string
  funzione: string
  telefono: string
  cellulare: string
  email: string
}

/**
 * Crea il contatto. L'azienda scritta per una persona si collega a
 * un'azienda esistente con lo stesso nome; se non c'e', resta come testo
 * (company_name), come fa Odoo, e la si crea poi da Odoo se serve.
 */
export async function creaContatto(server: string, n: NuovoContatto): Promise<Id> {
  const campi = await campiPartner(server)
  const valori: Record<string, unknown> = {
    name: n.nome.trim(),
    is_company: n.eAzienda,
    email: n.email.trim() || false,
    phone: n.telefono.trim() || false,
  }
  if (campi.has('mobile') && n.cellulare.trim()) {
    valori.mobile = n.cellulare.trim()
  }
  if (!n.eAzienda) {
    valori.function = n.funzione.trim() || false
    const azienda = n.azienda.trim()
    if (azienda) {
      const [trovata] = await callKw<Id[]>(server, 'res.partner', 'search', [
        [['is_company', '=', true], ['name', '=ilike', azienda]],
      ], { limit: 1 })
      if (trovata) {
        valori.parent_id = trovata
      } else if (campi.has('company_name')) {
        valori.company_name = azienda
      }
    }
  }
  return callKw<Id>(server, 'res.partner', 'create', [valori])
}

/** Prima lettera per i gruppi della lista (A, B, ... e # per il resto). */
export function lettera(nome: string): string {
  const l = nome.trim().charAt(0).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return /[A-Z]/.test(l) ? l : '#'
}
