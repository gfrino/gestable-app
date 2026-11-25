/**
 * GestABLE nativo (solo iOS): chiamate chieste da Siri e dai Recenti del Telefono,
 * schermata CarPlay. Opzionale: nelle build senza il modulo (o su Android) tutte
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

export function ascolta<K extends keyof Eventi>(nome: K, fn: Eventi[K]): () => void {
  const sub = modulo?.addListener(nome, fn)
  return () => sub?.remove()
}
