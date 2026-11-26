/**
 * Notifiche push dei messaggi di Odoo (modulo tw_gestable_mobile sul server).
 *
 * Per ora solo iPhone: su Android le chiamate arrivano dal canale Firebase di
 * Twilio, e un secondo ricevitore Firebase (quello di expo-notifications) le
 * ruberebbe. expo-notifications e' escluso dalla build Android (package.json,
 * expo.autolinking) e qui non si carica nemmeno.
 *
 * Il server sceglie a chi mandare (gli stessi che Odoo avvisa nel browser);
 * l'app registra il telefono dopo l'accesso, lo toglie all'uscita, apre la chat
 * toccando la notifica e non mostra il banner della chat che e' gia' aperta.
 */

import * as Application from 'expo-application'
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { ErroreOdoo, rpc } from '../odoo/client'
import { segnalaErrore } from '../ui/crash'

type ModuloNotifiche = typeof import('expo-notifications')

// Caricato solo su iOS: su Android il modulo nativo non c'e' (un import statico lo caricherebbe).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const N: ModuloNotifiche | null = Platform.OS === 'ios' ? (require('expo-notifications') as ModuloNotifiche) : null

const CHIAVE_TOKEN = 'gestable.push.token'
const CHIAVE_CHIESTO = 'gestable.push.chiesto'
const ATTESA_TOKEN = 20_000

export type Permesso = 'concesso' | 'negato' | 'da-chiedere' | 'non-disponibile'

/** Cosa contiene una notifica di un messaggio (vedi tw_gestable_mobile, _gestable_push_content). */
export type DatiNotifica = {
  model?: string
  res_id?: number
  message_id?: number
  channel_type?: string
  name?: string
}

export function pushDisponibile(): boolean {
  return !!N
}

export async function permesso(): Promise<Permesso> {
  if (!N) {
    return 'non-disponibile'
  }
  const p = await N.getPermissionsAsync()
  if (p.granted) {
    return 'concesso'
  }
  return p.canAskAgain ? 'da-chiedere' : 'negato'
}

export async function chiediPermesso(): Promise<boolean> {
  if (!N) {
    return false
  }
  await segnaChiesto()
  const p = await N.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } })
  return p.granted
}

/** L'invito e' stato visto (anche con «Non ora»): non torna, si attiva da Impostazioni. */
export async function segnaChiesto(): Promise<void> {
  await SecureStore.setItemAsync(CHIAVE_CHIESTO, '1').catch(() => undefined)
}

/** Vero se l'invito alle notifiche e' gia' stato mostrato (non si insiste). */
export async function giaChiesto(): Promise<boolean> {
  return (await SecureStore.getItemAsync(CHIAVE_CHIESTO).catch(() => null)) === '1'
}

/** Il server ha il modulo GestABLE (le notifiche si possono mandare)? */
export async function serverConNotifiche(server: string): Promise<boolean> {
  try {
    await rpc(server, '/gestable/features')
    return true
  } catch (e) {
    if (e instanceof ErroreOdoo && e.tipo === 'modulo') {
      return false
    }
    throw e
  }
}

/** Registra questo telefono sull'utente collegato. Da chiamare a ogni avvio: tiene vivo l'«ultimo segnale». */
export async function registraTelefono(server: string): Promise<boolean> {
  if (!N || (await permesso()) !== 'concesso') {
    return false
  }
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId
  // iOS a volte non consegna il codice (rete, simulatore): non si aspetta per sempre.
  const token = (
    await Promise.race([
      N.getExpoPushTokenAsync(projectId ? { projectId } : undefined),
      new Promise<never>((_, no) => setTimeout(() => no(new Error('push token: nessuna risposta da iOS')), ATTESA_TOKEN)),
    ])
  ).data
  const r = await rpc<{ status: string; message?: string }>(server, '/gestable/device/register', {
    token,
    platform: Platform.OS,
    label: Device.modelName || Device.deviceName || '',
    app_version: Application.nativeApplicationVersion || '',
  })
  if (r.status !== 'success') {
    throw new Error(r.message || 'register')
  }
  await SecureStore.setItemAsync(CHIAVE_TOKEN, token).catch(() => undefined)
  return true
}

/** All'uscita: il telefono smette di ricevere i messaggi di quell'utente. */
export async function togliTelefono(server: string): Promise<void> {
  const token = await SecureStore.getItemAsync(CHIAVE_TOKEN).catch(() => null)
  if (!token) {
    return
  }
  try {
    await rpc(server, '/gestable/device/unregister', { token })
  } catch (e) {
    // Server senza modulo o irraggiungibile: Odoo lo spegne da solo dopo 60 giorni.
    if (!(e instanceof ErroreOdoo && e.tipo === 'modulo')) {
      segnalaErrore(e, 'notifiche: uscita')
    }
  }
  await SecureStore.deleteItemAsync(CHIAVE_TOKEN).catch(() => undefined)
}

// ---------------------------------------------------------------- in primo piano

let chatAperta = 0
const ascoltatori = new Set<(dati: DatiNotifica) => void>()

/** La schermata della chat dice quale chat e' aperta: per quella niente banner. */
export function segnaChatAperta(canale: number): () => void {
  chatAperta = canale
  return () => {
    if (chatAperta === canale) {
      chatAperta = 0
    }
  }
}

/** Avvisa la schermata aperta quando arriva un messaggio (per aggiornarsi subito). */
export function quandoArriva(fn: (dati: DatiNotifica) => void): () => void {
  ascoltatori.add(fn)
  return () => {
    ascoltatori.delete(fn)
  }
}

function dati(n: { request: { content: { data?: unknown } } }): DatiNotifica {
  return (n.request.content.data || {}) as DatiNotifica
}

if (N) {
  N.setNotificationHandler({
    handleNotification: async (n) => {
      const d = dati(n)
      ascoltatori.forEach((fn) => fn(d))
      const stessaChat = d.model === 'discuss.channel' && !!d.res_id && d.res_id === chatAperta
      return { shouldShowBanner: !stessaChat, shouldShowList: !stessaChat, shouldPlaySound: !stessaChat, shouldSetBadge: false }
    },
  })
}

/**
 * Tocco sulla notifica: chiama `apri` con i dati (anche per la notifica che ha
 * aperto l'app da chiusa). Restituisce la funzione per smettere di ascoltare.
 */
export function suTocco(apri: (dati: DatiNotifica) => void): () => void {
  if (!N) {
    return () => undefined
  }
  const ultima = N.getLastNotificationResponse()
  if (ultima) {
    N.clearLastNotificationResponse()
    apri(dati(ultima.notification))
  }
  const sub = N.addNotificationResponseReceivedListener((r) => {
    N.clearLastNotificationResponse()
    apri(dati(r.notification))
  })
  return () => sub.remove()
}
