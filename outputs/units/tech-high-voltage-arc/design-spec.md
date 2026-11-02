# T05 高压电弧塔

- 阵营：科技
- 基础配色：工业黄、冷灰、米白，电极内侧少量青蓝
- 主体轮廓：厚实八边形底座；顶部双叉电极与陶瓷绝缘子形成明显 U 形轮廓；中央变压器线圈
- 部件与连接：双电极、两组白色陶瓷绝缘子、中央线圈壳体为上层结构
- 转向方式：上层绕中央竖直轴离散八向，电弧另作为 F02
- 定位锚点：(256,320)
- 相对体型：高度 280px，较高的中型科技塔
- 主图事实：two tall forked electrodes on ceramic insulators, central transformer coil, chunky industrial yellow/cool-gray base; no cannon, transparent full canvas.
- 分层：本单位暂不拆分底座与上层，使用完整 PNG，避免生成图遮挡穿帮。
- 已知限制：主图/方向图为独立栅格生成，仍需进入生产时由 3D 或绘图工具锁定转轴与遮挡。

## 2026-10-30 八方向补齐

- 已保存 N、NE、E、SE、S、SW、W、NW 八张 512×512 透明 PNG，锚点 (256,320)，完整图交付。
- 每次生成引用本单位原主图；生成设定图在 work/sources/tech-high-voltage-arc/，实际提示词在 prompts/turnaround-8.txt 及本次修正提示词中。
- 分格先检查实际透明间隔，再切分；整组使用共同像素比例并与主图地面/悬浮底线注册。单独修正图按同组结构参照对齐。
- 八张文件齐全不代表精确三维转台。局部比例、遮挡和非对称装饰仍有差异，具体问题见 ../../direction-check.md 和统一 manifest 的 knownIssues。
