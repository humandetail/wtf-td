# Reference layout forest map

The v3 map follows the supplied loop-TD reference: outer rectangle `(76,60)–(1204,740)`, inner rectangle `(300,210)–(980,590)`, vertical and horizontal central connections, and a flat central hub. `geometry.js` remains authoritative for route and placement rules.

`assets/maps/v3/ground.png` is an opaque 1586 × 992 built-in ImageGen terrain painting, displayed over the 1280 × 800 world. It preserves the roster's matte toy shading and upper-left illumination through low grass, clover, moss, tiny flowers and a cropped exterior forest boundary. The production PNG and selected raw source are byte-identical.

Every usable grass plot within build bounds `(110,100,1060,600)` remains visually flat and freely buildable. There are no fixed sockets or preset pads. Road corridors and central hub are also flat in the ground; their paving is composited separately. The ground intentionally includes no rocks, water, structures, tall interior vegetation or raised terrain that would contradict placement rules.

Generation provenance, complete prompt and input roles are recorded in `assets/maps/v3/source/prompts.md`. `layout-guide.png` is regenerated from `layout.json` by `source/build-layout-guide.py`; its gray regions reserve road width plus shoulders without painting roads into the terrain. The user reference and original roster remain unchanged. The v1 and v2 maps are preserved.

Visual QA confirmed continuous unobstructed interior ground and no accidental road paint, labels, building pads, or tall center object. Runtime geometry, road rendering and placement tests are validated separately from this terrain asset.
