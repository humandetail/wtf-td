# X05 铜铃精

- 阵营：玄幻
- 基础配色：青铜暖金、墨棕、玉青丝带
- 主体轮廓：圆润铜铃主体、喇叭形铃口、短脚与可见铃舌
- 部件与连接：铜铃是主体，不做人形；铃舌、脚和丝带随主体转向
- 转向方式：整体绕竖直轴离散八向
- 定位锚点：(256,320)
- 相对体型：高度 260px，中型敌人
- 主图事实：round bronze temple bell as the entire body, flared rim, two tiny feet, visible clapper, jade ribbon, mischievous face, transparent.
- 分层：本单位暂不拆分底座与上层，使用完整 PNG，避免生成图遮挡穿帮。
- 已知限制：主图/方向图为独立栅格生成，仍需进入生产时由 3D 或绘图工具锁定转轴与遮挡。

## 2026-10-30 八方向补齐

- 已保存 N、NE、E、SE、S、SW、W、NW 八张 512×512 透明 PNG，锚点 (256,320)，完整图交付。
- 每次生成引用本单位原主图；生成设定图在 work/sources/fantasy-bronze-bell/，实际提示词在 prompts/turnaround-8.txt 及本次修正提示词中。
- 分格先检查实际透明间隔，再切分；整组使用共同像素比例并与主图地面/悬浮底线注册。单独修正图按同组结构参照对齐。
- 八张文件齐全不代表精确三维转台。局部比例、遮挡和非对称装饰仍有差异，具体问题见 ../../direction-check.md 和统一 manifest 的 knownIssues。
