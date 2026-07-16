import os
from PIL import Image

def convert_to_ico():
    src_path = "src/app/icon-master.png"
    dest_path = "src/app/favicon.ico"
    
    if not os.path.exists(src_path):
        print(f"Error: {src_path} does not exist!")
        return
        
    # Open and explicitly convert to RGBA format
    img = Image.open(src_path).convert('RGBA')
    
    img_16 = img.resize((16, 16), Image.Resampling.LANCZOS)
    img_32 = img.resize((32, 32), Image.Resampling.LANCZOS)
    img_48 = img.resize((48, 48), Image.Resampling.LANCZOS)
    
    # Save as ICO with RGBA frames
    img_32.save(
        dest_path,
        format="ICO",
        append_images=[img_16, img_48],
        sizes=[(16, 16), (32, 32), (48, 48)]
    )
    print(f"Successfully converted {src_path} to multi-resolution RGBA {dest_path}!")

if __name__ == "__main__":
    convert_to_ico()
