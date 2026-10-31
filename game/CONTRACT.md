# Integration contract

All original assets are read-only. Application files are native ES modules. No production dependencies.

## Geometry

World is 1280 × 800. The active v3 map follows the supplied reference: outer ring, inner ring, central cross and four connecting spokes. Roads are 48 pixels wide, with planted shoulders. ROAD_PATH and ROAD_SEGMENTS describe the same artwork and collision network. ROAD_NODES splits those roads at all intersections and endpoints. Each enemy starts eastward from ENTRY, then chooses uniformly among onward exits on arrival at a junction, excluding the road just travelled. Corners turn automatically. There is no fixed patrol or terminal node; surviving enemies remain on the network. All angles are radians, screen y points down. v1/v2 art and layout snapshots remain preserved.

FOOTPRINT is 90×50 with 8 pixels between buildings. BUILD_BOUNDS contains full footprints; BUILD_CENTER_BOUNDS and BUILD_EXCLUSIONS describe allowed anchor positions after expanding roads and the hub by footprint plus clearance. placementStatus(x,y,towers) is the single geometric check. Positions are continuous and unsnapped; there are no SLOTS or preset construction points.

## Public game session

`createGame(options = {})` from engine.js returns an object with `state`, `start()`, `restart()`, `tick(seconds)`, `canBuild(x,y,code)`, `build(x,y,code)`, `upgrade(towerId)`, `sell(towerId)`, `togglePause()`, `setSpeed(number)`, `continueEndless()`, `drainEvents()`.

Optional public `launchWave()` starts the next wave early when no spawn queue remains; it returns `{ok,message}` without extra gold. The current UI uses automatic scheduling. Session options for repeatable checks are startingGold (400), limit (80), waveInterval (26), spawnInterval (.65), initialDelay (18), waveCount (20), waveSize (wave=>count), enemyHealthScale, enemySpeedScale and rewardScale (each 1), and random (Math.random; must return a value in [0,1)).

State has phase ('menu' | 'playing' | 'victory' | 'defeat'), paused, speed, gold, wave, nextWaveIn, elapsed, kills, endless, limit, towers, enemies. Preview and mutation share canBuild checks for geometry, funds, phase and catalogue. Successful build returns `{ok,message,towerId}`; failures and upgrade/sell return `{ok,message}`. Failure never charges or allocates an ID. Ticks apply chosen speed and stop when paused or not playing. Restart resets the session and independent tower/enemy ID counters; continueEndless retains towers and currency.

Tower fields: id, code (T01–T12), level, spent, x, y, angle. IDs identify buildings independently from location; selling and rebuilding at the same coordinates creates a new ID. Enemy fields: id, code (X01–X12), hp, maxHp, x, y, angle, progress (total travelled distance, retained for target priority), roadFrom/roadTo (current graph edge), boss, slowUntil (simulation seconds, optional). Movement consumes the full distance across as many junctions as necessary, preserving position continuity and updating facing on turns. Shot effects go through events rather than renderer internals.

Events drained by the UI: `{type, x?, y?, tx?, ty?, code?, amount?, color?, message?}`. Types include shot, hit, kill, build, upgrade, sell, wave, victory, defeat. Damage is resolved by the session. UI and audio only display outcomes.

## Catalogue

`catalog.js` exports TOWERS and ENEMIES arrays with code, name, assetId, description, color, and stats. Tower definitions contain price, damage, interval (seconds), range (world pixels), kind. `towerStats(tower)` returns level-adjusted damage/interval/range/upgradeCost/sellValue and any UI relevant stats. MAX_LEVEL is exported. All source imagery is looked up through the original manifest by code.

`towerStats` describes base level-adjusted stats; `effectiveTowerStats(tower,towers)` additionally applies live radar and overclock auras, and is shared by combat, range rendering and displayed attributes. Supply income emits an `income` event with amount, x, y and color.

## UI shell

index.html/styles.css are owned by the UI agent. main.js/render.js are owned by parent. Main imports `createAudio()` from audio.js; it returns `{unlock(), play(event), setMuted(boolean), muted}`. Main owns all bindings and DOM updates.

Required DOM IDs: game-canvas, loading-screen, loading-progress, menu-screen, start-button, help-button, help-dialog, close-help, game-screen, gold-value, wave-value, enemy-value, enemy-limit, kill-value, next-wave-value, pressure-fill, pause-button, speed-button, mute-button, menu-button, shop-list, tower-panel, tower-title, tower-description, tower-stats, upgrade-button, sell-button, selection-hint, notice, end-screen, end-title, end-description, end-stats, restart-button, endless-button, selected-slot-label, build-status, cancel-build-button. A shop item is a button `.tower-card` with `data-code`, containing asset thumbnail/name/price/role; main builds its content. The retained label ID does not imply fixed slots.

Renderer draw(state,selectedTowerId,placement,dt,cursor?) accepts placement `{x,y,code,ok,message}` or null; an optional keyboard cursor `{x,y}` is visible while unarmed. hitTest(x,y,towers) returns a tower ID or null. Build-area masks use the same geometry and dynamic footprint clearances as the authoritative check. The UI keeps the selected type armed after a successful build, with right-click/Esc/cancel to exit.

hitTest is also exported as the public pointer-selection boundary. It prioritizes actual building footprints, then uses extended sprite hits as fallback; the same function is used by runtime interactions and adjacent-building selection regression checks.

## Verification boundary

One public session boundary verifies player commands and visible outcomes via a runnable session check, plus independent read-only asset hashing. Real-browser full playthrough, audible verification and subjective map/balance acceptance are reserved for the user after implementation. Do not run a full real-browser suite now. Never mark human acceptance complete on behalf of the user.
