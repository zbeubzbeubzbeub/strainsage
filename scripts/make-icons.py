"""Icônes PWA de StrainSage : la pousse du logo (assets/illustrations/pousse.svg) en or sur le fond sombre.
Usage : python scripts/make-icons.py  (Pillow requis) → écrit icons/*.png"""
from PIL import Image, ImageDraw
import os

BG, GOLD = (0x17, 0x16, 0x14), (0xD4, 0xAF, 0x37)  # --bg (thème sombre) et or de la marque

def cubic(p0, p1, p2, p3, n=24):
    return [tuple((1-t)**3*a + 3*(1-t)**2*t*b + 3*(1-t)*t**2*c + t**3*d for a, b, c, d in zip(p0, p1, p2, p3))
            for t in (i / n for i in range(n + 1))]

# mêmes tracés que pousse.svg (viewBox 0 0 24 24)
STEM = cubic((11.15, 22.4), (11.3, 18.6), (11.45, 15), (11.7, 12.2)) + cubic((12.6, 12.2), (12.8, 15), (12.9, 18.6), (12.95, 22.4))
LEFT = cubic((12.05, 12.6), (10.9, 9.2), (7.6, 7.1), (2.6, 7.7)) + cubic((2.6, 7.7), (3.5, 11.6), (7.2, 13.8), (12.05, 12.6))
RIGHT = cubic((12.25, 12.6), (13.35, 9.0), (16.75, 6.7), (21.4, 7.2)) + cubic((21.4, 7.2), (20.6, 11.2), (17.1, 13.7), (12.25, 12.6))
BOX = (2.6, 6.7, 21.4, 22.4)  # emprise du dessin

def icon(size, ratio):
    """ratio : part de la largeur occupée par la pousse (≤ 0.8 × 0.8 pour rester dans la zone sûre maskable)."""
    s = size * 4  # suréchantillonnage pour l'anticrénelage
    img = Image.new('RGB', (s, s), BG)
    d = ImageDraw.Draw(img)
    w, h = BOX[2] - BOX[0], BOX[3] - BOX[1]
    k = s * ratio / w
    ox, oy = (s - w * k) / 2 - BOX[0] * k, (s - h * k) / 2 - BOX[1] * k
    for shape in (STEM, LEFT, RIGHT):
        d.polygon([(ox + x * k, oy + y * k) for x, y in shape], fill=GOLD)
    return img.resize((size, size), Image.LANCZOS)

out = os.path.join(os.path.dirname(__file__), '..', 'icons')
os.makedirs(out, exist_ok=True)
icon(192, .62).save(os.path.join(out, 'icon-192.png'))
icon(512, .62).save(os.path.join(out, 'icon-512.png'))
icon(512, .5).save(os.path.join(out, 'icon-512-maskable.png'))  # 50 % de large : bien dans le cercle sûr de 80 %
icon(180, .62).save(os.path.join(out, 'apple-touch-icon.png'))
print('icônes écrites dans', os.path.abspath(out))
