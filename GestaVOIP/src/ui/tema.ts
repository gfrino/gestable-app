import { useColorScheme } from 'react-native'

// Colori presi dal logo GestABLE (GestABLE/Grafiche): viola per le azioni,
// verde per chiamare. Le tonalita' sono scurite o schiarite quanto basta per
// restare leggibili sul bianco e sul nero.

const chiaro = {
  sfondo: '#F6F7FB',
  superficie: '#FFFFFF',
  superficie2: '#EEF0F7',
  testo: '#151826',
  testo2: '#5B6175',
  testo3: '#8A90A3',
  bordo: '#E1E4EE',
  primario: '#7E3FC0',
  primarioTesto: '#FFFFFF',
  primarioTenue: '#F3EAFB',
  verde: '#17A35A',
  rosso: '#E0383E',
  ambra: '#C77700',
  ambraTenue: '#FFF3DC',
  rossoTenue: '#FDECEC',
  verdeTenue: '#E4F6EC',
}

const scuro: typeof chiaro = {
  sfondo: '#0E1018',
  superficie: '#171A26',
  superficie2: '#222636',
  testo: '#F2F3F8',
  testo2: '#AEB3C5',
  testo3: '#7D8397',
  bordo: '#2A2F42',
  primario: '#C98AF2',
  primarioTesto: '#0E1018',
  primarioTenue: '#33204A',
  verde: '#1FBB67',
  rosso: '#FF5C61',
  ambra: '#F5A623',
  ambraTenue: '#3A2C12',
  rossoTenue: '#3B1A1C',
  verdeTenue: '#15301F',
}

export type Colori = typeof chiaro

export function useColori(): Colori {
  return useColorScheme() === 'dark' ? scuro : chiaro
}

export const spazio = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 }
export const raggio = { s: 8, m: 12, l: 16, tondo: 999 }
