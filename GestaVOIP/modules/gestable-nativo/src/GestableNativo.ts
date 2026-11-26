/**
 * GestABLE nativo (solo iOS): chiamate chieste da Siri e dai Recenti del Telefono,
 * schermata CarPlay, scanner degli scontrini per le Spese. Opzionale: nelle build senza il modulo (o su Android) tutte
 * le funzioni non fanno nulla, cosi' lo stesso JavaScript va su ogni build.
 */

import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core'

export type VoceAuto = { titolo: string; sottotitolo: string; numero: string; entrata: boolean }
export type DatiAuto = { accesso: boolean; recenti: VoceAuto[]; frequenti: VoceAuto[]; testi: Record<string, string> }

type Eventi = {
  onChiama: (e: { numero: string }) => void
  onSceltaAuto: (e: { numero: string }) => void
  onConnessioneAuto: (e: { collegata: boolean }) => void
}

type Modulo = {
  prendiNumeroInAttesa(): string | null
  autoCollegata(): boolean
  aggiornaAuto(d: DatiAuto): Promise<void>
  chiediSiri(): Promise<boolean>
  scannerScontrini?(): boolean
  scansionaScontrino?(): Promise<string[]>
  scegliFotoScontrino?(): Promise<string[]>
  addListener<K extends keyof Eventi>(nome: K, fn: Eventi[K]): EventSubscription
}

const modulo = requireOptionalNativeModule<Modulo>('GestableNativo')

export const nativoDisponibile = !!modulo

export function prendiNumeroInAttesa(): string | null {
  return modulo?.prendiNumeroInAttesa() ?? null
}

export function autoCollegata(): boolean {
  return modulo?.autoCollegata() ?? false
}

export async function aggiornaAuto(d: DatiAuto): Promise<void> {
  await modulo?.aggiornaAuto(d)
}

export async function chiediSiri(): Promise<boolean> {
  return modulo ? modulo.chiediSiri() : false
}

/**
 * C'e' lo scanner degli scontrini in questa build? Le build precedenti alla 1.2
 * (e Android, per ora) non l'hanno: li' le Spese restano quelle di Odoo.
 */
export const spesePossibili = typeof modulo?.scansionaScontrino === 'function'

/** Scontrino fotografato con lo scanner di iOS: indirizzi file:// delle pagine, [] se annullato. */
export async function scansionaScontrino(): Promise<string[]> {
  return modulo?.scansionaScontrino ? modulo.scansionaScontrino() : []
}

/** Una foto dalla galleria: [indirizzo file://] o [] se annullato. */
export async function scegliFotoScontrino(): Promise<string[]> {
  return modulo?.scegliFotoScontrino ? modulo.scegliFotoScontrino() : []
}

export function ascolta<K extends keyof Eventi>(nome: K, fn: Eventi[K]): () => void {
  const sub = modulo?.addListener(nome, fn)
  return () => sub?.remove()
}
