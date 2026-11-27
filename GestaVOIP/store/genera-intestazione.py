#!/usr/bin/env python3
"""
Immagini per App Store Connect → pagina prodotto:
- «Intestazione» (header) 3840×1646, 21:9
- «Risultati della ricerca» 3840×2560, 3:2
PNG senza trasparenza, dagli screenshot in store/screenshots/raw e dal logo G.

Uso: python3 store/genera-intestazione.py   (scrive in store/app-store/)
"""

import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

QUI = os.path.dirname(os.path.abspath(__file__))
RADICE = os.path.dirname(QUI)
USCITA = os.path.join(QUI, 'app-store')
SF = '/System/Library/Fonts/SFNS.ttf'

FONDO_ALTO = (24, 14, 40)
FONDO_BASSO = (12, 14, 22)
MAGENTA = (179, 58, 126)
BLU = (15, 122, 182)
VIOLA = (131, 70, 194)
TESTO = (255, 255, 255)
TESTO2 = (214, 210, 230)


def font(peso, dim):
    f = ImageFont.truetype(SF, dim)
    f.set_variation_by_name(peso)
    return f


def fondo(l, a):
    """Sfondo scuro con due aloni (magenta e blu come la G)."""
    img = Image.new('RGB', (l, a))
    d = ImageDraw.Draw(img)
    for y in range(a):
        t = y / (a - 1)
        d.line([(0, y), (l, y)], fill=tuple(int(FONDO_ALTO[i] * (1 - t) + FONDO_BASSO[i] * t) for i in range(3)))
    alone = Image.new('RGB', (l, a), (0, 0, 0))
    da = ImageDraw.Draw(alone)
    r = int(a * 0.75)
    da.ellipse([int(l * 0.70) - r, int(a * 0.35) - r, int(l * 0.70) + r, int(a * 0.35) + r], fill=MAGENTA)
    r2 = int(a * 0.55)
    da.ellipse([int(l * 0.92) - r2, int(a * 0.95) - r2, int(l * 0.92) + r2, int(a * 0.95) + r2], fill=BLU)
    alone = alone.filter(ImageFilter.GaussianBlur(a * 0.28))
    return Image.blend(img, Image.composite(alone, img, Image.new('L', (l, a), 255)), 0.42)


def telefono(nome, altezza):
    """Screenshot dentro una cornice da iPhone, con angoli tondi; ritorna RGBA."""
    s = Image.open(os.path.join(QUI, 'screenshots', 'raw', nome)).convert('RGB')
    bordo = int(altezza * 0.022)
    h_schermo = altezza - 2 * bordo
    l_schermo = int(h_schermo * s.width / s.height)
    s = s.resize((l_schermo, h_schermo), Image.LANCZOS)
    l = l_schermo + 2 * bordo
    tel = Image.new('RGBA', (l, altezza), (0, 0, 0, 0))
    d = ImageDraw.Draw(tel)
    raggio = int(l * 0.16)
    d.rounded_rectangle([0, 0, l - 1, altezza - 1], raggio, fill=(20, 20, 26, 255), outline=(70, 66, 86, 255), width=max(2, bordo // 5))
    maschera = Image.new('L', (l_schermo, h_schermo), 0)
    ImageDraw.Draw(maschera).rounded_rectangle([0, 0, l_schermo - 1, h_schermo - 1], raggio - bordo, fill=255)
    tel.paste(s, (bordo, bordo), maschera)
    return tel


def incolla_con_ombra(base, el, x, y, angolo=0):
    if angolo:
        el = el.rotate(angolo, resample=Image.BICUBIC, expand=True)
    ombra = Image.new('RGBA', base.size, (0, 0, 0, 0))
    alfa = el.split()[3].point(lambda v: int(v * 0.55))
    nero = Image.new('RGBA', el.size, (0, 0, 0, 255))
    nero.putalpha(alfa)
    ombra.alpha_composite(nero, (x + int(el.width * 0.03), y + int(el.height * 0.04)))
    ombra = ombra.filter(ImageFilter.GaussianBlur(el.height * 0.03))
    base.alpha_composite(ombra)
    base.alpha_composite(el, (x, y))


def logo(dim):
    g = Image.open(os.path.join(RADICE, 'assets', 'logo-gestable.png')).convert('RGBA')
    return g.resize((dim, dim), Image.LANCZOS)


def scrivi(d, xy, testo, f, colore):
    d.text(xy, testo, font=f, fill=colore)


def intestazione():
    L, A = 3840, 1646
    img = fondo(L, A).convert('RGBA')
    # Telefoni a destra (dentro l'80 % centrale, per i tagli dei vari schermi).
    h = int(A * 0.92)
    t1 = telefono('1-tastierino.png', int(h * 0.88))
    t2 = telefono('2-calendario.png', h)
    t3 = telefono('4-scheda-contatto.png', int(h * 0.88))
    cx = int(L * 0.66)
    incolla_con_ombra(img, t1, cx - int(t2.width * 1.05), int(A * 0.14), angolo=6)
    incolla_con_ombra(img, t3, cx + int(t2.width * 0.62), int(A * 0.14), angolo=-6)
    incolla_con_ombra(img, t2, cx - t2.width // 2 + int(t2.width * 0.2), int(A * 0.06))
    # Testo a sinistra.
    d = ImageDraw.Draw(img)
    x = int(L * 0.115)
    g = logo(230)
    img.alpha_composite(g, (x, int(A * 0.20)))
    scrivi(d, (x + 280, int(A * 0.20) + 18), 'GestABLE', font('Heavy', 190), TESTO)
    titolo = font('Bold', 150)
    scrivi(d, (x, int(A * 0.43)), 'Il telefono dell’ufficio', titolo, TESTO)
    scrivi(d, (x, int(A * 0.43) + 180), 'e il tuo Odoo, in tasca', titolo, TESTO)
    sotto = font('Medium', 84)
    d.rounded_rectangle([x, int(A * 0.70), x + 170, int(A * 0.70) + 16], 8, fill=MAGENTA)
    scrivi(d, (x, int(A * 0.74)), 'Chiamate, contatti, calendario, CRM e vendite', sotto, TESTO2)
    return img.convert('RGB')


def ricerca():
    L, A = 3840, 2560
    img = fondo(L, A).convert('RGBA')
    d = ImageDraw.Draw(img)
    # Titolo in alto al centro.
    titolo = font('Bold', 176)
    riga = 'Il telefono dell’ufficio e il tuo Odoo, in tasca'
    w = d.textlength(riga, font=titolo)
    scrivi(d, ((L - w) / 2, int(A * 0.07)), riga, titolo, TESTO)
    # Tre telefoni affiancati, dritti, leggibili anche in piccolo.
    h = int(A * 0.74)
    nomi = ['1-tastierino.png', '2-calendario.png', '4-scheda-contatto.png']
    tel = [telefono(n, h) for n in nomi]
    spazio = int(L * 0.05)
    tot = sum(t.width for t in tel) + spazio * 2
    x = (L - tot) // 2
    for t in tel:
        incolla_con_ombra(img, t, x, int(A * 0.22))
        x += t.width + spazio
    return img.convert('RGB')


if __name__ == '__main__':
    os.makedirs(USCITA, exist_ok=True)
    a = os.path.join(USCITA, 'intestazione-3840x1646.png')
    b = os.path.join(USCITA, 'ricerca-3840x2560.png')
    intestazione().save(a, optimize=True)
    ricerca().save(b, optimize=True)
    for p in (a, b):
        print(p, Image.open(p).size, Image.open(p).mode, os.path.getsize(p) // 1024, 'KB')
