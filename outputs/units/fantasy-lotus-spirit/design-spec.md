# X11 莲台灵童

- 阵营：玄幻
- 基础配色：玉青灵体、粉白莲瓣、朱砂红、暖金
- 主体轮廓：六瓣简化莲台和坐姿小灵童，悬浮并以投影点定位
- 部件与连接：六瓣莲台、灵童、道冠和流苏整体转向
- 转向方式：整体绕竖直轴离散八向，固定悬浮高度
- 定位锚点：(256,320)
- 相对体型：高度 240px，悬浮支援敌人
- 主图事实：small jade spirit seated on exactly six broad lotus petals, simple gold center and red ribbon, calm neutral hover, no shadow, transparent.
- 分层：本单位暂不拆分底座与上层，使用完整 PNG，避免生成图遮挡穿帮。
- 已知限制：主图/方向图为独立栅格生成，仍需进入生产时由 3D 或绘图工具锁定转轴与遮挡。

## 2026-10-30 八方向补齐

- 已保存 N、NE、E、SE、S、SW、W、NW 八张 512×512 透明 PNG，锚点 (256,320)，完整图交付。
- 每次生成引用本单位原主图；生成设定图在 work/sources/fantasy-lotus-spirit/，实际提示词在 prompts/turnaround-8.txt 及本次修正提示词中。
- 分格先检查实际透明间隔，再切分；整组使用共同像素比例并与主图地面/悬浮底线注册。单独修正图按同组结构参照对齐。
- 八张文件齐全不代表精确三维转台。局部比例、遮挡和非对称装饰仍有差异，具体问题见 ../../direction-check.md 和统一 manifest 的 knownIssues。
