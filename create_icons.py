import cairosvg
from PIL import Image
import io

sizes = [16, 48, 128]

for size in sizes:
    png_data = cairosvg.svg2png(
        url='icons/icon.svg',
        output_width=size,
        output_height=size
    )
    
    with open(f'icons/icon{size}.png', 'wb') as f:
        f.write(png_data)
    
    print(f'Created icon{size}.png')

print('All icons created successfully!')
