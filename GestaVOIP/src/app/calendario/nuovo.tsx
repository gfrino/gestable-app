/** Nuovo appuntamento: il modulo completo, aperto sul giorno scelto nel calendario. */

import { useLocalSearchParams } from 'expo-router'
import { ModuloEvento } from '../../ui/calendario/ModuloEvento'

export default function NuovoAppuntamento() {
  const { giorno } = useLocalSearchParams<{ giorno?: string }>()
  return <ModuloEvento id={null} giorno={giorno} />
}
