# v4 地表制作记录

模式：内置 `image_gen.imagegen`，不透明、项目交付；未使用 CLI/API。

输入：v3/ground.png 为另存新版本的编辑目标；v3/source/layout-guide.png 为几何净空约束；outputs/full-roster-overview.png 仅供原单位材质、描边与光照参考。原图保持不变。

完整提示词：

```text
Use case: style-transfer.
Asset type: production opaque ground texture/background for an existing 2D tower-defense battlefield, landscape 8:5. Create a sibling visual variant; preserve the original.

INPUT ROLES: Image 1 (ground.png) is the EDIT TARGET: replace its bland uniform grass setting with a richly authored collision between science-fiction technology and Chinese xuanhuan fantasy. Preserve full-canvas framing, near-top-down game camera, low relief and unobstructed surface. Image 2 (layout-guide.png) is GEOMETRY CONSTRAINT ONLY: gray reserves road corridors and center plaza to be added later, green marks freely buildable land; NEVER paint the diagram or draw its roads. Image 3 (full-roster-overview.png) is STYLE REFERENCE ONLY: industrial yellow mechanical towers versus jade-bronze magical Chinese creatures, matte toy-like 2.5D volumes, clean outlines and warm upper-left light. Do not place its units in the picture.

PRIMARY REQUEST: a convincing techno-arcane collision ground, visibly both technological and xuanhuan rather than ordinary forest lawn with a few glowing dots. Flat ancient jade-gray flagstones, buried Chinese seal engravings, subdued moss and fine amethyst spirit-vein fissures interlock with flush gunmetal armor plates, recessed copper conduits, tiny industrial-yellow hazard enamel and cyan circuitry. The technological material intrudes into the magical stone and magical veins invade metal seams. Make an organic irregular meeting of these materials across the full clearing, not clean halves, not four isolated themed rectangles. Use chunky carefully painted game materials and appealing authored detail, low visual noise. Major flat planes have enough negative space to read the original tower/enemy sprites. Muted slate/blue-green/jade ground, restrained cyan and violet accents, sparse bronze/yellow details; not a brightly glowing cyberpunk grid.

EXACT CLEARANCE: World coordinates are 1280x800. ALL x110..1170,y100..700 must be flat, continuously buildable ground: flush metal plates, flush stone, short moss, recessed seams only. No large rocks, pillars, trees, crystal clusters, fences, machinery, props or other raised obstacles inside this region. No deep pits, water, cliffs or visual holes. Central x565..715,y345..455 stays flat without an altar, pillar or portal; a mechanical-seal arena and portal will be supplied by a separate road overlay. All future road corridors in Image 2 must likewise stay flat ground; a precision road PNG will cover them. No additional paths, roads, maze walls, rectangular building sites, circular sockets, tower pads or checkerboard.

BOUNDARY ONLY: In extremely narrow outer strips x0..40 OR x1240..1280 OR y0..18 OR y782..800, allow cropped silhouettes of weathered jade rock, violet lichen and industrial casing/copper cable to suggest a much larger world. They must not intrude into road or usable grass/ground, and no big shadows across the interior. Keep the whole map unobstructed.

No units, towers, enemies, characters, UI, text, letters, numbers, labels, watermark or logos. No diagram colors. Produce a polished, clearly techno-xuanhuan, ground-only production bitmap.
```

最终选用原图：`/Users/laihanbin/.codex/generated_images/01a18bdf-3dee-7bf1-8c1e-6ed4e1555452/exec-5962d0a5-0a8f-46f4-9ce8-a2fc8d1e42f1.png`。

生成图尺寸为 1586×992，原样复制为 `ground-imagegen-original.png` 和 `../ground.png`，SHA-256 均为 `f1c79227ad367da0fb8c06615193e78e2df9f65bf6836f680ed30b48cf554dac`。运行时按世界尺寸显示，无修图或二次重绘。金属板、石片、符纹均为平嵌地表；边界裁切岩体与晶色苔不侵入主要可建地块。未改变旧版图片。
