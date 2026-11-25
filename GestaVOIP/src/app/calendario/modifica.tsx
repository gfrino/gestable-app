/** Modifica di un appuntamento: lo stesso modulo del nuovo, con i dati di Odoo. */

import { useLocalSearchParams } from 'expo-router'
import { ModuloEvento } from '../../ui/calendario/ModuloEvento'

export default function ModificaAppuntamento() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <ModuloEvento id={Number(id)} />
}
