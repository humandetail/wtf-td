# Ticket 04 generated map art

Built-in image_gen tool; no CLI/API-key workflow. Input layout is a newly authored guide. Existing roster used read-only for stylistic reference. Full generation prompt is stored below after generation.

## Ground generation prompt

Use case: sketch-to-render. Asset type: production game ground background for a 1280×800 fixed orthographic tower defense map, landscape 8:5 aspect ratio.
Input image 1 is a layout guide only. Input image 2 is a style reference ONLY for the rounded outlined toy-like 2.5D materials, NOT its characters or roster layout.
Paint image 1 into a polished jade garden meadow background, continuous matte moss and grass with quiet organic color variation. Retain the exact guide composition. The wide rounded rectangular ring is RESERVED EMPTY MOSS TERRAIN: do NOT paint a road, path, curb, ring outline, paving or track anywhere. A precise stone road is added later as a separate game sprite. The light ovals mark reserved empty grass deployment clearings: turn them into natural quiet flat grass areas, absolutely NO pedestals, pads, circles, discs or markings. No towers, units, enemies or buildings in these areas.
Decorate only the dark corner clusters and the narrow center ellipse with artist-designed eastern garden objects: rounded jade rocks with carved cloud motifs, tiny clumps of grass, low weathered bronze lantern, warm gold ties, one small cinnabar ribbon on a stone ornament, tiny mossy rocks. Center island: a small shallow jade pond with two lotus leaves and a tiny bronze garden ornament within x480..800 y350..450. Keep all center ornament low and contained within this band. Outer corners have small bamboo/stone clusters, not tall trees.
Visual style: charming premium toy game illustration, chunky sculpted forms, charcoal outlines, two to three levels cel shading, soft ambient occlusion, restrained detail, opaque matte materials, upper-left light. Muted earthy sage, jade, moss and pale warm stone with small ochre accents. Grass is readable, gently textured with tiny blades, not realistic, not noisy. Orthographic, no vanishing point, ground horizontal in screen space. Full bleed art, no floating island border, no horizon.
Critical: no road of any kind; no typography, text, numbers, UI, labels, grids, arrows, towers, monsters, weapons, preview border. Preserve quiet empty ring and all twenty quiet build clearings from the guide, retain 8:5 aspect ratio.

## Output provenance

Generation output: `/Users/laihanbin/.codex/generated_images/01a18c14-233b-75d3-b5af-fabda1057b78/exec-13b2a71e-0b3a-4bf5-be5c-1d41b7f6b790.png`

Copied byte-for-byte to `game/assets/maps/ground.png` and `game/assets/maps/source/ground-imagegen-original.png`. No programmatic recoloring, compositing, erasure or retouching was performed on the generated image.

Road and pad are newly authored SVG artwork, rasterized with sharp. Editable SVG sources are alongside this document. Production rasterization used sharp from the bundled workspace runtime; no image-generation CLI or extra runtime dependency is needed to use the delivered PNGs. They are separate runtime PNG sprites, so the generated background is not edited. The exact road geometry is independent from image generation.
