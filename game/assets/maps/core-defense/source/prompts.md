# 核心保卫战地图制作记录

2026-10-31，内置 ImageGen 生成独立非循环地图。原循环圈 v5 及 808 个原素材文件均保留。参考角色：首版布局导图为编辑目标；v5 完整场景仅作材质／光照风格参考；原单位合成仅作风格参考，不将单位烘入地图。

产出为 1586×992 RGB PNG，scene.png 与 source/scene-imagegen-original.png 字节一致。first-scene-imagegen.png 保留首次生成结果；本次没有重新生成，所选结果就是首次绘画。

生成画面相对首版导图有少量路面偏移，因此只校准新模式几何，核心最终为 (640,360)，四条最终路线见 docs/core-defense-design.md 及 defense-geometry.js。初版导图和首次错位叠线均保留为 first-*；当前 layout-guide 与 route-inspection 对应最终坐标。不要把初版提示词中的位置当作运行时位置。

build-guide.mjs 从最终几何生成导图；build-preview.mjs 将地图、原单位和与渲染器一致的轻微色调／投影合成资源预览及路线叠图。它们不操作浏览器，预览不代表浏览器截图或人工试玩验收。

## 完整生成提示词

```text
Use case: style-transfer.
Asset type: finished production map for an additional NON-LOOPING tower-defense mode, 1280x800 world, landscape 8:5.

INPUT ROLES: Image 1 is the EDIT TARGET, an exact four-lane layout guide. Replace the diagram with finished game art while preserving its road centerlines, shape, endpoints and connectivity exactly. Image 2 is STYLE/MATERIAL REFERENCE ONLY: the existing cohesive jade/bronze relic courtyard. DO NOT copy its rectangular loops or perimeter road. Image 3 is STYLE ONLY for original matte toy-like 2.5D industrial-yellow towers and jade-bronze Chinese fantasy enemies; no units in the map output.

GAMEPLAY AND COMPOSITION: Four separate one-way approaches wind inward from four outer spawn gates and terminate at ONE central defense core. The network is a tree: NO circular route, no closed ring, no outer ring, no inner ring, no connections between lanes except at the center. Large open flat plots surround the four approaches for free tower placement. This must look like a different battlefield from the loop map while clearly belonging to the same coherent jade-stone / aged-bronze world.

EXACT ROUTES in 1280x800 coordinates, 48px paving plus maximum 8px shoulders:
NORTH entry (120,60) -> (440,60) -> (440,230) -> (640,230) -> core(640,400).
EAST entry (1220,140) -> (1020,140) -> (1020,400) -> core.
SOUTH entry (1160,740) -> (840,740) -> (840,570) -> (640,570) -> core.
WEST entry (60,660) -> (260,660) -> (260,400) -> core.
Keep the precise geometry of Image 1. The route ends at each outer gate; do not extend it into a perimeter ring. Center hub is within x565..715,y345..455.

ART DIRECTION: Paint land, paving, curves and central foundation together as one place, same age, material scale and warm upper-left illumination. Broad quiet jade/olive-green stone slabs with very restrained moss along joints; warm pale mineral paving visibly lighter than the land; aged bronze inlays follow only the REAL routes. Keep wear continuous at road edges, natural junctions, no black asphalt overlays, rectangular metal panels or separate pasted control panels. Reduce small speckled detail, cracks and bright leaf noise: original colorful unit sprites are the foreground. Painterly matte toy-like 2.5D, chunky readable forms, restrained palette, cohesive with Image 2.

CENTRAL OBJECTIVE: A compact low jade energy orb or crystal held inside an aged-bronze mechanical seal, with its base fully contained inside x565..715,y345..455. It is the defendable core, not an enemy portal. Naturally embedded circular/elliptical foundation joins all four paths; subtle turquoise glow, no giant light beams. No tall tower or statue that blocks actors, and no square UI plaque.
OUTER ENTRIES: four small recessed bronze/jade gateway discs at the exact first points, part of the paving. No text or arrows.

CLEARANCE: Except the central objective, all non-road land inside x110..1170,y100..700 is flat, open and buildable. No buildings, rocks, trees, raised crystal clusters, shrubs, fences, stairs, cliffs, water, pits or preset tower pads there. No random pipelines, medallions or false paths in plots. Only extreme strips x0..35 OR x1245..1280 OR y0..15 OR y785..800 may contain cropped natural roots, jade rock and a little bronze anchoring, without intruding into routes or plots. No paved border.

No UI, HUD, labels, text, letters, numbers, logos, watermark, towers, characters, enemies, multiple views or diagram colors. One finished cohesive NON-CYCLIC battlefield, roads clearly read as four inward approaches, no closed roads.
```
