# 地图原始生成记录

生成方式：内置 ImageGen。v5 只作材质风格参考，不复用其路线，生成平坦独立场地；实际护送／迷宫路线由运行时渲染，与寻路共用几何。scene.png 与保留原图字节一致；旧地图和原素材不动。

```text
Create a single finished 8:5 landscape top-down 2D tower-defense battlefield background, at least1280x800. Style reference image is MATERIAL/PAINTERLY STYLE ONLY, NOT ITS LAYOUT: matte jade/olive stone, aged bronze, soft warm upper-left lighting, chunky coherent illustrated Chinese fantasy meets small industrial machines. NO roads, NO rings, NO center core, NO paths, NO UI, text, units, tower pads, grids, numbers, buildings, props inside playable field. In world1280x800 the entire x40..1240,y100..700 must be flat open unobstructed buildable land, continuous material. Fine low-contrast stone texture restrained, not busy cracks. Do NOT copy any loop or four-lane arrangement from reference. No raised objects in interior. Production background only; actual routes and entities will be rendered by code.
At the outermost margins y0..80 and y735..800, frame a rectangular ancient bronze/jade trial arena with cropped low walls and small dormant mechanism details. Main playablefield x40..1240,y100..700 is one broad quiet blue-green jade-slab floor, seamless matte, flat and lowcontrast; no modular boxes or tiles that look like preset tower slots, no markings inside. Give this battlefield a cooler engineered ceremonial feeling different from wilderness. No central medallion.
```
