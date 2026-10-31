# Integration contract

All original assets are read-only. Application files are native ES modules. No production dependencies.

## Geometry

World is 1280 × 800. The active v2 map uses a 72-pixel road along a clockwise folded loop through four districts. The same geometry exports ROAD_PATH for the road artwork, ENTRY for the spawn marker, ZONES for district labels, and twenty irregular SLOTS. All angles are in radians, screen y points down. The original map and its geometry are preserved under the v1 archive.

## Public game session

`createGame(options = {})` from engine.js returns an object with `state`, `start()`, `restart()`, `tick(seconds)`, `build(slotId, code)`, `upgrade(slotId)`, `sell(slotId)`, `togglePause()`, `setSpeed(number)`, `continueEndless()`, `drainEvents()`.

Optional public `launchWave()` starts the next wave early when no spawn queue remains; it returns `{ok,message}` without extra gold. The current UI uses automatic scheduling. Session options for repeatable checks are startingGold (400), limit (80), waveInterval (26), spawnInterval (.65), initialDelay (18), waveCount (20), waveSize (wave=>count), enemyHealthScale, enemySpeedScale and rewardScale (each 1).

State has phase ('menu' | 'playing' | 'victory' | 'defeat'), paused, speed, gold, wave, nextWaveIn, elapsed, kills, endless, limit, towers, enemies. Build/upgrade/sell return `{ok, message}`. Ticks accept real elapsed seconds, apply chosen speed, and stop simulation when paused or not playing. Restart starts a clean playing session. continueEndless retains towers and currency.

Tower fields: id, slotId, code (T01–T12), level, spent, x, y, angle. Enemy fields: id, code (X01–X12), hp, maxHp, x, y, angle, progress (travelled distance), boss, slowUntil (simulation seconds, optional). Shot effects go through events rather than renderer internals.

Events drained by the UI: `{type, x?, y?, tx?, ty?, code?, amount?, color?, message?}`. Types include shot, hit, kill, build, upgrade, sell, wave, victory, defeat. Damage is resolved by the session. UI and audio only display outcomes.

## Catalogue

`catalog.js` exports TOWERS and ENEMIES arrays with code, name, assetId, description, color, and stats. Tower definitions contain price, damage, interval (seconds), range (world pixels), kind. `towerStats(tower)` returns level-adjusted damage/interval/range/upgradeCost/sellValue and any UI relevant stats. MAX_LEVEL is exported. All source imagery is looked up through the original manifest by code.

`towerStats` describes base level-adjusted stats; `effectiveTowerStats(tower,towers)` additionally applies live radar and overclock auras, and is shared by combat, range rendering and displayed attributes. Supply income emits an `income` event with amount, x, y and color.

## UI shell

index.html/styles.css are owned by the UI agent. main.js/render.js are owned by parent. Main imports `createAudio()` from audio.js; it returns `{unlock(), play(event), setMuted(boolean), muted}`. Main owns all bindings and DOM updates.

Required DOM IDs: game-canvas, loading-screen, loading-progress, menu-screen, start-button, help-button, help-dialog, close-help, game-screen, gold-value, wave-value, enemy-value, enemy-limit, kill-value, next-wave-value, pressure-fill, pause-button, speed-button, mute-button, menu-button, shop-list, tower-panel, tower-title, tower-description, tower-stats, upgrade-button, sell-button, selection-hint, notice, end-screen, end-title, end-description, end-stats, restart-button, endless-button, selected-slot-label. A shop item is a button `.tower-card` with `data-code`, containing asset thumbnail/name/price/role; main builds its content.

## Verification boundary

One public session boundary verifies player commands and visible outcomes via a runnable session check, plus independent read-only asset hashing. Real-browser full playthrough, audible verification and subjective map/balance acceptance are reserved for the user after implementation. Do not run a full real-browser suite now. Never mark human acceptance complete on behalf of the user.
