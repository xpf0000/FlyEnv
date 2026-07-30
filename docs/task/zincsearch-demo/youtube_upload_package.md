# FlyEnv ZincSearch Demo - Upload Package

Final master: `flyenv-zincsearch_en_final.mp4` — shared FlyEnv opener, burned English captions,
header audio, and English neural voiceover.

## YouTube

**Recommended title**

```
ZincSearch Local Setup in FlyEnv | Install Versions, Run Service & Open UI
```

**Description**

```
FlyEnv now includes a native ZincSearch module. This original-speed walkthrough shows
the recorded release-to-service workflow: browse available builds, install the visible
0.4.10 and 0.4.5 versions, inspect installed paths and configuration, start the service,
and open the local ZincSearch interface at the shown local address.

What's covered
- Selecting ZincSearch and browsing the release list
- Installing the visible 0.4.10 and 0.4.5 builds
- Reviewing installed service paths and the module folder
- Starting ZincSearch and checking the `127.0.0.1:4080` configuration
- Opening the local ZincSearch browser interface
- Starting 0.4.5 and using the FlyEnv tray/service control shown at the end

FlyEnv: https://www.flyenv.com
ZincSearch: https://zincsearch-docs.zinc.dev/
Source: https://github.com/xpf0000/FlyEnv

English narration and captions are included.
```

**Chapters**

```
0:00 FlyEnv intro
0:15 ZincSearch release list
0:30 Install selected versions
0:45 Service paths and configuration
1:00 Local ZincSearch interface
1:15 Start ZincSearch 0.4.5
```

**Tags**

```
FlyEnv, ZincSearch, ZincSearch tutorial, local ZincSearch, ZincSearch setup, search engine, local development, developer tools, service manager, self hosted search
```

- Language: English; upload `flyenv-zincsearch_en_subtitles.srt` as the English caption track
- Thumbnail: `flyenv-zincsearch_youtube_thumbnail.png`
- Audience: Not made for kids

## Bilibili

**推荐标题**

```
FlyEnv ZincSearch 本地部署演示：安装版本、启动服务与打开界面
```

**简介**

```
FlyEnv 新增 ZincSearch 模块。本视频以原始录制速度展示从版本浏览、安装 0.4.10 和
0.4.5，到查看服务路径和配置、启动服务、打开本地 ZincSearch 界面的完整录制流程。

视频内容
- 选择 ZincSearch 并浏览版本列表
- 安装可见的 0.4.10 和 0.4.5 版本
- 查看已安装服务路径和模块目录
- 启动服务并查看 `127.0.0.1:4080` 配置
- 在浏览器中打开本地 ZincSearch 界面
- 启动 0.4.5 并查看视频结尾的 FlyEnv 托盘/服务控制

FlyEnv 官网：https://www.flyenv.com
ZincSearch 文档：https://zincsearch-docs.zinc.dev/
开源地址：https://github.com/xpf0000/FlyEnv

视频包含英文配音和英文字幕。
```

**标签**（最多 10 个）

```
FlyEnv, ZincSearch, 搜索引擎, 本地开发, 开发工具, 本地部署, 服务管理, 后端开发, 开源, 程序员
```

- 封面：`flyenv-zincsearch_bilibili_cover.png`

## Files

| File | Purpose |
| --- | --- |
| `flyenv-zincsearch_en_final.mp4` | Upload master: header + captions + audio |
| `flyenv-zincsearch_en_subtitles.srt` | English closed-caption track |
| `flyenv-zincsearch_en_subtitles.tsv` | Caption source relative to the demo after the header |
| `flyenv-zincsearch_youtube_thumbnail.png` | YouTube thumbnail, English copy |
| `flyenv-zincsearch_bilibili_cover.png` | Bilibili cover, Chinese copy |
| `flyenv-zincsearch_en_voiceover.wav` | Full-length English narration mix |
| `flyenv-zincsearch_en_subtitled.mp4` | Caption-burned video before the final audio mux |
| `flyenv-zincsearch_base_edited_1080p.mp4` | Original-speed 1080p edit before header and captions |
## Release-ready publishing settings

### YouTube

- **Category:** Science & Technology
- **Language:** English
- **Audience:** Not made for kids
- **Visibility:** Public, or schedule for the release window
- **Thumbnail:** `flyenv-zincsearch_youtube_thumbnail.png` — 1920x1080, English copy over a real ZincSearch UI frame

Upload `flyenv-zincsearch_en_subtitles.srt` as the English subtitle track. Captions are
burned into the master, while the SRT remains available for accessibility and discovery.
The chapters include the shared opener; every interval is at least ten seconds.

**Title alternatives**

- `FlyEnv ZincSearch Demo | Install Releases, Manage Local Services and Open the UI`
- `Run ZincSearch Locally with FlyEnv | Versions, Configuration and Service Controls`

### Bilibili

- **分区：** 科技 → 计算机技术
- **封面：** `flyenv-zincsearch_bilibili_cover.png` — 1920x1200，中文文案，基于真实 FlyEnv 服务画面

**时间轴**（包含 FlyEnv 开场；每段不少于 10 秒）

```
0:00 FlyEnv 开场
0:15 ZincSearch 版本列表
0:30 安装选定版本
0:45 服务路径与配置
1:00 本地 ZincSearch 界面
1:15 启动 ZincSearch 0.4.5
```

### Official references

- YouTube video details and chapters: https://support.google.com/youtube/answer/57404
- YouTube custom thumbnails: https://support.google.com/youtube/answer/72431
- YouTube tags and discovery guidance: https://support.google.com/youtube/answer/146402
- Bilibili creator center: https://member.bilibili.com/platform/home
- FlyEnv: https://www.flyenv.com
- ZincSearch documentation: https://zincsearch-docs.zinc.dev/
- ZincSearch GitHub: https://github.com/zincsearch/zincsearch

## Re-rendering

```bash
cd docs/task/zincsearch-demo
python3 render.py all verify
python3 render.py tts subs mix assets verify
```

Voice: `en-US-BrianNeural` at `-6%`. The base edit retains the complete
87.600-second original-speed recording; the second command rebuilds narration-related assets only.
