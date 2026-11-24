# patches

## 为什么需要补丁

`@lingo-reader/epub-parser` 目前只解析 NCX(`.ncx` 的 `navMap`)作为目录. EPUB3 的目录层级
(卷 → 章)通常只写在导航文档 `nav.xhtml` 的 `<nav epub:type="toc">` 里, 而配套的 NCX
往往是平铺的. 因此上层拿到的目录丢失了卷层级, 无法按卷组织书籍结构.

上游还没有合并该能力, 所以先以 patch-package 补丁的形式在本仓库内提供.

## 补丁做了什么

- `parseNavDocument()`: 解析导航文档中的 `nav[epub:type="toc"]`, 输出与 NCX `navMap`
  同构的 `NavPoint` 树(含 `label/href/id/playOrder/children`).
- `EpubFile.getNavToc()`: 只返回 EPUB3 导航文档树; 无 nav 时返回空数组, 上层按平铺处理
  (不回退 NCX). 目录层级以 EPUB3 导航文档为权威, 缺失时不做猜测, 避免把标题误判成卷.
- `EpubFile.getToc()` 语义**保持不变**(仍只返回 NCX). 上层(legado 索引对齐)依赖该行为,
  不要顺手把它改指向导航文档.

只改 `dist/index.node.mjs` 与 `dist/index.d.ts` 两个产物文件, 未改 browser / CJS 构建:
应用侧由 electron-vite 显式打包 ESM 构建, CJS 入口原本就不可用.

## 如何重新生成

1. 在本地 fork `alice/lingo-reader` 中修改 `packages/epub-parser/src` 并构建(`packages/shared`
   需先构建), 得到 `dist/index.node.mjs` 与 `dist/index.d.ts`.
2. 将这两个文件覆盖到 `node_modules/@lingo-reader/epub-parser/dist/`(保持官方包其余文件不动).
   覆盖前请与官方 0.4.6 产物 diff 一次: 若本地 esbuild 版本差异带入了与功能无关的噪声
   (如 `__publicField(...)` 改写, import 排序变化), 手工剔除, 只保留本功能所需片段,
   否则补丁会随构建工具版本漂移.
3. 生成补丁:

```bash
npx patch-package @lingo-reader/epub-parser
```

npm v12 默认 `allow-remote = none`, 而 patch-package 会按 package-lock 中的 tarball URL
重新拉取原包, 因此需要放开该限制:

```bash
npm_config_allow_remote=all npx patch-package @lingo-reader/epub-parser
```

## 升级注意

补丁文件名绑定版本(`+0.4.6`). 升级 `@lingo-reader/epub-parser` 后补丁不会自动套用, 需要
按新版本重新生成并复核内容. 不要为了让安装通过而删除 `patches/` 或跳过 `patch-package`.
