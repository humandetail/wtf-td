"""Regenerate the image-generation constraint guide: uv run --with pillow python <file>."""
import json
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).parent
layout = json.loads((root / 'layout.json').read_text())
canvas = Image.new('RGB', (1280, 800), '#17482d')
draw = ImageDraw.Draw(canvas)
bounds = layout['BUILD_BOUNDS']
draw.rectangle((bounds['x'], bounds['y'], bounds['x'] + bounds['width'], bounds['y'] + bounds['height']), fill='#638e4c')
for road in layout['ROAD_SEGMENTS']:
    draw.line((road['x1'], road['y1'], road['x2'], road['y2']), fill='#b3bdbe', width=layout['ROAD_WIDTH'] + 16)
plaza = layout['PLAZA']
draw.rectangle((plaza['x'], plaza['y'], plaza['x'] + plaza['width'], plaza['y'] + plaza['height']), fill='#b3bdbe')
for rectangle in [(0, 0, 45, 800), (1235, 0, 1280, 800), (0, 0, 1280, 22), (0, 778, 1280, 800)]:
    draw.rectangle(rectangle, fill='#092b21')
canvas.save(root / 'layout-guide.png')
