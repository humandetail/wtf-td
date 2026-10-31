# Map v2 ground generation

Mode: built-in `image_gen.imagegen`, opaque background, project-bound.

Initial generated file: `/Users/laihanbin/.codex/generated_images/01a18c3e-3997-7712-8517-dc5dfbc74f2d/exec-42bdcdaf-6055-4420-a48e-8cbfa7b756a8.png`; preserved unmodified as `ground-imagegen-first.png`.

Single targeted clearance correction prompt (input 1: first generated map; input 2: slot-reservation-guide.png):

```text
Use case: precise-object-edit. Input image 1 is the EDIT TARGET, an already excellent four-district game map. Input image 2 slot-reservation-guide.png is ONLY a precise geometric constraint guide at source1280x800, all coordinates must scale with output. Do one targeted gameplay-clearance correction to image1 while preserving its lush detailed bamboo gate NW, abandoned warm-yellow technology camp NE, central mossy raised ridge, quiet violet rune ruins SW, and winding creek valley SE. Preserve rich style, palette and entire composition outside cleared regions.
The PINK RECTANGLES in guide image2 are EXACT 20 reserved tower footprints of90x55 worldpixels. Remove any rock, terrace, building, plant, cliff, wall, water or prop that overlaps those rectangles. Fill those areas with perfectly ordinary flat continuous natural grass/dirt ground matching surrounding land. Do NOT draw pink, outlines, rectangles, obvious shape, pads, circles, bright placeholders, roads or sockets. The visual clearing should not have a geometric edge: natural ground extends beyond each rectangle.
Especially clear these world centers: (80,205) currently thick NW bamboo/rocks; (262,375) currently a tall rune stele; (85,610) currently left stone ruin; (355,745) currently southwest stone terrace; (660,620) currently central-south stone pillar/rocks; (875,735) currently large southern rock ridge. Move those interfering details a short distance outside pink regions or remove them; preserve nearby rich art. Other rectangles: (405,215),(585,232),(755,232),(1035,235),(265,565),(435,580),(875,570),(1050,580),(275,205),(440,76),(875,76),(1190,565),(1215,285),(1060,425). All20 footprints should be dry, flat and clear with some breathing room.
PALE GRAY meandering loop in guide is future road footprint: keep it flat, free of obstructive props. It is NOT to be painted gray or paved; road will be separate. Preserve exact creek position crossing future road at (1040,495) and (1000,650). No bridges are drawn now, bridge layer comes later. Keep creek away from tower footprints. No characters, towers, text, UI, labels or grid. No additional changes.
```

Inputs: `layout-guide.png` (geometry constraints), prior `../../ground.png` (style reference only), repository `outputs/full-roster-overview.png` (unit material/style reference only).

Full initial prompt:

```text
Use case: stylized-concept
Asset type: finished opaque ground-only background for a tower-defense game, landscape 1280x800 source geometry, aspect 8:5. This is a complete NEW richly designed environment, not a touch-up.
Input images: Image 1 layout-guide.png is STRICT GEOMETRIC COMPOSITION reference only. Pale gray meandering loop is a 90px corridor which must remain unobstructed FLAT GROUND; do not paint a road. Flat colored small rectangles interrupting that corridor or lying nearby are 20 empty tower reservations (90x55 each); do not paint the rectangles or pads; just keep unobstructed ordinary flat terrain there. Dark central polygon is a raised mossy ridge opportunity. Blue line is the required stream. Quadrant colors locate districts, not flat color blocks to reproduce. Image 2 ground.png is STYLE/PALETTE reference only; DO NOT copy its boring composition, circular grass dots, pond, or corner-only decoration. Image 3 full-roster-overview.png is STYLE/MATERIAL reference only; no characters, towers, labels or units from that sheet.
Primary request: make this feel like an authored game level with FOUR visually rich districts connected as one landscape, not four isolated corner stickers. Orthographic overhead toy 2.5D cel-shaded painted matte game art, clear thick dark outlines on objects, consistent upper-left warm lighting, attractive mid-green/jade terrain with warm industrial yellow.
Composition: follow guide exactly in normalized coordinates. NW (x0-640,y0-400): lush bamboo mountain gate district with bamboo clusters, weathered Chinese stone entry architecture and mossy stone steps arranged beside open corridor, carved stones, lanterns, layered small earth ledges. NE (x640-1280,y0-400): abandoned technology camp, worn industrial yellow metal debris, concrete platform remnants, cables, storage scrap, rusty pipes, broken fence sections beside usable clear terrain. SE (x640-1280,y400-800): creek valley with actual winding narrow blue-green water, stones and waterbank vegetation; stream flows from (1100,440) through (1040,495),(970,550),(970,620),(1000,650),(1000,760). Bridges will be separately overlaid exactly at (1040,495) and (1000,650), so do NOT draw bridges. At these crossings retain uninterrupted water flowing under future bridge. Keep reservations at (1050,580),(875,570),(875,735) dry and clear. SW (x0-640,y400-800): ancient rune ruin terraces, quiet faint violet rune glints on weathered stone fragments, broken steles, uneven old stone platforms, moss, low stone walls on terrain islands, clear strategic ground.
Central raised mossy rock ridge around x425-880,y310-450 with handsome layered green rock ledges and a few small ruins and stone footpaths, entirely away from pale gray corridor; show visual height with small southeast shadows without obscuring gameplay.
Distribute hand-authored detail throughout terrain islands and along outer boundary: organic bushes, tufts, scattered pebbles, irregular cracked stones, fern leaves, district-specific small debris, modest shadows. Keep middle and bottom regions as designed and textured as upper region. Retain legibility and sufficient uncluttered playable space. Vegetation should form organic clusters, never regular polka dots or repeated circular pads. Blend district ground transitions organically; no quadrant seams.
STRICT constraints: preserve exact route corridor alignment from guide; corridor should be natural fairly plain grass/soil that a separate road.png covers. Do NOT render palegray guide or any actual road, track, lane, geometric maze, paving loop, path border, tower sockets, circles or placeholders. Keep 20 slot footprints free of trees, rock, walls, water and objects. Ground only, full bleed, no border. No humans, no creatures, no towers, no UI, no text, no numbers, no labels, no grid. Do not add huge architectural objects. Rich environment detail and material variety, not just grass with corner props.
```

## Selected clearance edit result

Generated with built-in `image_gen.imagegen` on 2026-10-31 using the exact single targeted clearance correction prompt above and these ordered local reference images:

1. `ground-imagegen-first.png` — edit target.
2. `slot-reservation-guide.png` — geometry constraints only.

Built-in output: `/Users/laihanbin/.codex/generated_images/01a18fe8-710a-77c2-a1a9-9f8b42bcdf9b/exec-c2954ff8-9276-40f9-8586-ce190d07e063.png`.

Selected output is copied byte-for-byte to `../ground.png` and `ground-imagegen-original.png`. No resizing, recoloring, compositing, procedural painting, or manual pixel edits. Native dimensions: 1586×992, same as first source; geometry uses 1280×800 world coordinates. The initial source remains preserved unchanged as `ground-imagegen-first.png`.

Visual inspection: four districts, central ridge, and winding creek retained; no road, tower pad, label, UI, or bridge was baked into ground. Major obstructive stele, northwest bamboo, central-south pillar and southwest terrace were cleared. The generative correction is approximate: decorative edges around the southwest altar (slots 5/6), southern ruin boundary (slot 13), and southeast rock ridge (slot 15) require integration review against the exact footprints. This record does not claim pixel-perfect clearance.

## Final resource integration, 2026-10-31

The image itself remains unchanged. After reviewing the composed map, slot 6 was moved to (440,600) and slot 15 to (1145,735). Separate stone bridgehead platforms were added beneath slots 8 and 20 in bridges.svg/bridges.png, providing physical foundations above the creek. Slot 13 occupies the flat stone clearing beside the ruins. The original geometric generation input is preserved as generation-layout.json; final layout and adjustments are recorded separately. No pixels of the generated ground were retouched during these steps.
