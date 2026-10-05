# Tim · 作品集

个人作品集，以飞书中“显示＝是”的记录为内容来源。

- 网站：[gbs00.github.io/portfolio](https://gbs00.github.io/portfolio/)
- 仓库：[gbs00/portfolio](https://github.com/gbs00/portfolio)

## 本地预览

```sh
npm run build
npm test
npm run dev
```

打开 http://127.0.0.1:4173/ 。无需安装 npm 依赖；生成器和回归测试使用 Node.js 22+ 内置模块，检查和预览使用 Python 3.10+。发布工作流使用 Node.js 24 / Ubuntu 24.04。

- `dist/index.html`：作品汇总主页，按飞书“显示排序”数值升序展示全部可见作品。
- `dist/portfolio.html`：同一作品汇总主页的兼容入口。
- `dist/projects/<slug>/index.html`：每件作品的介绍子页面。
- `data/projects.json`：只包含飞书中“显示＝是”的记录快照。
- `data/editorial.json`：根据原始简介与提供的截图整理的介绍文案，无虚构的履历或业绩数据。
- `public/assets/`：飞书提供的原始封面、演示视频及派生预览图，是素材的唯一来源。
- `src/`：样式与浏览器埋点源码。
- `scripts/lib/projects.mjs`：构建和同步共用的数据校验与排序。
- `scripts/lib/render.mjs`：公共布局、卡片和详情页模板。
- `dist/`：完整构建产物，不提交 Git；清空后可由 `npm run build` 恢复。

构建先渲染到临时目录，检查页面、链接、资源、排序及 GA4 配置，通过后再替换 `dist`。输入或素材错误不会破坏上一份成功输出。`npm run check` 可单独检查现有产物；`SOURCE_DATE_EPOCH` 可固定版权年份，便于跨时间复现。

大封面在卡片和详情中使用最长边 1280 像素的 JPEG 预览，原图仍可点击查看。当前六张封面的展示文件合计从约 10.6 MB 降至 1.05 MB；这是文件体积对比，不是网络速度实测。第一张作品封面优先加载，其余卡片延迟加载；视频点击播放时再读取媒体。字体在 HTML 中直接声明，避免 CSS `@import` 串行加载。

按用户要求不展示简历、自我介绍、个人名片或精选作品区。个人入口仅保留个人博客与 GitHub 仓库链接。

## 更新飞书内容

需要本机已安装并完成用户授权的 `lark-cli`。本任务的来源配置保存在被忽略的 `.local/source.json` 中。新环境可设置 `FEISHU_BASE_TOKEN`、`FEISHU_TABLE_ID`、`FEISHU_VIEW_ID`，或在本地创建以下配置：

```json
{"baseToken":"你的 Base token","tableId":"你的 table ID","viewId":"作品集视图 ID"}
```

```sh
npm run sync
```

同步命令分页读取记录，仅保留单选值“是”；“否”和空白全部排除。所有页的数据版本一致且记录校验通过后才处理附件。按 record ID 保持现有页面路径，新增记录生成独立页面；成功同步会移除不再使用的详情页和素材。原始来源、认证配置和完整记录不进入站点。

附件缓存位于忽略的 `.local/media-cache.json`。首次同步下载附件并建立缓存；以后只有附件标识变化、本地缺失或内容哈希不匹配时才重新下载。图片预览也会复用。缓存包含私有来源标识，不上传仓库。同步先在临时目录完成素材准备、构建和页面检查，再一起替换快照、素材、产物与缓存；失败保留上一份成功结果。

图片尺寸从真实文件读取。macOS 使用内置 `sips` 为较大的封面生成更小的预览；PNG/GIF 在其他平台可直接读取尺寸并使用原图，其他格式的本地同步需要 `sips`。CI 只复制已准备的素材，不依赖图片处理工具。已有原图可运行 `npm run optimize-images` 更新预览，再执行 `npm run build`。

同步读取飞书的“显示排序”字段，按数值从小到大排列，支持数字字段或以数字命名的单选选项。每条可见记录必须有有效且不重复的排序值；缺失、无效或重复时停止同步，保留原有快照。排序值保存为 `data/projects.json` 中的 `displayOrder`，构建时也会按此字段排序。卡片、编号、元数据、“下一个作品”导航及 GA4 点击位置均使用同一顺序。

2026-09-30 的可见顺序为：1 Token BI → 2 吃点啥 → 3 Skills Manager → 4 SideNote 边角记 → 5 个人博客 → 6 有限周刊。以后只需在飞书修改“显示排序”，再运行同步并推送，无需维护本地 record ID 顺序。

同步是手动快照更新，不是浏览器实时读取飞书。访客不需要飞书登录，GitHub Actions 不需要飞书凭据。现有作品的扩展介绍由人工整理，新记录先展示原始介绍；修改产品定位时请同步复核 `data/editorial.json`。

## 发布更新

仓库使用 GitHub Actions 发布到 GitHub Pages。推送到 `main` 后，工作流先运行回归测试，再构建、检查并发布 `dist`；也可以在 Actions 中手动运行发布工作流。所有站内链接和资源使用相对路径，支持仓库子路径。

```sh
npm run build
npm test
git add data public src scripts tests package.json README.md .github .gitignore
git commit -m "Update portfolio"
git push
```

工作流配置依据 [GitHub Pages 官方文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。未设置自定义域名。

## GA4 访问统计

`data/analytics.json` 保存公开的 GA4 衡量 ID 和正式网站地址。修改配置后重新构建、推送即可更新所有页面；也可以在构建时用 `GA4_MEASUREMENT_ID` 覆盖。ID 留空时不会加载 Google 跟踪代码。不要在仓库中保存 Google 账号凭据或 API 密钥。

`src/analytics.js` 在构建时复制到 `dist/analytics.js`。只有正式网站的 origin 和 `/portfolio/` 路径下启用统计，本地预览自动排除。异步加载 Google tag，并使用默认 `page_view`，避免重复发送。主页的 `/portfolio/`、`index.html`、`portfolio.html` 合并为同一统计地址；详情页的 `index.html` 也归一为目录地址。保留 UTM 渠道参数，剔除其他查询参数和锚点。广告个性化与 Google signals 在代码中关闭。

| 事件 | 触发时机 | 主要参数 |
| --- | --- | --- |
| `page_view` | 主页或作品详情页打开 | `page_type`、详情页的 `project_id` / `project_name` |
| `project_open` | 点击作品卡片或下一个作品 | `project_id`、`project_name`、`position`、`placement` |
| `project_outbound` | 点击详情页访问作品按钮 | `project_id`、`project_name`、`placement`、`link_url` |
| `profile_click` | 点击顶部或底部个人入口 | `profile`（blog / github）、`placement` |
| `video_start` / `video_progress` / `video_complete` | 原生 MP4 首次播放、进度到达 25% / 50% / 75%、播放结束 | `project_id`、`video_title`、`video_percent` |

一次页面访问内，视频开始、各个进度和完成事件各发送一次。进度代表播放位置到达相应节点，不代表连续观看时长。外链保留原有新标签打开方式；Google tag 加载成功后，站内点击最多等待 200 毫秒用于发送事件；尚未加载或加载失败时立即使用浏览器原生跳转，此时无法保证点击事件送达。增强型衡量的 `click` 是通用外链事件；分析作品转化时只使用 `project_outbound`，不要把两个事件相加。

GA4 后台可将 `project_id`、`project_name`、`placement`、`profile`、`page_type` 注册为事件级自定义维度，并将 `project_outbound` 设为关键事件。使用“网页和屏幕”比较作品访问量，使用探索报告结合项目维度查看访问与点击。

- 调试：在正式网站 URL 后加 `?ga_debug=1`。同一标签页后续页面启用 DebugView，并在浏览器控制台输出事件；加 `?ga_debug=0` 关闭。
- 排除自己的访问：在正式网站 URL 后加 `?analytics=off`。此浏览器会记住关闭状态；加 `?analytics=on` 恢复。浏览器禁止本地存储时，开关仅对当前带参数页面生效。
- 渠道示例：`https://gbs00.github.io/portfolio/?utm_source=blog&utm_medium=referral&utm_campaign=portfolio`。渠道参数使用分类名称，不放个人信息。

配置依据：[Google tag 事件](https://developers.google.com/analytics/devguides/collection/ga4/events)、[网页浏览量](https://developers.google.com/analytics/devguides/collection/ga4/views)、[GA4 配置字段](https://developers.google.com/analytics/devguides/collection/ga4/reference/config)。

## 验收清单

- 首页直接展示作品；旧作品集地址仍可访问。
- 无简历、自我介绍、个人名片；个人入口仅保留博客和 GitHub 仓库。
- 卡片、编号、详情页“下一个作品”顺序与飞书“显示排序”数值升序一致。
- 汇总页 6 张卡片与“显示＝是”的 6 条记录一一对应。
- 每张卡片可进入独立详情页，支持返回和浏览下一个作品。
- 详情页包含真实预览图、原始介绍与外部访问链接。
- 吃点啥详情页可播放飞书附件中的演示视频。
- 桌面、手机宽度下内容可读，导航可用。
