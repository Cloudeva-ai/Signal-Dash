"""Generate Signal Dash item sprites into assets/.

Run from the repo root:  python tools/make_assets.py

Everything is drawn at 4x and downsampled, which is what keeps the circular
edges clean at the 38px the game draws them at. The palette matches
src/styles.css so the sprites sit with the rest of the art:

    coin gold  #ffd84d      ink outline #081020
    cyan       #31e6c2      red         #e33b58
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets"
OUT.mkdir(exist_ok=True)

SS = 4  # supersample factor
SIZE = 128  # final sprite size

INK = (8, 16, 32, 255)
GOLD = (255, 216, 77, 255)
GOLD_DEEP = (224, 169, 27, 255)
GOLD_LIGHT = (255, 240, 170, 255)
CYAN = (49, 230, 194, 255)
CYAN_DEEP = (18, 150, 128, 255)
WHITE = (255, 247, 222, 255)


def canvas():
    return Image.new("RGBA", (SIZE * SS, SIZE * SS), (0, 0, 0, 0))


def save(img, name):
    img.resize((SIZE, SIZE), Image.LANCZOS).save(OUT / name)
    print(f"  assets/{name}")


def ring(draw, box, fill, outline=None, width=0):
    draw.ellipse(box, fill=fill, outline=outline, width=width)


def coin():
    """The decision signal pickup: a gold token with a bevel and a highlight."""
    img = canvas()
    d = ImageDraw.Draw(img)
    s = SIZE * SS
    pad = 6 * SS

    # Outline, then body, then an inner bevel ring for depth.
    ring(d, (pad, pad, s - pad, s - pad), INK)
    ring(d, (pad + 4 * SS, pad + 4 * SS, s - pad - 4 * SS, s - pad - 4 * SS), GOLD_DEEP)
    ring(d, (pad + 7 * SS, pad + 7 * SS, s - pad - 7 * SS, s - pad - 7 * SS), GOLD)

    # Flat inner face so any label drawn on top stays legible.
    ring(d, (pad + 16 * SS, pad + 16 * SS, s - pad - 16 * SS, s - pad - 16 * SS), GOLD_LIGHT)

    # Specular arc, upper left.
    d.arc(
        (pad + 12 * SS, pad + 12 * SS, s - pad - 12 * SS, s - pad - 12 * SS),
        start=185,
        end=265,
        fill=(255, 255, 255, 210),
        width=4 * SS,
    )
    save(img, "coin.png")


if __name__ == "__main__":
    print("writing sprites:")
    coin()
