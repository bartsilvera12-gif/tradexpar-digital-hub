"""
Recorta el collage PNG de Sobre Tradexpar (grid 4 filas: 1 ancha + 3×2).
Ejecutar tras actualizar la ruta SOURCE si cambia el archivo.
"""
from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "assets" / "sobre-tradexpar-collage.png"
OUT = ROOT / "public" / "images" / "sobre-tradexpar"
QUALITY = 92
# El collage suele ser ~682px de ancho: los medios paneles (~341px) se ven borrosos en pantalla.
# Submuestreo 2× con LANCZOS mejora nitidez al mostrarlos en cards retina.
EXPORT_SCALE = 2


def upscale(img: Image.Image, scale: int) -> Image.Image:
    if scale <= 1:
        return img
    w, h = img.size
    return img.resize((w * scale, h * scale), Image.Resampling.LANCZOS)


def save_jpg(img: Image.Image, path: Path) -> None:
    upscale(img, EXPORT_SCALE).save(path, quality=QUALITY, optimize=True)


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"No se encuentra el collage: {SOURCE}")

    im = Image.open(SOURCE).convert("RGB")
    w, h = im.size
    q = h // 4
    half = w // 2

    # Filas [y0,y1)
    r1 = (0, q)
    r2 = (q, 2 * q)
    r3 = (2 * q, 3 * q)
    r4 = (3 * q, h)

    def crop(box: tuple[int, int, int, int]) -> Image.Image:
        return im.crop(box)

    OUT.mkdir(parents=True, exist_ok=True)

    # Hero: imagen propia panorámica si existe; si no, recorte del collage
    hero_src = ROOT / "src" / "assets" / "sobre-hero-distribucion.png"
    if hero_src.exists():
        shutil.copy2(hero_src, OUT / "hero-distribucion.png")
    else:
        save_jpg(crop((0, r1[0], w, r1[1])), OUT / "hero-distribucion.jpg")

    # Fila 2: der selección; izq en collage = gestión (modelo-operativo puede ser imagen propia)
    modelo_src = ROOT / "src" / "assets" / "sobre-modelo-operativo.png"
    if modelo_src.exists():
        shutil.copy2(modelo_src, OUT / "modelo-operativo.png")
    else:
        upscale(crop((0, r2[0], half, r2[1])), EXPORT_SCALE).save(OUT / "modelo-operativo.png", optimize=True)
    save_jpg(crop((half, r2[0], w, r2[1])), OUT / "paso-1-seleccion.jpg")

    # Fila 3: izq distribución / camión
    save_jpg(crop((0, r3[0], half, r3[1])), OUT / "paso-3-distribucion.jpg")

    # conexion-mercado: PNG dedicado (mapa / red / logística global)
    conexion_src = ROOT / "src" / "assets" / "sobre-conexion-mercado.png"
    if conexion_src.exists():
        shutil.copy2(conexion_src, OUT / "conexion-mercado.png")
    else:
        save_jpg(crop((half, r3[0], w, r3[1])), OUT / "conexion-mercado.jpg")

    # Fila 4: izq tablet WMS, der cinta / automatización
    save_jpg(crop((0, r4[0], half, r4[1])), OUT / "distribuidora-digital.jpg")
    save_jpg(crop((half, r4[0], w, r4[1])), OUT / "procesos-agiles.jpg")

    # Paso 2 gestión: reutilizamos fila 2 izq (misma escena tablet + dashboard)
    save_jpg(crop((0, r2[0], half, r2[1])), OUT / "paso-2-gestion.jpg")

    # Quote: franja suave dentro del hero (parte inferior del panel superior)
    hero = crop((0, r1[0], w, r1[1]))
    qh = max(hero.height // 3, 120)
    y0 = hero.height - qh
    quote_strip = hero.crop((0, y0, hero.width, hero.height))
    save_jpg(quote_strip, OUT / "quote-bg.jpg")

    print("OK ->", OUT)


if __name__ == "__main__":
    main()
