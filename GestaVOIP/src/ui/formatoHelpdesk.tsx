/** Pezzi comuni delle schermate Helpdesk: stelle della priorita', colori, «3 giorni fa». */

import Ionicons from '@expo/vector-icons/Ionicons'
import { View } from 'react-native'
import { t, tn } from '../i18n'
import type { Colori } from './tema'

export function quantoFa(d: Date | null): string {
  if (!d) {
    return ''
  }
  const giorni = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  return giorni < 1 ? t('helpdesk.oggi') : tn('helpdesk.giorniFa', giorni)
}

export function colorePriorita(p: number, c: Colori): string {
  return p >= 3 ? c.rosso : p === 2 ? '#E8890C' : p === 1 ? '#D9A400' : c.testo3
}

export function Stelle({ valore, dimensione = 14, colore }: { valore: number; dimensione?: number; colore: string }) {
  if (!valore) {
    return null
  }
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {Array.from({ length: valore }, (_, i) => (
        <Ionicons key={i} name="star" size={dimensione} color={colore} />
      ))}
    </View>
  )
}

/** Ore decimali come «1:30». */
export function oreMinuti(ore: number): string {
  const tot = Math.round(ore * 60)
  return `${Math.floor(tot / 60)}:${String(tot % 60).padStart(2, '0')}`
}
