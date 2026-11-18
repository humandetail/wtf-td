# 循环圈模型素材

22 座新塔与 32 种独立敌方模型使用 Codex 内置 ImageGen。运行时以设计 ID 寻址，等比切格导出 184 像素的透明 PNG，单位中心沿用环界现有角色绘制锚点。渲染器在首次遇到新 ID 时按需加载，失败时使用已登记的原素材。单张原画以镜像区分左右朝向，移动、攻击、受击和死亡反馈使用游戏渲染动作及特效。源图供后续维护，发布包只收录直属目录下的运行时 PNG。

## 原始图集与切格映射

每格一份运行资源，顺序从左到右、自上而下。尾部空格不导出。

| 源图 | ID |
| --- | --- |
| towers-a.png | T15–T25 |
| towers-b.png | T26–T36 |
| enemies-a.png | X13 X14 X15 X17 X19 X20 X21 X22 X23 X24 E02 E05 |
| enemies-b.png | E06 E08 B05 B06 B07 B08 B09 B10 B11 B12 C01 C02 |
| enemies-c.png | C03 C06 C07 C08 G01 G02 G04 |
| E10.png | E10，单张 |

## 生成提示

Five sheets used this prompt, with the rows below substituted in order.

> Create one asset atlas for an original Chinese fantasy meets industrial technology 2D desktop/mobile tower defense game, isolated sprites, orthographic three quarter downward view, detailed painterly game sprite art readable when tiny, charcoal military steel and teal or ochre accents on machines, stone/bronze and pale jade accent on monsters, soft upper-left light. Exactly 4 equal columns by 3 equal rows on an evenly spaced 4:3 canvas. Each sprite centered in its own imaginary square cell and contained inside central 68 percent of that cell, all sprites equal size with generous gutters. Place exactly one coherent sprite in each specified cell, listed left to right. Leave blank cells completely transparent. Transparent background. No labels, gridlines, scene, backgrounds, text or outside shadows. Weapon and creature facing southeast. Output sprite sheet used by game.

- Towers A. Geothermal furnace, needle flame turret, mortar mine projector, clustered needle dispenser. Tripwire pylon, rotating mortar, pressure vent, forward optics beacon. Ion saw cannon, signal interference emitter, prism laser, blank.
- Towers B. Vortex collector, fast interceptor cannon, membrane resonance radiator, drum relay. Telescope anchor, two-tone railgun, twin shockwave drum, coil charging cannon. Plasma furnace, terminal interception array, central command router, blank.
- Enemies A. Segmented ironsand worm, two-foot bell mouse, ghost umbrella, crystalline fin lizard. Urn-winged sand moth, cracked hollow clay doll, copper-string puppet, luminous cocoon worm. Armor-hoarding slime, long digging weasel, armored pack beetle, thunderbell general.
- Enemies B. Floating judgment cauldron, ash urn procession magistrate, chain jailer boss, fog ring colossus boss. Centipede dragon boss, dual mirrored armored guardian boss, giant drum commander boss, many layer shell king boss. Star-searching iron automaton boss, countdown stone obelisk boss, low single horn rhinoceros, thin standing tick.
- Enemies C. Shielded folding-arm mantis, bell helmet wraith, thunder ram, twin core stone guardian. Coin wheel beast, square twin wheel coffer, ornate glowing coin wagon, blank. Blank, blank, blank, blank.

E10 used a separate prompt.

> One isolated sprite for original Chinese fantasy science-fiction tower defense, transparent background. Heavy stone and bronze sentry creature shaped like a pressure valve, thick portcullis-like chest armor with a visible hinged valve, squat imposing silhouette, dark jade eyes, no weapon. Three-quarter overhead orthographic facing southeast. Detailed painterly sculptural game sprite, upper-left soft light, no ground, no scene, no lettering. Carefully centered inside central 72 percent of square canvas, transparent padding.
