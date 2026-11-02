# T09 雷达哨站

- 阵营：科技
- 基础配色：工业黄、冷灰、米白，天线扫描灯青蓝
- 主体轮廓：矮控制箱和高桅杆；大面积圆角矩形雷达面板
- 部件与连接：雷达天线面板与桅杆上部旋转，控制箱固定
- 转向方式：天线/桅杆上层绕中央轴离散八向
- 定位锚点：(256,320)
- 相对体型：高度 300px，偏高侦测设施
- 主图事实：large rounded rectangular radar panel on a mast above a squat control box, minimal weapon cues, industrial yellow/cool-gray, transparent.
- 分层：本单位暂不拆分底座与上层，使用完整 PNG，避免生成图遮挡穿帮。
- 已知限制：主图/方向图为独立栅格生成，仍需进入生产时由 3D 或绘图工具锁定转轴与遮挡。

## 2026-10-30 八方向补齐

- 已保存 N、NE、E、SE、S、SW、W、NW 八张 512×512 透明 PNG，锚点 (256,320)，完整图交付。
- 每次生成引用本单位原主图；生成设定图在 work/sources/tech-radar-outpost/，实际提示词在 prompts/turnaround-8.txt 及本次修正提示词中。
- 分格先检查实际透明间隔，再切分；整组使用共同像素比例并与主图地面/悬浮底线注册。单独修正图按同组结构参照对齐。
- 八张文件齐全不代表精确三维转台。局部比例、遮挡和非对称装饰仍有差异，具体问题见 ../../direction-check.md 和统一 manifest 的 knownIssues。
