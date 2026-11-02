# T12 工程路障

- 阵营：科技
- 基础配色：工业黄、冷灰、米白，黑黄反光条与蓝色安全灯
- 主体轮廓：宽扁双钢制护板、中央连接件、四个支撑脚
- 部件与连接：两块可展开护板、中央铰链与支撑脚一体固定
- 转向方式：整体改变摆放朝向；方向定义为护板正面的外法线，非护板长边方向
- 定位锚点：(256,320)
- 相对体型：高度 190px，宽扁阻挡单位
- 主图事实：wide low foldable steel barricade, two connected armored panels, support feet, bold yellow reflective stripe, fixed facing, transparent.
- 分层：本单位暂不拆分底座与上层，使用完整 PNG，避免生成图遮挡穿帮。
- 已知限制：主图/方向图为独立栅格生成，仍需进入生产时由 3D 或绘图工具锁定转轴与遮挡。

## 2026-10-30 八方向补齐

- 已保存 N、NE、E、SE、S、SW、W、NW 八张 512×512 透明 PNG，锚点 (256,320)，完整图交付。
- 每次生成引用本单位原主图；生成设定图在 work/sources/tech-engineering-roadblock/，实际提示词在 prompts/turnaround-8.txt 及本次修正提示词中。
- 分格先检查实际透明间隔，再切分；整组使用共同像素比例并与主图地面/悬浮底线注册。单独修正图按同组结构参照对齐。
- 八张文件齐全不代表精确三维转台。局部比例、遮挡和非对称装饰仍有差异，具体问题见 ../../direction-check.md 和统一 manifest 的 knownIssues。
