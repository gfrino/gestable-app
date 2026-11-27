#!/usr/bin/env python3
"""
Immagini per App Store Connect → pagina prodotto:
- «Intestazione» (header) 3840×1646, 21:9
- «Risultati della ricerca» 3840×2560, 3:2
PNG senza trasparenza, dagli screenshot in store/screenshots/raw e dal logo G. Fondo chiaro; messaggio: tutta l'azienda in tasca, basato su Odoo ma ridisegnato.

Uso: python3 store/genera-intestazione.py   (scrive in store/app-store/)
"""

import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

QUI = os.path.dirname(os.path.abspath(__file__))
RADICE = os.path.dirname(QUI)
USCITA = os.path.join(QUI, 'app-store')
SF = '/System/Library/Fonts/SFNS.ttf'

FONDO_ALTO = (252, 247, 252)
FONDO_BASSO = (238, 245, 252)
MAGENTA = (179, 58, 126)
BLU = (15, 122, 182)
VIOLA = (131, 70, 194)
TESTO = (27, 21, 48)
TESTO2 = (88, 82, 110)
PILLOLA = (247, 226, 239)


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
    alone = alone.filter(ImageFilter.GaussianBlur(a * 0.30))
    maschera = alone.convert('L').point(lambda v: int(v * 0.22))
    return Image.composite(alone, img, maschera)


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
    alfa = el.split()[3].point(lambda v: int(v * 0.30))
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


def pillola(img, d, x, y, testo, f):
    w = d.textlength(testo, font=f)
    alto = int(f.size * 1.75)
    d.rounded_rectangle([x, y, x + w + f.size * 1.6, y + alto], alto // 2, fill=PILLOLA)
    d.text((x + f.size * 0.8, y + alto / 2), testo, font=f, fill=MAGENTA, anchor='lm')
    return alto


def intestazione():
    L, A = 3840, 1646
    img = fondo(L, A).convert('RGBA')
    # Telefoni a destra (dentro l'80 % centrale, per i tagli dei vari schermi).
    # Due telefoni a destra, lontani dal testo.
    h = int(A * 0.92)
    t2 = telefono('6-crm.png', h)
    t3 = telefono('7-preventivo.png', int(h * 0.88))
    x2 = int(L * 0.60)
    incolla_con_ombra(img, t3, x2 + int(t2.width * 0.78), int(A * 0.13), angolo=-5)
    incolla_con_ombra(img, t2, x2, int(A * 0.05))
    # Testo a sinistra.
    d = ImageDraw.Draw(img)
    x = int(L * 0.10)
    g = logo(200)
    img.alpha_composite(g, (x, int(A * 0.15)))
    scrivi(d, (x + 245, int(A * 0.15) + 14), 'GestABLE', font('Heavy', 165), TESTO)
    titolo = font('Heavy', 160)
    scrivi(d, (x, int(A * 0.36)), 'Tutta la tua azienda,', titolo, TESTO)
    scrivi(d, (x, int(A * 0.36) + 200), 'in tasca', titolo, MAGENTA)
    scrivi(d, (x, int(A * 0.64)), 'Chiamate, CRM, vendite, calendario, ferie e chat', font('Medium', 74), TESTO2)
    pillola(img, d, x, int(A * 0.75), 'Basato su Odoo · ridisegnato, moderno e flessibile', font('Semibold', 70))
    return img.convert('RGB')


def ricerca():
    L, A = 3840, 2560
    img = fondo(L, A).convert('RGBA')
    d = ImageDraw.Draw(img)
    titolo = font('Heavy', 190)
    a, b = 'Tutta la tua azienda, ', 'in tasca'
    wa, wb = d.textlength(a, font=titolo), d.textlength(b, font=titolo)
    x0 = (L - wa - wb) / 2
    scrivi(d, (x0, int(A * 0.055)), a, titolo, TESTO)
    scrivi(d, (x0 + wa, int(A * 0.055)), b, titolo, MAGENTA)
    f = font('Semibold', 82)
    testo = 'Basato su Odoo · ridisegnato, moderno e flessibile'
    w = d.textlength(testo, font=f) + f.size * 1.6
    pillola(img, d, int((L - w) / 2), int(A * 0.165), testo, f)
    # Quattro telefoni affiancati, dritti, leggibili anche in piccolo.
    h = int(A * 0.60)
    nomi = ['1-tastierino.png', '6-crm.png', '7-preventivo.png', '8-scheda-azienda.png']
    tel = [telefono(n, h) for n in nomi]
    spazio = int(L * 0.028)
    tot = sum(t.width for t in tel) + spazio * (len(tel) - 1)
    x = (L - tot) // 2
    for t in tel:
        incolla_con_ombra(img, t, x, int(A * 0.29))
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
