/**
 * Sito web e social di un contatto, sotto il nome: il sito come testo breve
 * (dominio) con il globo, i social come icone tonde con il loro colore.
 *
 * Odoo non ha campi social sul contatto: i link si cercano nel sito, nei campi
 * di moduli che li aggiungono (facebook, instagram, social_*...) e nei campi
 * di testo dove spesso li scrivono (es. un link Facebook nella posizione
 * lavorativa). Un campo che contiene solo un link non si mostra anche come testo.
 */

import Ionicons from '@expo/vector-icons/Ionicons'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { raggio, spazio, useColori } from '../tema'

type Social = { chiave: string; icona: keyof typeof Ionicons.glyphMap; colore: string; nome: string; dominio: RegExp }

const SOCIAL: Social[] = [
  { chiave: 'facebook', icona: 'logo-facebook', colore: '#1877F2', nome: 'Facebook', dominio: /(^|\.)(facebook|fb)\.(com|me)$/ },
  { chiave: 'instagram', icona: 'logo-instagram', colore: '#E1306C', nome: 'Instagram', dominio: /(^|\.)instagram\.com$/ },
  { chiave: 'linkedin', icona: 'logo-linkedin', colore: '#0A66C2', nome: 'LinkedIn', dominio: /(^|\.)linkedin\.com$/ },
  { chiave: 'x', icona: 'logo-twitter', colore: '#000000', nome: 'X', dominio: /(^|\.)(twitter|x)\.com$/ },
  { chiave: 'youtube', icona: 'logo-youtube', colore: '#FF0000', nome: 'YouTube', dominio: /(^|\.)(youtube\.com|youtu\.be)$/ },
  { chiave: 'tiktok', icona: 'logo-tiktok', colore: '#000000', nome: 'TikTok', dominio: /(^|\.)tiktok\.com$/ },
  { chiave: 'whatsapp', icona: 'logo-whatsapp', colore: '#25D366', nome: 'WhatsApp', dominio: /(^|\.)(wa\.me|whatsapp\.com)$/ },
  { chiave: 'pinterest', icona: 'logo-pinterest', colore: '#E60023', nome: 'Pinterest', dominio: /(^|\.)pinterest\.[a-z.]+$/ },
  { chiave: 'github', icona: 'logo-github', colore: '#181717', nome: 'GitHub', dominio: /(^|\.)github\.com$/ },
]

const LINK = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|(?:facebook|instagram|linkedin|twitter|youtube|tiktok)\.com\/[^\s<>"']+)/gi

function url(x: string): string {
  return /^https?:\/\//i.test(x) ? x : `https://${x}`
}

function dominio(x: string): string {
  try {
    return new URL(url(x)).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

function socialDi(x: string): Social | null {
  const d = dominio(x)
  return SOCIAL.find((s) => s.dominio.test(d)) || null
}

/** Il campo contiene solo un link (da non mostrare anche come testo)? */
export function soloLink(testo: string): boolean {
  const t = testo.trim()
  return !!t && t.replace(LINK, '').trim() === ''
}

/** Sito e social trovati nei testi: un sito, social senza doppioni. */
export function trovaCollegamenti(sito: string, testi: string[]): { sito: string; social: { s: Social; url: string }[] } {
  const visti = new Set<string>()
  const social: { s: Social; url: string }[] = []
  let primoSito = sito.trim() && !socialDi(sito) ? sito.trim() : ''
  for (const t of [sito, ...testi]) {
    for (const m of (t || '').match(LINK) || []) {
      const pulito = m.replace(/[.,;)]+$/, '')
      const s = socialDi(pulito)
      if (s) {
        if (!visti.has(s.chiave)) {
          visti.add(s.chiave)
          social.push({ s, url: url(pulito) })
        }
      } else if (!primoSito) {
        primoSito = pulito
      }
    }
  }
  return { sito: primoSito, social }
}

export function Collegamenti({ sito, social }: ReturnType<typeof trovaCollegamenti>) {
  const c = useColori()
  if (!sito && !social.length) {
    return null
  }
  const apri = (u: string) => void Linking.openURL(u).catch(() => undefined)
  return (
    <View style={s.riga}>
      {sito ? (
        <Pressable onPress={() => apri(url(sito))} style={({ pressed }) => [s.sito, { backgroundColor: pressed ? c.superficie2 : c.primarioTenue }]} accessibilityRole="link" accessibilityLabel={sito}>
          <Ionicons name="globe-outline" size={16} color={c.primario} />
          <Text style={[s.sitoTesto, { color: c.primario }]} numberOfLines={1}>
            {dominio(sito) || sito}
          </Text>
        </Pressable>
      ) : null}
      {social.map(({ s: x, url: u }) => (
        <Pressable
          key={x.chiave}
          onPress={() => apri(u)}
          hitSlop={4}
          style={({ pressed }) => [s.icona, { backgroundColor: c.superficie, borderColor: c.bordo, opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="link"
          accessibilityLabel={x.nome}
        >
          <Ionicons name={x.icona} size={20} color={x.chiave === 'x' || x.chiave === 'tiktok' || x.chiave === 'github' ? c.testo : x.colore} />
        </Pressable>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  riga: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spazio.s },
  sito: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: raggio.tondo, maxWidth: '100%', flexShrink: 1 },
  sitoTesto: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  icona: { width: 36, height: 36, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
})
