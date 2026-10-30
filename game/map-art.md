# Map art integration

The map is three actual bitmap assets in `assets/maps/`:

- `ground.png`: built-in image_gen painted jade garden background, 1586×992. Draw at `(0,0,1280,800)`; the tiny aspect difference is insignificant and all guide positions map proportionally. Corner bamboo, jade cloud stones, bronze lanterns and the central lotus pond belong to this art. No towers, enemies or UI are baked in.
- `road.png`: transparent 1280×800 pale stone road with engraved paving seams, soft curb and a muted yellow entry threshold at `(640,170)`. Draw at `(0,0,1280,800)` after ground. It follows exactly the `geometry.js` rounded rectangle, radius 110, with an 82-pixel paved width (78-pixel stone fill plus 2-pixel pale edge each side; outer moss curb and shadow extend a few pixels). No runtime procedural road is needed.
- `pad.png`: transparent 128×96 stone/metal build pad with quiet ochre tabs. Draw at each exact `SLOTS` position, target 90×50, centered `(slot.x-45,slot.y-25)`. The sprite has intentional transparent padding and can sit below both empty slot markers and built towers. Do not bake slot numbers into this image.

Draw order: ground → road → pads → unit shadows/units/effects → selection and interaction overlays. Use normal canvas world transform; no asset-specific automatic bounding-box crop.

The twenty reserved clearings match four top-inner positions y292, four bottom-inner positions y508, four outer-top positions y76, four outer-bottom positions y724, two left x69 and two right x1211 positions. Road and pads do not overlap. Existing original asset folders remain read-only.

Generation prompts, guide and vector sources are in `assets/maps/source/`. The untouched generated source is in `assets/maps/source/ground-imagegen-original.png`. Ground was inspected visually after generation; route alignment is guaranteed by the separately drawn road layer.
