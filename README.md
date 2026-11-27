# 影之刃：断魂局 | PHANTOM BLADE: SEVERED SOUL

雨夜古刹 · 杀意技能链 · 极速弹反破招 · 全程电影级中文配音 — 基于 Three.js 打造的 3D 暗黑武侠动作网页游戏。

## 线上试玩

- **Cloudflare 全球边缘节点直连**：https://phantom-blade-severed-soul.tanggekimi.workers.dev
- **单文件离线畅玩**：直接用现代浏览器打开 [`dist-single/index.html`](./dist-single/index.html)（仅约 **20.6 MB**，Gzip 传输 **15.5 MB**，内含完整引擎、7 套 3D 模型与骨骼动画、HDRI 光照及 85 条配音/配乐/音效）。

## 本地开发与单文件打包

```bash
npm install
npm run dev          # 启动本地开发服务器
npm run build:single # 重新编译并生成单文件版 dist-single/index.html
npx wrangler deploy  # 一键部署至 Cloudflare
```
