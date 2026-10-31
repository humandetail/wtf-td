# 环界 · 2D 循环圈塔防

基于现有科技防御单位与东方玄幻敌人素材制作的单人浏览器游戏。当前采用外环、内环和中心连接路网，在可建造区域连续坐标放塔。主战场默认占据状态栏外的可用视口，建造带、科技与详情按需展开；地图采用科技与玄幻地貌交错的 v4 版本。怪物从中央逐只随机向四方出发；两项科技控制塔数量、种类与升塔资格。原素材及历次地图完整保留。

```sh
npm install
npm run dev
```

打开 [本机游戏](http://127.0.0.1:4173/game/)。详细操作与规则见 [运行说明](game/README.md)。

- [正式规格](.scratch/2d-loop-td/spec.md) 与 [实现记录](.scratch/2d-loop-td/implementation.md)
- [本轮任务票](.scratch/2d-loop-td/issues/16-battlefield-layout-techno-arcane-map.md)
- [地图制作说明](game/map-art.md) 与 [新版生成提示词](game/assets/maps/v4/source/prompts.md)
- [新版地图布局预览](game/assets/maps/v4/preview.png) 与 [原单位场景合成](game/assets/maps/v4/battle-preview.png)
- [用户真实验收清单](game/qa/manual-checklist.md)

`npm run typecheck` 检查代码类型，`npm run check` 同时核验原素材完整性和资源引用。公开对局规则检查可以单独运行 `npm test`。

完整浏览器对局、真实试听、地图观感与平衡验收留待用户决定。原素材和源文件不纳入本次代码提交，游戏运行时需要保留同级素材库。
