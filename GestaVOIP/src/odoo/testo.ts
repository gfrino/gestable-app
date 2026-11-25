/** Testo dei messaggi di Odoo (HTML) per una lista o una bolla di chat, e ritorno. */

const ENTITA: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export function testoDaHtml(html: string | false | null | undefined): string {
  if (!html) {
    return ''
  }
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (tutto, e: string) => {
      if (e[0] === '#') {
        const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
        return Number.isFinite(n) ? String.fromCodePoint(n) : tutto
      }
      return ENTITA[e.toLowerCase()] ?? tutto
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Quello che si scrive nell'app diventa HTML sicuro per Odoo: niente tag, a capo come <br>. */
export function htmlDaTesto(testo: string): string {
  return testo
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>')
}

/** Date di Odoo («2026-11-25 07:12:03», UTC) in un Date. */
export function dataOdoo(valore: string | false | null | undefined): Date | null {
  if (!valore) {
    return null
  }
  const d = new Date(valore.includes('T') ? valore : `${valore.replace(' ', 'T')}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** «14:05», «ieri», «lun», «12.11.»: come le liste dei messaggi del telefono. */
export function quandoBreve(d: Date | null): string {
  if (!d) {
    return ''
  }
  const oggi = new Date()
  const inizio = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const giorni = Math.round((inizio(oggi) - inizio(d)) / 86_400_000)
  if (giorni === 0) {
    return d.toLocaleTimeString('it-CH', { hour: '2-digit', minute: '2-digit' })
  }
  if (giorni === 1) {
    return 'ieri'
  }
  if (giorni < 7) {
    return d.toLocaleDateString('it-CH', { weekday: 'short' })
  }
  return d.toLocaleDateString('it-CH', { day: '2-digit', month: '2-digit' })
}
