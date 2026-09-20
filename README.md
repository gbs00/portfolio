# Tim · 作品集

个人作品集，以飞书中“显示＝是”的记录为内容来源。

- 网站：[gbs00.github.io/portfolio](https://gbs00.github.io/portfolio/)
- 仓库：[gbs00/portfolio](https://github.com/gbs00/portfolio)

## 本地预览

```sh
npm run build
npm run check
npm run dev
```

打开 http://127.0.0.1:4173/ 。无需安装前端依赖；生成器使用 Node.js 内置模块，检查和预览使用 Python 3。

- `dist/index.html`：作品汇总主页，按飞书画册顺序展示全部可见作品。
- `dist/portfolio.html`：同一作品汇总主页的兼容入口。
- `dist/projects/<slug>/index.html`：每件作品的介绍子页面。
- `data/projects.json`：只包含飞书中“显示＝是”的记录快照。
- `data/editorial.json`：根据原始简介与提供的截图整理的介绍文案，无虚构的履历或业绩数据。
- `dist/assets/`：用户在飞书提供的真实封面和演示视频。

按用户要求不展示简历、自我介绍、个人名片或精选作品区。个人入口仅保留个人博客与 GitHub 仓库链接。

## 更新飞书内容

需要本机已安装并完成用户授权的 `lark-cli`。本任务的来源配置保存在被忽略的 `.local/source.json` 中。新环境可设置 `FEISHU_BASE_TOKEN`、`FEISHU_TABLE_ID`、`FEISHU_VIEW_ID`，或在本地创建以下配置：

```json
{"baseToken":"你的 Base token","tableId":"你的 table ID","viewId":"作品集视图 ID","recordOrder":["按飞书画册顺序核对的 record ID"]}
```

```sh
npm run sync
npm run check
```

同步命令分页读取记录，仅保留单选值“是”；“否”和空白全部排除。按 record ID 保持现有页面路径，新增记录生成独立页面；删除旧详情页并清理不再使用的作品附件。原始来源、认证配置和完整记录不进入站点。

飞书画册中的手动排列与接口返回顺序不同。2026-09-21 已通过实际画册逐项核对，当前可见顺序为：Skills Manager → 吃点啥 → Token BI → 个人博客 → 有限周刊 → SideNote 边角记。同步按 `.local/source.json` 中的 `recordOrder` 排列；缺少该本地配置时保留已核对的数据快照顺序。若飞书重新排列，需要再次核对并更新 `recordOrder`。遇到尚未核对位置的新记录会停止同步，不擅自追加或按接口顺序重新排序。卡片编号、元数据和“下一个作品”导航均使用同一顺序。

同步是手动快照更新，不是浏览器实时读取飞书。访客不需要飞书登录，GitHub Actions 不需要飞书凭据。现有作品的扩展介绍由人工整理，新记录先展示原始介绍；修改产品定位时请同步复核 `data/editorial.json`。

## 发布更新

仓库使用 GitHub Actions 发布到 GitHub Pages。推送到 `main` 后，工作流会构建、检查并发布 `dist`；也可以在 Actions 中手动运行发布工作流。所有站内链接和资源使用相对路径，支持仓库子路径。

```sh
npm run build
npm run check
git add data dist scripts README.md
git commit -m "Update portfolio"
git push
```

工作流配置依据 [GitHub Pages 官方文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。未设置自定义域名。

## 验收清单

- 首页直接展示作品；旧作品集地址仍可访问。
- 无简历、自我介绍、个人名片；个人入口仅保留博客和 GitHub 仓库。
- 卡片、编号、详情页“下一个作品”顺序与飞书画册一致。
- 汇总页 6 张卡片与“显示＝是”的 6 条记录一一对应。
- 每张卡片可进入独立详情页，支持返回和浏览下一个作品。
- 详情页包含真实预览图、原始介绍与外部访问链接。
- 吃点啥详情页可播放飞书附件中的演示视频。
- 桌面、手机宽度下内容可读，导航可用。

