# 环界 · 七模式 2D 塔防

科技防线与东方玄幻异兽的单人浏览器游戏，支持桌面键鼠和手机触控。玩法包括循环圈、核心保卫战、灵枢护送、自由迷宫、万象宝石、守卫灵姬、机关军团（对战 AI）。

- 在线入口：<https://humandetail.github.io/wtf-td/>
- 手机入口：<https://humandetail.github.io/wtf-td/game/?mobile=1>
- [运行说明](game/README.md) · [手机操作](game/qa/mobile-ui.md) · [人工验收清单](game/qa/manual-checklist.md)

## 本地运行

```sh
npm ci
npm run dev
```

打开 <http://127.0.0.1:4173/game/>。同一局域网手机访问可运行 `HOST=0.0.0.0 PORT=4174 npm run dev`，然后打开电脑局域网IP的4174端口。

## 自动部署 GitHub Pages

[pages.yml](.github/workflows/pages.yml) 在推送 `main` 时自动执行，也可通过 Actions 页面手动运行：

1. 安装锁定依赖，执行类型检查和公开对局测试。
2. `npm run build:pages` 生成 `_site/`，校验原运行素材SHA-256。
3. 上传静态发布包并部署到 `github-pages` 环境。

首次部署需在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。工作流使用自动提供的 `GITHUB_TOKEN`，不需要额外部署密钥。后续推送main即可自动更新。

发布包仅含游戏HTML／CSS／JS、现用地图和图集、清单引用的原单位／方向图／特效，以及三个运行道具；不发布制作源文件、历史预览、测试、任务票、node_modules或仓库配置。所有资源使用相对路径，支持 `/wtf-td/` 项目子目录，根入口保留手机参数并跳转至游戏。

```sh
npm run typecheck
npm test
npm run build:pages
```

`outputs/` 原素材库已纳入版本管理，克隆后可直接运行和部署；素材内容不改写。`work/` 是未纳入代码仓库的本机制作源文件。额外的 `npm run check` 会检查原始808文件（包含work），仅在保留完整制作目录的工作区运行；CI使用类型、对局及发布包校验。真实设备完整试玩、试听和主观难度仍按人工清单记录。

官方配置说明：[GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
