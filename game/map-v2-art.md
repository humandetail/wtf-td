# Map v2 ground art

The v2 ground is a built-in ImageGen environment with four connected districts: bamboo mountain gate, abandoned yellow technology camp, violet rune ruins, and creek valley. A raised mossy ridge anchors the center. Geometry, roads, bridge layers and tower pads are maintained separately.

- Runtime ground: `assets/maps/v2/ground.png`.
- Selected untouched source: `assets/maps/v2/source/ground-imagegen-original.png`.
- Initial untouched generation: `assets/maps/v2/source/ground-imagegen-first.png`.
- Exact prompts and provenance: `assets/maps/v2/source/prompts.md`.
- Selected native size: 1586×992; gameplay world: 1280×800.
- Generation mode: built-in `image_gen.imagegen`; one initial generation followed by one targeted clearance edit.
- Selected SHA-256: `c066791acff916036f32a06f3eddeabc5dfa5bfdb73cc1009fea1b7f475a51dc`.

The selected source and runtime ground are byte-identical to the built-in output. No pixel manipulation was applied. Original project outputs, previous map assets, geometry, roads, bridges and renderer were not modified by the art task.

Layer-composition review confirms the four district identities and removal of the major footprint obstructions. Integration moved slot 6 to (440,600) below the altar wall and slot 15 to dry grass at (1145,735). Actual stone bridgehead platforms now support slots 8 and 20 above the creek; these are authored in the separate bridge layer, not painted into or erased from the generated ground. The support pixels are checked across both footprints. Slot 13 uses the flat stone clearing beside the southern ruins.

The preserved generation-layout.json describes the image-generation constraints. layout.json and slot-adjustments.json record the final runtime layout and these integration adjustments. Creek crossings remain at (1040,495) and (1000,650). preview.png combines the same resource layers used by the game; it is not a browser screenshot or a claim of human gameplay acceptance.
