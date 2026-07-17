"""Gera os previews sociais, o ícone Apple e a foto WebP do site."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SERIF = "/System/Library/Fonts/Supplemental/Georgia.ttf"
SERIF_BOLD = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"
SANS = "/System/Library/Fonts/Supplemental/Arial.ttf"
SANS_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size=size)


def rounded_photo(photo: Image.Image, size: tuple[int, int], radius: int) -> Image.Image:
    fitted = ImageOps.fit(photo.convert("RGB"), size, Image.Resampling.LANCZOS, centering=(0.5, 0.42))
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    result = Image.new("RGBA", size, (0, 0, 0, 0))
    result.paste(fitted, (0, 0), mask)
    return result


def generate_site_preview(photo: Image.Image) -> None:
    canvas = Image.new("RGB", (1200, 630), "#F8F3ED")
    draw = ImageDraw.Draw(canvas)

    draw.line((0, 0, 1200, 0), fill="#D9CCBB", width=2)
    draw.rounded_rectangle((744, 54, 1138, 576), radius=10, fill="#DED6CC")
    portrait = rounded_photo(photo, (394, 522), 10)
    canvas.paste(portrait, (744, 54), portrait)
    draw.line((72, 78, 152, 78), fill="#B99045", width=6)

    draw.text((72, 122), "Mateus Ribeiro", font=font(SERIF, 61), fill="#242423")
    draw.text((72, 192), "Marcos", font=font(SERIF, 61), fill="#242423")
    draw.text((76, 294), "PSICÓLOGO CLÍNICO", font=font(SANS_BOLD, 25), fill="#242423")
    draw.text(
        (76, 341),
        "Terapia Cognitivo-Comportamental",
        font=font(SANS, 26),
        fill="#393833",
    )
    draw.rounded_rectangle((74, 408, 282, 462), radius=7, fill="#242423")
    draw.text((104, 422), "CRP 08/38930", font=font(SANS_BOLD, 20), fill="#F8F3ED")
    draw.text((76, 520), "Curitiba · Atendimento on-line", font=font(SANS, 21), fill="#5F5A51")
    draw.text((1080, 590), "MRM", font=font(SERIF_BOLD, 17), fill="#B99045")
    canvas.save(ROOT / "social-preview-site.png", optimize=True)


def generate_guide_preview() -> None:
    canvas = Image.new("RGB", (1200, 630), "#242423")
    draw = ImageDraw.Draw(canvas)
    draw.line((76, 80, 176, 80), fill="#C9A35B", width=8)
    draw.text((76, 132), "Guia Prático", font=font(SERIF, 64), fill="#FFFDF9")
    draw.text((76, 205), "para Reconhecer", font=font(SERIF, 64), fill="#FFFDF9")
    draw.text((76, 278), "Emoções", font=font(SERIF, 64), fill="#E8D3AC")
    draw.text(
        (80, 392),
        "Material de apoio para psicoterapia",
        font=font(SANS, 27),
        fill="#F0E9DE",
    )
    draw.text(
        (80, 530),
        "Mateus Ribeiro Marcos · CRP 08/38930",
        font=font(SANS_BOLD, 21),
        fill="#D7D0C6",
    )

    colors = ["#A66862", "#8399A8", "#B4883E", "#887492", "#657E72"]
    heights = [245, 330, 195, 285, 225]
    for index, (color, height) in enumerate(zip(colors, heights)):
        x = 828 + index * 60
        y = 315 - height // 2
        draw.rounded_rectangle((x, y, x + 34, y + height), radius=17, fill=color)
    draw.ellipse((760, 86, 1120, 446), outline="#5C503A", width=2)
    draw.ellipse((824, 150, 1056, 382), outline="#76623D", width=2)
    canvas.save(ROOT / "social-preview-guia.png", optimize=True)


def generate_apple_icon() -> None:
    logo = Image.open(ROOT / "logo-mateus-transparent.png").convert("RGBA")
    logo = logo.resize((180, 180), Image.Resampling.LANCZOS)
    icon = Image.new("RGBA", (180, 180), "#000000")
    icon.alpha_composite(logo)
    icon.convert("RGB").save(ROOT / "favicon" / "apple-touch-icon.png", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("photo", type=Path, help="Caminho da fotografia profissional original")
    args = parser.parse_args()

    photo = Image.open(args.photo).convert("RGB")
    website_photo = ImageOps.fit(photo, (1600, 1600), Image.Resampling.LANCZOS)
    website_photo = website_photo.filter(
        ImageFilter.UnsharpMask(radius=1.1, percent=65, threshold=3),
    )
    website_photo.save(ROOT / "mateus-ribeiro-marcos-1600.webp", "WEBP", quality=96, method=6)

    generate_site_preview(photo)
    generate_guide_preview()
    generate_apple_icon()


if __name__ == "__main__":
    main()
