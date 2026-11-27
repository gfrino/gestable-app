#!/usr/bin/env python3
"""
Video promozionale di GestABLE: scene registrate dal simulatore (demo, in
italiano) dentro un telefono, con titolo e sottotitolo, sfondo chiaro come
l'intestazione dell'App Store. Due formati: 16:9 (sito, YouTube, LinkedIn) e
9:16 (Reels, TikTok, Stories).

Le clip grezze stanno in store/video/clip/ (fuori da git: contengono parti
non tagliate del demo). Si registrano con
  xcrun simctl io <simulatore> recordVideo --codec=h264 clip/<nome>.mp4
e a fine scena si salva clip/<nome>-fine.png (il registratore salva solo i
fotogrammi che cambiano e perde l'ultimo dopo un'animazione).

Uso: python3 store/video/genera-video.py   (scrive store/video/gestable-*.mp4)
"""

import os
import shutil
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFilter, ImageFont

QUI = os.path.dirname(os.path.abspath(__file__))
STORE = os.path.dirname(QUI)
RADICE = os.path.dirname(STORE)
CLIP = os.path.join(QUI, 'clip')
SF = '/System/Library/Fonts/SFNS.ttf'
FPS = 30
DISSOLVENZA = 0.45

FONDO_ALTO = (252, 247, 252)
FONDO_BASSO = (238, 245, 252)
MAGENTA = (179, 58, 126)
BLU = (15, 122, 182)
TESTO = (27, 21, 48)
TESTO2 = (88, 82, 110)
PILLOLA = (247, 226, 239)

SLOGAN = 'Basato su Odoo · ridisegnato, moderno e flessibile'

# Scene: titolo, sottotitolo, sorgente. Per le clip, i tratti da tenere
# (secondi della registrazione) e quanto resta ferma l'immagine finale.
SCENE = [
    {'tipo': 'apertura', 'durata': 3.6},
    {'titolo': 'Chiamate con il numero\ndell\'ufficio', 'sotto': 'Il centralino aziendale nel telefono,\novunque tu sia',
     'immagine': os.path.join(STORE, 'screenshots', 'raw', '1-tastierino.png'), 'durata': 3.6},
    {'titolo': 'Clienti e fornitori\nsempre con te', 'sotto': 'I contatti di Odoo: cerca, filtra\ne chiama con un tocco',
     'clip': '2-contatti', 'tratti': [(10.9, 11.6), (15.55, 16.47)], 'ferma': 1.9},
    {'titolo': 'Le opportunità,\nfase per fase', 'sotto': 'Il CRM di Odoo in una vista\nchiara e veloce',
     'clip': '3-crm', 'tratti': [(1.1, 3.3), (9.85, 10.75)], 'ferma': 1.6},
    {'titolo': 'Preventivi\nanche fuori ufficio', 'sotto': 'Prodotti e totali, invio per email\ne conferma dell\'ordine',
     'clip': '4-vendite', 'tratti': [(1.0, 3.0), (4.1, 7.3)], 'ferma': 1.0},
    {'titolo': 'L\'agenda\ndel team', 'sotto': 'Appuntamenti, luoghi e partecipanti\nsempre aggiornati',
     'clip': '5-calendario', 'tratti': [(0.5, 2.3), (4.0, 5.0)], 'ferma': 1.5},
    {'titolo': 'La chat\ndel team', 'sotto': 'I canali di Odoo Discuss,\nanche in cantiere',
     'clip': '6-chat', 'tratti': [(1.0, 2.5), (5.3, 5.61)], 'ferma': 1.8},
    {'titolo': 'Ferie, CRM e Vendite', 'sotto': 'Le app di Odoo, ridisegnate\nper il telefono',
     'clip': '7-gestable', 'tratti': [(0.9, 2.2), (4.3, 4.63)], 'ferma': 1.9},
    {'tipo': 'chiusura', 'durata': 4.2},
]

FORMATI = {
    'orizzontale': {'L': 1920, 'A': 1080},
    'verticale': {'L': 1080, 'A': 1920},
}


def font(peso, dim):
    f = ImageFont.truetype(SF, dim)
    f.set_variation_by_name(peso)
    return f


def fondo(l, a):
    """Sfondo chiaro con due aloni (magenta e blu come la G)."""
    img = Image.new('RGB', (l, a))
    d = ImageDraw.Draw(img)
    for y in range(a):
        t = y / (a - 1)
        d.line([(0, y), (l, y)], fill=tuple(int(FONDO_ALTO[i] * (1 - t) + FONDO_BASSO[i] * t) for i in range(3)))
    alone = Image.new('RGB', (l, a), (0, 0, 0))
    da = ImageDraw.Draw(alone)
    m = min(l, a)
    r = int(m * 0.75)
    da.ellipse([int(l * 0.78) - r, int(a * 0.30) - r, int(l * 0.78) + r, int(a * 0.30) + r], fill=MAGENTA)
    r2 = int(m * 0.55)
    da.ellipse([int(l * 0.95) - r2, int(a * 0.98) - r2, int(l * 0.95) + r2, int(a * 0.98) + r2], fill=BLU)
    alone = alone.filter(ImageFilter.GaussianBlur(m * 0.30))
    maschera = alone.convert('L').point(lambda v: int(v * 0.22))
    return Image.composite(alone, img, maschera)


def logo(dim):
    g = Image.open(os.path.join(RADICE, 'assets', 'logo-gestable.png')).convert('RGBA')
    return g.resize((dim, dim), Image.LANCZOS)


def pillola(d, x, y, testo, f, centrata=False):
    w = d.textlength(testo, font=f) + f.size * 1.6
    alto = int(f.size * 1.75)
    if centrata:
        x = x - w / 2
    d.rounded_rectangle([x, y, x + w, y + alto], alto // 2, fill=PILLOLA)
    d.text((x + f.size * 0.8, y + alto / 2), testo, font=f, fill=MAGENTA, anchor='lm')
    return alto


def righe(d, xy, testo, f, colore, interlinea=1.15, centrata=False):
    x, y = xy
    for r in testo.split('\n'):
        if centrata:
            d.text((x, y), r, font=f, fill=colore, anchor='ma')
        else:
            d.text((x, y), r, font=f, fill=colore)
        y += int(f.size * interlinea)
    return y


def geometria(fmt):
    """Dove stanno il telefono (schermo) e il testo nel formato."""
    L, A = fmt['L'], fmt['A']
    if L > A:
        h = int(A * 0.86)
        w = round(h * 1206 / 2622)
        return {'sw': w, 'sh': h, 'sx': int(L * 0.70 - w / 2), 'sy': (A - h) // 2, 'tx': int(L * 0.085), 'ty': int(A * 0.30)}
    h = int(A * 0.62)
    w = round(h * 1206 / 2622)
    return {'sw': w, 'sh': h, 'sx': (L - w) // 2, 'sy': int(A * 0.33), 'tx': L // 2, 'ty': int(A * 0.085)}


def cornice(g):
    """Bordo del telefono con lo schermo trasparente, e la maschera degli angoli dello schermo."""
    b = max(10, int(g['sh'] * 0.016))
    l, a = g['sw'] + 2 * b, g['sh'] + 2 * b
    raggio_s = int(g['sw'] * 0.155)
    ombra = Image.new('RGBA', (l + 200, a + 200), (0, 0, 0, 0))
    ImageDraw.Draw(ombra).rounded_rectangle([100 + 14, 100 + 24, 100 + l + 14, 100 + a + 24], raggio_s + b, fill=(40, 20, 60, 70))
    ombra = ombra.filter(ImageFilter.GaussianBlur(28))
    tel = Image.new('RGBA', (l, a), (0, 0, 0, 0))
    d = ImageDraw.Draw(tel)
    d.rounded_rectangle([0, 0, l - 1, a - 1], raggio_s + b, fill=(22, 20, 30, 255), outline=(80, 74, 98, 255), width=3)
    buco = Image.new('L', (l, a), 0)
    ImageDraw.Draw(buco).rounded_rectangle([b, b, b + g['sw'] - 1, b + g['sh'] - 1], raggio_s, fill=255)
    tel.putalpha(Image.composite(Image.new('L', (l, a), 0), tel.getchannel('A'), buco))
    ombra.alpha_composite(tel, (100, 100))
    maschera = Image.new('L', (g['sw'], g['sh']), 0)
    ImageDraw.Draw(maschera).rounded_rectangle([0, 0, g['sw'] - 1, g['sh'] - 1], raggio_s, fill=255)
    return ombra, (g['sx'] - b - 100, g['sy'] - b - 100), maschera


def titoli(fmt, g, s):
    """Titolo e sottotitolo su livello trasparente (entra in dissolvenza)."""
    L, A = fmt['L'], fmt['A']
    img = Image.new('RGBA', (L, A), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    vert = A > L
    # Il titolo non deve arrivare al telefono (16:9) o ai bordi (9:16).
    largo = (g['sx'] - g['tx'] - 70) if not vert else (L - 120)
    dim = 92 if not vert else 86
    while dim > 50 and max(d.textlength(r, font=font('Heavy', dim)) for r in s['titolo'].split('\n')) > largo:
        dim -= 2
    ft = font('Heavy', dim)
    fs = font('Medium', 42 if not vert else 40)
    if vert:
        x, y = g['tx'], g['ty']
        lg = logo(70)
        img.alpha_composite(lg, (x - 35, y))
        y += 105
        y = righe(d, (x, y), s['titolo'], ft, TESTO, 1.1, centrata=True)
        righe(d, (x, y + 18), s['sotto'], fs, TESTO2, 1.3, centrata=True)
    else:
        x, y = g['tx'], g['ty']
        lg = logo(64)
        img.alpha_composite(lg, (x, y - 110))
        d.text((x + 80, y - 110 + 32), 'GestABLE', font=font('Heavy', 46), fill=TESTO, anchor='lm')
        y = righe(d, (x, y), s['titolo'], ft, TESTO, 1.1)
        righe(d, (x, y + 22), s['sotto'], fs, TESTO2, 1.3)
    return img


def cartello(fmt, tipo):
    """Apertura e chiusura: logo, nome, frase."""
    L, A = fmt['L'], fmt['A']
    img = fondo(L, A).convert('RGBA')
    d = ImageDraw.Draw(img)
    vert = A > L
    cx = L // 2
    dim = 220 if not vert else 240
    y = int(A * (0.20 if not vert else 0.27))
    img.alpha_composite(logo(dim), (cx - dim // 2, y))
    y += dim + 40
    d.text((cx, y), 'GestABLE', font=font('Heavy', 120), fill=TESTO, anchor='ma')
    y += 165
    if tipo == 'apertura':
        ft = font('Heavy', 86 if not vert else 74)
        if vert:
            d.text((cx, y), 'Tutta la tua azienda,', font=ft, fill=TESTO, anchor='ma')
            d.text((cx, y + 92), 'in tasca', font=ft, fill=MAGENTA, anchor='ma')
        else:
            a, b = 'Tutta la tua azienda, ', 'in tasca'
            wa, wb = d.textlength(a, font=ft), d.textlength(b, font=ft)
            x0 = cx - (wa + wb) / 2
            d.text((x0, y), a, font=ft, fill=TESTO)
            d.text((x0 + wa, y), b, font=ft, fill=MAGENTA)
    else:
        f = font('Semibold', 40 if not vert else 34)
        pillola(d, cx, y, SLOGAN, f, centrata=True)
        y += 120
        d.text((cx, y), 'Scaricala dall\'App Store', font=font('Heavy', 64 if not vert else 58), fill=TESTO, anchor='ma')
        d.text((cx, y + 95), 'ticinoweb.com', font=font('Medium', 40), fill=TESTO2, anchor='ma')
    return img.convert('RGB')


def esegui(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(f'ffmpeg non riuscito:\n{r.stderr[-3000:]}')


def scena_video(fmt, g, s, i, tmp, risorse):
    """Una scena come mp4 della sua durata."""
    L, A = fmt['L'], fmt['A']
    uscita = os.path.join(tmp, f'scena-{i}.mp4')
    if s.get('tipo'):
        png = os.path.join(tmp, f'cartello-{i}.png')
        cartello(fmt, s['tipo']).save(png)
        esegui(['ffmpeg', '-y', '-v', 'error', '-loop', '1', '-t', str(s['durata']), '-i', png,
                '-vf', f'fps={FPS},format=yuv420p', '-c:v', 'libx264', '-crf', '16', uscita])
        return uscita, s['durata']

    tit = os.path.join(tmp, f'titoli-{i}.png')
    titoli(fmt, g, s).save(tit)
    sw, sh = g['sw'], g['sh']
    if s.get('clip'):
        src = os.path.join(CLIP, s['clip'] + '.mp4')
        fine = os.path.join(CLIP, s['clip'] + '-fine.png')
        durata = sum(b - a for a, b in s['tratti']) + s['ferma']
        parti = []
        filtro = []
        for k, (a, b) in enumerate(s['tratti']):
            filtro.append(f'[0:v]trim={a}:{b},setpts=PTS-STARTPTS,fps={FPS},scale={sw}:{sh}:flags=lanczos,setsar=1[t{k}]')
            parti.append(f'[t{k}]')
        filtro.append(f'[1:v]fps={FPS},scale={sw}:{sh}:flags=lanczos,setsar=1,trim=duration={s["ferma"]}[f]')
        filtro.append(''.join(parti) + f'[f]concat=n={len(parti) + 1}:v=1:a=0,format=rgba[app]')
        ingressi = ['-i', src, '-loop', '1', '-framerate', str(FPS), '-i', fine]
    else:
        durata = s['durata']
        filtro = [f'[0:v]fps={FPS},scale={sw}:{sh}:flags=lanczos,setsar=1,trim=duration={durata},format=rgba[app]']
        ingressi = ['-loop', '1', '-framerate', str(FPS), '-i', s['immagine'], '-loop', '1', '-framerate', str(FPS), '-i', s['immagine']]
    # 2 sfondo, 3 maschera schermo, 4 cornice, 5 titoli
    ingressi += ['-loop', '1', '-framerate', str(FPS), '-i', risorse['fondo'],
                 '-loop', '1', '-framerate', str(FPS), '-i', risorse['maschera'],
                 '-loop', '1', '-framerate', str(FPS), '-i', risorse['cornice'],
                 '-loop', '1', '-framerate', str(FPS), '-i', tit]
    cx, cy = risorse['pos_cornice']
    filtro += [
        f'[3:v]format=gray,trim=duration={durata}[m]',
        '[app][m]alphamerge[schermo]',
        f'[2:v]trim=duration={durata},format=rgba[bg]',
        f'[bg][schermo]overlay={g["sx"]}:{g["sy"]}:shortest=1[c1]',
        f'[4:v]format=rgba,trim=duration={durata}[cor]',
        f'[c1][cor]overlay={cx}:{cy}:shortest=1[c2]',
        f'[5:v]format=rgba,trim=duration={durata},fade=in:st=0.25:d=0.5:alpha=1[tt]',
        "[c2][tt]overlay=x=0:y='26*max(0,1-max(0,t-0.25)/0.5)':eval=frame:shortest=1,format=yuv420p[v]",
    ]
    esegui(['ffmpeg', '-y', '-v', 'error', *ingressi, '-filter_complex', ';'.join(filtro), '-map', '[v]',
            '-t', f'{durata:.3f}', '-r', str(FPS), '-c:v', 'libx264', '-crf', '16', uscita])
    return uscita, durata


def video(nome, fmt):
    g = geometria(fmt)
    tmp = tempfile.mkdtemp(prefix='gestable-video-')
    try:
        fondo_png = os.path.join(tmp, 'fondo.png')
        fondo(fmt['L'], fmt['A']).save(fondo_png)
        cor, pos, mas = cornice(g)
        cor_png, mas_png = os.path.join(tmp, 'cornice.png'), os.path.join(tmp, 'maschera.png')
        cor.save(cor_png)
        mas.save(mas_png)
        risorse = {'fondo': fondo_png, 'cornice': cor_png, 'maschera': mas_png, 'pos_cornice': pos}
        pezzi = [scena_video(fmt, g, s, i, tmp, risorse) for i, s in enumerate(SCENE)]
        # Dissolvenze incrociate tra le scene.
        ingressi, filtro = [], []
        for p, _ in pezzi:
            ingressi += ['-i', p]
        prima, tempo = '[0:v]', pezzi[0][1]
        for k in range(1, len(pezzi)):
            off = tempo - DISSOLVENZA
            out = f'[x{k}]' if k < len(pezzi) - 1 else '[v]'
            filtro.append(f'{prima}[{k}:v]xfade=transition=fade:duration={DISSOLVENZA}:offset={off:.3f}{out}')
            prima = out
            tempo = off + pezzi[k][1]
        uscita = os.path.join(QUI, f'gestable-{nome}-{fmt["L"]}x{fmt["A"]}.mp4')
        esegui(['ffmpeg', '-y', '-v', 'error', *ingressi, '-filter_complex', ';'.join(filtro), '-map', '[v]',
                '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', uscita])
        print(uscita, f'{tempo:.1f} s', os.path.getsize(uscita) // 1024, 'KB')
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    for nome, fmt in FORMATI.items():
        video(nome, fmt)
