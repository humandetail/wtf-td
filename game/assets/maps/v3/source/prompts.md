# Map v3 ground generation

Mode: built-in `image_gen.imagegen`, opaque background, project-bound. No CLI/API generation used.

Selected raw output: `/Users/laihanbin/.codex/generated_images/01a1900a-4210-7af2-900f-01207bdb3e77/exec-d5143cf0-81e6-43b2-bd71-4fa1184f843f.png`.

The 1586 × 992 output is copied byte-for-byte to `ground-imagegen-original.png` and `../ground.png`. Runtime scales it to the 1280 × 800 world. No correction pass or subsequent image editing was needed. SHA-256 verification was performed on both project copies.

Visual clearance inspection: the full build bounds and all road/hub corridors contain flat grass, tiny flowers, clover and moss only. Cropped canopy vegetation remains at the exterior boundary; no rocks, water, buildings, raised ridges, hedge maze walls, pads or road paint appear in the ground.

Inputs, in order:

1. `layout-guide.png`: geometry constraint guide regenerated from `layout.json`; gray marks 48 px road plus 8 px shoulders per side, green is continuous buildable ground, and the darkest narrow border permits forest detail. The guide is not a road asset.
2. `reference-layout.png`: unchanged user reference for two rectangular loops, cross connections, and dark forest atmosphere.
3. `../../../../../outputs/full-roster-overview.png`: existing unit roster for matte toy 2.5D shading, outlines, and warm upper-left lighting only.

The production road layer supplies all route and hub paving. The ground contains no route paint or build pads.

## Full generation prompt

```text
Use case: stylized-concept.
Asset type: finished opaque ground-only background for tower-defense game, full world landscape 1280x800, aspect 8:5. Generate a NEW painted terrain asset.

INPUT ROLES: Image 1 layout-guide.png is EXACT GEOMETRY CONSTRAINT ONLY. Light green is buildable lawn, pale gray is reserved future road and center hub; dark thin outermost border is only place for tall forest decor. Do NOT render its flat diagram colors or its roads. Image 2 reference-layout.png is layout feel only: dark green forest loop maze, two nested rectangular loops and cross. Do NOT copy its hedges into usable plots. Image 3 full-roster-overview.png is STYLE ONLY: charming toy 2.5D matte cel shading, carefully outlined shapes, warm upper-left light.

Paint authored, richly textured low grassy forest floor across almost the entire canvas, a seamless natural lawn under the future separately composited roads. Medium dark emerald/olive green, appealing painterly short grass with fine blade clumps, mottled flat moss, sparse tiny wildflowers and clover. Rich little organic details, not bare uniform green, yet no tall or obstructive objects anywhere in the interior. A quiet natural consistent forest clearing, NOT four themed districts. Avoid large shadow blobs or terrain elevation changes. Camera near top-down matching a 2D game world with toy 2.5D material shading.

STRICT CLEARANCE: Every pixel within x110..1170, y100..700 must be ordinary flat traversable/buildable grassy ground. No rocks, stones, stumps, trees, hedges, bushes, water, walls, ridges, ruins, structures, objects, fences or decorations higher than short grass. The gray guide regions also remain flat grass; later road layer will cover them. No painted roads, trails, paving, road outlines, colored bands, or diagram lines anywhere. No visible circular/rectangular building clearings, grids, pads or sockets. Whole plots are freely buildable, not predetermined spots. Center x565..715 y345..455 is flat grass, no obelisk or structure; road layer will provide central paving.

Boundary decoration: tiny cropped dense dark stylized forest canopies/fern foliage permitted ONLY in extreme outermost strips x0..40 OR x1240..1280 OR y0..18 OR y782..800, to create forest boundary mood. Do not invade beyond these strips or cast long shadows into the playable interior. Those strips are very narrow; prioritize clearance over large props. Grass texture should continue right across future road corridors without indicating their geometry. The composition guide describes where roads WILL be added by code, not roads to draw now.

No towers, enemies, figures, props, text, UI, labels, letters, logos, watermark, colored markers, huge patterns or preset building spots. Output full canvas at 8:5 aspect, finished production game background.
```

