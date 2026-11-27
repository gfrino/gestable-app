#!/usr/bin/env python3
"""
Musica del video promozionale di GestABLE, composta e sintetizzata qui (nessun
campione, nessuna traccia di terzi: nessuna licenza da gestire).

Pop elettronico luminoso, 114 BPM, Do maggiore, 16 battute = durata del video:
- battute 1-2  intro (apertura): pad e arpeggio, sale un fruscio;
- battute 3-14 tutto il gruppo: cassa, clap, charleston, basso, arpeggio, pad;
- battuta 15   accordo finale sul logo (inizio della chiusura);
- battuta 16   coda e dissolvenza.

Solo libreria standard di Python. Uso:
  python3 store/video/genera-musica.py   (scrive store/video/musica-gestable.m4a)
"""

import math
import os
import random
import subprocess
import tempfile
import wave
from array import array

QUI = os.path.dirname(os.path.abspath(__file__))
USCITA = os.path.join(QUI, 'musica-gestable.m4a')

SR = 44100
BPM = 114
BATTITO = 60 / BPM
BATTUTA = 4 * BATTITO
DURATA = 33.667            # come il video (genera-video.py)
N = int(DURATA * SR)

rnd = random.Random(7)     # stesso risultato a ogni generazione
L = array('d', bytes(8 * N))
R = array('d', bytes(8 * N))
DUCK = array('d', [1.0]) * N   # «pompa» del pad e del basso sotto la cassa


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tavola(armoniche, pendenza, dim=4096):
    """Onda a dente di sega senza aliasing, morbida (armoniche attenuate)."""
    t = [sum(math.sin(2 * math.pi * k * i / dim) / k ** pendenza for k in range(1, armoniche + 1)) for i in range(dim)]
    m = max(abs(v) for v in t)
    return [v / m for v in t]


SEGA = tavola(10, 1.6)
DIM = len(SEGA)

# Accordi (MIDI): pad, basso. Una battuta ciascuno, la 14 divisa a metà.
C = ([60, 64, 67, 74], 36)
G = ([59, 62, 67, 74], 43)
AM = ([60, 64, 69, 76], 45)
F = ([60, 65, 69, 76], 41)
GIRO = [C, G, AM, F]
BATTUTE = GIRO * 3 + [AM, (F, G), C, C]


def accordi():
    """(inizio, durata, accordo) per tutta la traccia."""
    for b, acc in enumerate(BATTUTE):
        t = b * BATTUTA
        if isinstance(acc[0], tuple):
            yield t, BATTUTA / 2, acc[0]
            yield t + BATTUTA / 2, BATTUTA / 2, acc[1]
        else:
            yield t, BATTUTA, acc


def aggiungi(buf, i0, campioni, vol):
    for k, v in enumerate(campioni):
        j = i0 + k
        if j >= N:
            break
        buf[j] += v * vol


def stereo(i0, campioni, vol, pan=0.0):
    """pan da -1 (sinistra) a 1 (destra), potenza costante."""
    a = (pan + 1) * math.pi / 4
    aggiungi(L, i0, campioni, vol * math.cos(a))
    aggiungi(R, i0, campioni, vol * math.sin(a))


# --- pad: due voci leggermente stonate, una per canale ---------------------
def pad(t0, dur, note, vol):
    i0, n = int(t0 * SR), int(dur * SR)
    att, rel = int(0.35 * SR), int(0.45 * SR)
    for canale, stona in ((L, 0.9965), (R, 1.0035)):
        for m in note:
            passo = hz(m) * stona * DIM / SR
            fase = rnd.random() * DIM
            for k in range(n + rel):
                j = i0 + k
                if j >= N:
                    break
                if k < att:
                    e = k / att
                elif k < n:
                    e = 1.0
                else:
                    e = 1 - (k - n) / rel
                canale[j] += SEGA[int(fase) % DIM] * e * vol * DUCK[j]
                fase += passo


# --- arpeggio pizzicato (Karplus-Strong) ------------------------------------
def pizzico(m, dur, chiaro=0.5):
    p = max(2, int(round(SR / hz(m))))
    buf = [rnd.uniform(-1, 1) for _ in range(p)]
    # Attacco più morbido: rumore già un po' filtrato.
    for k in range(1, p):
        buf[k] = buf[k] * chiaro + buf[k - 1] * (1 - chiaro)
    out, n = [], int(dur * SR)
    for k in range(n):
        i = k % p
        v = buf[i]
        buf[i] = 0.497 * (v + buf[(i + 1) % p])
        out.append(v * (1 - k / n) ** 1.5)
    return out


# --- basso ------------------------------------------------------------------
def basso(m, dur):
    f, n = hz(m), int(dur * SR)
    out, att = [], int(0.006 * SR)
    for k in range(n):
        t = k / SR
        e = min(1.0, k / att) * math.exp(-t * 5.5)
        x = 2 * math.pi * f * t
        out.append(e * (math.sin(x) + 0.35 * math.sin(2 * x) + 0.12 * math.sin(3 * x)))
    return out


# --- batteria ---------------------------------------------------------------
def cassa():
    out = []
    fase = 0.0
    for k in range(int(0.42 * SR)):
        t = k / SR
        f = 46 + 110 * math.exp(-t * 32)
        fase += 2 * math.pi * f / SR
        out.append(math.sin(fase) * math.exp(-t * 7.5) + (rnd.uniform(-1, 1) * 0.25 * math.exp(-t * 300)))
    return out


def rumore_filtrato(dur, decad, passa_alto, lp=None):
    """Rumore con passa-alto (e passa-basso facoltativo), inviluppo esponenziale."""
    a = math.exp(-2 * math.pi * passa_alto / SR)
    b = 1 - math.exp(-2 * math.pi * lp / SR) if lp else None
    y_lp, prec, out = 0.0, 0.0, []
    hp = 0.0
    for k in range(int(dur * SR)):
        x = rnd.uniform(-1, 1)
        hp = a * (hp + x - prec)
        prec = x
        v = hp
        if b:
            y_lp += b * (v - y_lp)
            v = y_lp
        out.append(v * math.exp(-k / SR * decad))
    return out


def clap():
    corpo = rumore_filtrato(0.28, 16, 900, 5000)
    # Tre piccoli colpi ravvicinati, come mani diverse.
    for ritardo in (0.0, 0.011, 0.022):
        d = int(ritardo * SR)
        for k in range(int(0.012 * SR)):
            if d + k < len(corpo):
                corpo[d + k] *= 1.6
    return corpo


CASSA = cassa()
CLAP = clap()
HAT = rumore_filtrato(0.05, 90, 7000)
HAT_APERTO = rumore_filtrato(0.22, 18, 6500)
PIATTO = rumore_filtrato(2.4, 1.6, 4500)


def colpo_cassa(t, vol):
    i0 = int(t * SR)
    stereo(i0, CASSA, vol)
    # Abbassa pad e basso per un attimo dopo ogni cassa.
    for k in range(int(0.30 * SR)):
        j = i0 + k
        if j < N:
            DUCK[j] = min(DUCK[j], 0.45 + 0.55 * (k / (0.30 * SR)) ** 0.7)


def fruscio_che_sale(t0, dur, vol):
    """Rumore che si apre e cresce verso l'ingresso della batteria."""
    i0, n = int(t0 * SR), int(dur * SR)
    y, out = 0.0, []
    for k in range(n):
        p = k / n
        b = 1 - math.exp(-2 * math.pi * (300 + 9000 * p * p) / SR)
        y += b * (rnd.uniform(-1, 1) - y)
        out.append(y * p ** 2)
    stereo(i0, out, vol)


def campana(m, dur, vol, pan):
    f, out = hz(m), []
    for k in range(int(dur * SR)):
        t = k / SR
        x = 2 * math.pi * f * t
        out.append(math.exp(-t * 2.2) * (math.sin(x) + 0.3 * math.sin(2.76 * x) * math.exp(-t * 6)))
    return out, vol, pan


def componi():
    b3, b15, b16 = 2 * BATTUTA, 14 * BATTUTA, 15 * BATTUTA
    # Prima la batteria: la cassa decide la «pompa» del pad e del basso.
    for beat in range(int(DURATA / BATTITO) + 1):
        t = beat * BATTITO
        if b3 <= t < b15:
            colpo_cassa(t, 0.80)
            if beat % 4 in (1, 3):
                stereo(int(t * SR), CLAP, 0.42, 0.05)
            stereo(int((t + BATTITO / 2) * SR), HAT_APERTO, 0.16, 0.35)
            for s in (0, 1, 3):  # sedicesimi, il terzo resta all'aperto
                stereo(int((t + s * BATTITO / 4) * SR), HAT, 0.10 if s else 0.14, 0.3)
        elif BATTUTA * 1.5 <= t < b3:  # charleston che entra nell'intro
            stereo(int((t + BATTITO / 2) * SR), HAT, 0.08, 0.3)
    fruscio_che_sale(BATTUTA, BATTUTA, 0.20)
    stereo(int(b3 * SR), PIATTO, 0.22)
    colpo_cassa(b15, 1.0)
    stereo(int(b15 * SR), PIATTO, 0.26)

    for t0, dur, (note, radice) in accordi():
        if t0 >= b15:
            vol = 0.065 if t0 < b16 else 0.050   # accordo finale pieno sul logo
        else:
            vol = 0.050 if t0 >= b3 else 0.060
        pad(t0, dur, note, vol)
        # Basso a ottavi (dalla battuta 3), ultima nota lunga sul finale.
        if b3 <= t0 < b15:
            for k in range(int(round(dur / (BATTITO / 2)))):
                tt = t0 + k * BATTITO / 2
                i0 = int(tt * SR)
                nota = radice + (12 if k % 4 == 3 else 0)
                c = basso(nota, BATTITO / 2 * 0.95)
                for q in range(len(c)):
                    if i0 + q < N:
                        c[q] *= DUCK[i0 + q]
                stereo(i0, c, 0.30)
        elif t0 == b15:
            stereo(int(t0 * SR), basso(radice, BATTUTA * 1.6), 0.42)
        # Arpeggio a ottavi, un'ottava sopra il pad, che si alterna tra i canali.
        if t0 < b15:
            s = sorted(note)
            giro = [s[0], s[2], s[1], s[3], s[2], s[1], s[3], s[2]]
            for k in range(int(round(dur / (BATTITO / 2)))):
                tt = t0 + k * BATTITO / 2
                m = giro[k % 8] + 12
                vol = 0.22 if t0 >= b3 else 0.26
                stereo(int(tt * SR), pizzico(m, 0.55), vol * (1.0 if k % 2 == 0 else 0.8), -0.45 if k % 2 == 0 else 0.45)

    # Campane sul logo finale: Do-Mi-Sol-Do, un po' arpeggiate.
    for k, m in enumerate([72, 76, 79, 84]):
        out, vol, pan = campana(m, 2.8, 0.16, (-0.4, -0.1, 0.15, 0.4)[k])
        stereo(int((b15 + k * BATTITO / 4) * SR), out, vol, pan)


def finisci():
    """Dissolvenze, saturazione morbida, normalizzazione; ritorna il WAV."""
    ingresso, uscita = int(0.25 * SR), int(1.6 * SR)
    picco = 0.0
    for j in range(N):
        g = 1.0
        if j < ingresso:
            g = j / ingresso
        elif j > N - uscita:
            g = ((N - j) / uscita) ** 1.5
        L[j] = math.tanh(L[j] * 1.15) * g
        R[j] = math.tanh(R[j] * 1.15) * g
        picco = max(picco, abs(L[j]), abs(R[j]))
    k = 0.89 / picco
    pcm = array('h', bytes(4 * N))
    for j in range(N):
        pcm[2 * j] = int(L[j] * k * 32767)
        pcm[2 * j + 1] = int(R[j] * k * 32767)
    wav = os.path.join(tempfile.mkdtemp(prefix='gestable-musica-'), 'musica.wav')
    with wave.open(wav, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    return wav


if __name__ == '__main__':
    componi()
    wav = finisci()
    # Volume da social/web (-16 LUFS) in due passate, guadagno fisso: così
    # restano le differenze tra intro, ritmo e finale.
    import json
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', wav, '-af',
                        'loudnorm=I=-16:TP=-2:LRA=11:print_format=json', '-f', 'null', '-'],
                       capture_output=True, text=True, check=True)
    m = json.loads(r.stderr[r.stderr.rindex('{'):r.stderr.rindex('}') + 1])
    filtro = ('loudnorm=I=-16:TP=-2:LRA=11:linear=true:'
              f'measured_I={m["input_i"]}:measured_TP={m["input_tp"]}:measured_LRA={m["input_lra"]}:'
              f'measured_thresh={m["input_thresh"]}:offset={m["target_offset"]}')
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', wav, '-af', filtro,
                    '-ar', str(SR), '-c:a', 'aac', '-b:a', '160k', USCITA], check=True)
    os.remove(wav)
    os.rmdir(os.path.dirname(wav))
    print(USCITA, os.path.getsize(USCITA) // 1024, 'KB')
