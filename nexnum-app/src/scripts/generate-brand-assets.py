import os
from PIL import Image, ImageDraw

def create_brand_assets():
    # Colors
    theme_color = "#C6FF00" # neon green
    bg_color = "#0B0F13"    # dark charcoal

    # Master Icon (512x512)
    # Background: theme_color (#C6FF00)
    # Logo: bg_color (#0B0F13)
    img_512 = Image.new("RGBA", (512, 512), theme_color)
    draw = ImageDraw.Draw(img_512)

    # Centered N logo coordinates
    # M140 120 h60 L312 332 V120 h60 v272 h-60 L200 180 v212 h-60 Z
    polygon_coords = [
        (140, 120), (200, 120), (312, 332), (312, 120), (372, 120),
        (372, 392), (312, 392), (200, 180), (200, 392), (140, 392)
    ]
    draw.polygon(polygon_coords, fill=bg_color)

    # Make sure output directories exist
    os.makedirs("src/app", exist_ok=True)

    # 1. apple-icon.png (180x180)
    img_512.resize((180, 180), Image.Resampling.LANCZOS).save("src/app/apple-icon.png", format="PNG")

    # 2. favicon.ico (containing 16x16, 32x32, 48x48)
    img_16 = img_512.resize((16, 16), Image.Resampling.LANCZOS)
    img_32 = img_512.resize((32, 32), Image.Resampling.LANCZOS)
    img_48 = img_512.resize((48, 48), Image.Resampling.LANCZOS)
    
    # Save as ICO
    img_32.save(
        "src/app/favicon.ico",
        format="ICO",
        append_images=[img_16, img_48],
        sizes=[(16, 16), (32, 32), (48, 48)]
    )

    print("Successfully generated all brand assets inside src/app/!")

if __name__ == "__main__":
    create_brand_assets()
