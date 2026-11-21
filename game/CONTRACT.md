# 循环圈运行契约

## 对局

`loop-session.js` 的 `createLoopGame(options)` 创建唯一的单人战斗会话。会话持有金币、木材、卡牌、背包、塔、敌人与事件队列。生命周期命令包含 `start()`、`restart()`、`tick(seconds)`、`togglePause()`、`setSpeed(speed)`、`continueEndless()`、`continueAbyss()` 和 `drainEvents()`。

- `openStarter()` 开启免费起手 SR。第一座塔成功部署后启动备战时钟。
- `draw(tier)` 购买卡包，`canDeploy(id, x, y)` 验证位置，`deploy(id, x, y)` 成功后消费卡并返回塔 ID。
- `statsFor(tower)` 和 `forecasts()` 提供界面所需的战斗属性和未来波次。抽卡与路网移动使用两路可独立注入的随机数。
- 装备购买、合成、装配、卸下和施放由 `loop-armory.js` 验证与结算。2D、3D 和触控共用这些命令。
- 常规 55 波。场上积怪达到 60 即失败，金币怪单独计数。无尽继承塔、卡牌、装备、人口及金币。深渊通过 `selectAbyssTower(towerId)` 选本关出战塔。 [单人规则](README.md#循环圈对局规则)

## 界面

Required DOM IDs: loop-controls, loop-skill-status, loop-forecast, loop-enemy-info, home-button, game-canvas, loading-screen, loading-progress, menu-screen, start-button, help-button, help-dialog, close-help, game-screen, gold-value, wave-value, enemy-value, enemy-limit, kill-value, next-wave-value, pressure-fill, pause-button, speed-button, mute-button, menu-button, tower-panel, tower-title, tower-stats, sell-button, tower-properties, tower-skills, tower-equipment, tower-management, notice, end-screen, end-title, end-description, end-stats, restart-button, endless-button, build-status, tower-capacity, battle-stage, command-drawer, drawer-title, close-drawer-button, selection-panel, build-dock, focus-button, pressure-label, loop-pressure-value, next-wave-label, mission-panel, map-zoom-button, map-pan-button, map-reset-button, touch-actions, touch-action-status, touch-confirm-button, touch-cancel-button, equipment-button, return-menu-button, loop-ready-panel, loop-ready-towers, loop-hud-overview, loop-hud-actions, loop-hud-deploy, loop-hud-bag, loop-hud-cast, loop-hud-sell, loop-hud-cancel, loop-3d-settings, loop-3d-toggle, loop-3d-model, loop-camera-tools, loop-intel-button, loop-equipment-shop, loop-cards.

`render.js` 用 Canvas 2D 绘制 1280 × 800 的循环圈地图。部署遮罩与点击位置由同一份地图几何决定。触屏先预览，再提交一次指令。键盘方向键移动光标，Enter 选择或部署。

本地 `?view=3d` 挂载 WebGL 画布和镜头控件，使用同一局状态。对局菜单内切换视图或 WebGL 失效时回到 2D。公开 Pages 包提供 2D 入口。对局在战场推进，返回主菜单保留本局进度和手动暂停状态，刷新页面会重置。
