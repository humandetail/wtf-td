# 环界 · 2D 循环圈塔防

基于现有科技防御单位与东方玄幻敌人素材制作的单人浏览器游戏。新增玉石苔庭地图，原素材完整保留。

```sh
npm install
npm run dev
```

打开 [本机游戏](http://127.0.0.1:4173/game/)。详细操作与规则见 [运行说明](game/README.md)。

- [正式规格](.scratch/2d-loop-td/spec.md) 与 [实现记录](.scratch/2d-loop-td/implementation.md)
- [开发任务票](.scratch/2d-loop-td/issues/10-integration-and-handoff.md)
- [地图制作说明](game/map-art.md) 与 [生成提示词](game/assets/maps/source/prompts.md)
- [用户真实验收清单](game/qa/manual-checklist.md)

`npm run typecheck` 检查代码类型，`npm run check` 同时核验原素材完整性和资源引用。公开对局规则检查可以单独运行 `node --test game/tests/session.test.mjs`。

完整浏览器对局、真实试听、地图观感与平衡验收留待用户决定。原素材和源文件不纳入本次代码提交，游戏运行时需要保留同级素材库。
