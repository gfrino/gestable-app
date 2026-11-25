/** Chiamare un numero da qualsiasi schermata: dal telefono dell'app se c'e', altrimenti dal sistema. */

import { Alert, Linking } from 'react-native'
import { t } from '../i18n'
import { conTelefono, type Sessione } from '../odoo/sessione'
import { telefono } from '../voip/telefono'

export function chiamaNumero(sessione: Sessione | null, numero: string, nome = '') {
  if (!numero) {
    return
  }
  if (conTelefono(sessione)) {
    telefono.chiama(numero, nome).catch((e) => Alert.alert(t('telefono.nonPartita'), e instanceof Error ? e.message : String(e)))
  } else {
    Linking.openURL(`tel:${numero.replace(/\s+/g, '')}`).catch(() => undefined)
  }
}
