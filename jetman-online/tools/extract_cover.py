#!/usr/bin/env python3
# Wycina jetmana i napis JETMAN online z okładki ../covers/jetman.jpg
# → assets/jetman.png + assets/logo.png (z alfą, osadzane w buildzie).
# Wymaga PIL (pip install pillow). Uruchamiać z katalogu jetman-online/:
#   python3 tools/extract_cover.py
#
# Metoda: postać — poligon sylwetki + klucz na ciepłe piksele ognia,
# potem największa spójna składowa i inpainting zamkniętych dziur
# (BFS z kolorem najbliższego zachowanego piksela). Napis — flood tła
# (ogień/ciemne niebo/szary dym) od krawędzi + filtr składowych.
from PIL import Image, ImageDraw
from collections import deque

im = Image.open('../covers/jetman.jpg').convert('RGB')


def nb(i, W, H):
    x = i % W
    if x: yield i - 1
    if x < W - 1: yield i + 1
    if i >= W: yield i - W
    if i < W * (H - 1): yield i + W


def outside_mask(keep, W, H):
    """Flood od krawędzi przez nie-kept piksele → maska 'na zewnątrz'."""
    N = W * H
    out = bytearray(N); q = deque()
    for x in range(W):
        for y in (0, H - 1):
            i = y * W + x
            if not keep[i] and not out[i]: out[i] = 1; q.append(i)
    for y in range(H):
        for x in (0, W - 1):
            i = y * W + x
            if not keep[i] and not out[i]: out[i] = 1; q.append(i)
    while q:
        i = q.popleft()
        for j in nb(i, W, H):
            if not keep[j] and not out[j]:
                out[j] = 1; q.append(j)
    return out


def inpaint_holes(final, px, W, H):
    """Wypełnia zamknięte dziury kolorem najbliższego zachowanego piksela."""
    out = outside_mask(final, W, H)
    col = [None] * (W * H)
    q = deque()
    for i in range(W * H):
        if not final[i] and not out[i]:
            for j in nb(i, W, H):
                if final[j]:
                    final[i] = 1
                    col[i] = px[j % W, j // W]
                    q.append(i)
                    break
    while q:
        i = q.popleft()
        for j in nb(i, W, H):
            if not final[j] and not out[j]:
                final[j] = 1
                col[j] = col[i]
                q.append(j)
    return col


def components(mask, W, H):
    cid = [-1] * (W * H); sizes = []; bb = []
    for s in range(W * H):
        if not mask[s] or cid[s] >= 0:
            continue
        k = len(sizes); sizes.append(0); bb.append([W, 0, H, 0]); cid[s] = k
        q = deque([s])
        while q:
            i = q.popleft(); sizes[k] += 1
            x = i % W; y = i // W; b = bb[k]
            if x < b[0]: b[0] = x
            if x > b[1]: b[1] = x
            if y < b[2]: b[2] = y
            if y > b[3]: b[3] = y
            for j in nb(i, W, H):
                if cid[j] < 0 and mask[j]:
                    cid[j] = k; q.append(j)
    return cid, sizes, bb


def save(final, W, H, px, out, col=None):
    xs = [i % W for i in range(W * H) if final[i]]
    ys = [i // W for i in range(W * H) if final[i]]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    outim = Image.new('RGBA', (x1 - x0 + 1, y1 - y0 + 1))
    po = outim.load()
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            i = y * W + x
            if not final[i]:
                continue
            rgb = col[i] if col and col[i] else px[x, y]
            a = 255
            for j in nb(i, W, H):
                if not final[j]:
                    a = 195; break
            else:
                if x == 0 or x == W - 1 or y == 0 or y == H - 1:
                    a = 195
            po[x - x0, y - y0] = (*rgb, a)
    outim.save(out)
    print(out, outim.size)


# ---------- PILOT: poligon sylwetki + wycięcie ognia w środku ----------
BOX_P = (130, 0, 748, 452)
cr = im.crop(BOX_P); W, H = cr.size; px = cr.load()
POLY = [
    (30, 0), (375, 0),
    (366, 50), (378, 95), (360, 142), (333, 184),
    (330, 160), (296, 156), (288, 164),
    (330, 148), (392, 146), (418, 156),
    (456, 178), (466, 235), (462, 292),
    (482, 314), (545, 332), (585, 366), (590, 410),
    (562, 448), (505, 451),
    (115, 451),
    (122, 400), (132, 338), (148, 298), (172, 276),
    (140, 242), (98, 216), (66, 202),
    (56, 152), (68, 116), (45, 60),
]
mask = Image.new('L', (W, H), 0)
ImageDraw.Draw(mask).polygon(POLY, fill=1)
mp = mask.load()
final = bytearray(W * H)
for y in range(H):
    for x in range(W):
        if not mp[x, y]:
            continue
        r, g, b = px[x, y]
        if r - b > 30 and r > 90:      # ogień wewnątrz sylwetki
            continue
        final[y * W + x] = 1
cid, sizes, _ = components(final, W, H)
if sizes:
    big = sizes.index(max(sizes))
    for i in range(W * H):
        if final[i] and cid[i] != big:
            final[i] = 0
col = inpaint_holes(final, px, W, H)
save(final, W, H, px, 'assets/jetman.png', col)

# ---------- LOGO: flood tła (dym neutralny, litery niebieskawe) ----------
BOX_L = (25, 440, 880, 690)
cr = im.crop(BOX_L); W, H = cr.size; px = cr.load()
N = W * H
bglike = bytearray(N); warm = bytearray(N)
for y in range(H):
    for x in range(W):
        r, g, b = px[x, y]
        i = y * W + x
        mx, mn = max(r, g, b), min(r, g, b)
        lum = (r * 3 + g * 4 + b) >> 3
        sat = 0 if mx == 0 else (mx - mn) / mx
        w = r - b > 28 and r > 85
        warm[i] = 1 if w else 0
        if w or lum < 72 or (sat < 0.2 and lum < 195 and b < r + 5):
            bglike[i] = 1
# flood tła od krawędzi po pikselach bglike
bg = bytearray(N); q = deque()
for x in range(W):
    for y in (0, H - 1):
        i = y * W + x
        if bglike[i] and not bg[i]: bg[i] = 1; q.append(i)
for y in range(H):
    for x in (0, W - 1):
        i = y * W + x
        if bglike[i] and not bg[i]: bg[i] = 1; q.append(i)
while q:
    i = q.popleft()
    for j in nb(i, W, H):
        if not bg[j] and bglike[j]:
            bg[j] = 1; q.append(j)
keep = bytearray(N)
for i in range(N):
    if not bg[i] and not warm[i]:
        keep[i] = 1
# zamknięte kieszenie (np. kontry liter) zostają — niewidoczne na ciemnym tle
cid, sizes, bb = components(keep, W, H)
okc = set()
for k, s in enumerate(sizes):
    x0, x1, y0, y1 = bb[k]
    if s >= 800:
        okc.add(k)
    # strefa wiersza "online" — kropka i litery pochwycone osobno
    elif s >= 180 and 265 <= x0 and x1 <= 590 and 135 <= y0 <= 240:
        okc.add(k)
fin = bytearray(N)
for i in range(N):
    if keep[i] and cid[i] in okc:
        fin[i] = 1
save(fin, W, H, px, 'assets/logo.png')
