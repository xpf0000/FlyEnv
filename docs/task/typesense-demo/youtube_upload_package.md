# FlyEnv Typesense Demo - Upload Package

Final master: `flyenv-typesense_en_final.mp4` — shared FlyEnv opener, burned English captions,
header audio, and English neural voiceover.

## YouTube

**Recommended title**

```
Typesense in FlyEnv | Browse Releases, Inspect Logs & Check Local Status
```

**Description**

```
FlyEnv now includes a native Typesense module. This original-speed walkthrough follows
the visible local-service workflow: select Typesense, inspect release and installed
states, check the service configuration and startup log, then open its local diagnostic
pages before returning to the running service.

What's covered
- Selecting Typesense and opening its Version tab
- Inspecting visible releases and installed states
- Reviewing service controls, configuration, and the startup log on port 8108
- Opening the local raft status page
- Inspecting the vars, flags, and RPC diagnostic pages
- Returning to the final running Typesense service

FlyEnv: https://www.flyenv.com
Typesense documentation: https://typesense.org/docs/
Source: https://github.com/xpf0000/FlyEnv

English narration and captions are included.
```

**Chapters**

```
0:00 FlyEnv intro
0:15 Typesense releases and install states
0:30 Service, configuration, and startup log
0:45 Local raft status
1:00 Variables, flags, and RPC page
1:20 Return to the Typesense service
```

**Tags**

```
FlyEnv, Typesense, Typesense tutorial, local Typesense, Typesense setup, Typesense server, search engine, local development, developer tools, service logs
```

- Language: English; upload `flyenv-typesense_en_subtitles.srt` as the English caption track
- Thumbnail: `flyenv-typesense_youtube_thumbnail.png`
- Audience: Not made for kids

## Bilibili

**推荐标题**

```
FlyEnv Typesense 本地服务演示：版本、日志与状态页面
```

**简介**

```
FlyEnv 新增 Typesense 模块。本视频以原始录制速度展示：选择 Typesense，浏览版本与
安装状态，查看服务、配置和启动日志，然后在浏览器打开本地 raft status、vars、flags
与 RPC 诊断页面，最后返回正在运行的服务。

视频内容
- 选择 Typesense 并打开版本列表
- 查看可见版本和已安装状态
- 查看服务控制、配置与 8108 端口启动日志
- 打开本地 raft status 页面
- 查看 vars、flags 和 RPC 诊断页面
- 返回最终运行中的 Typesense 服务

FlyEnv 官网：https://www.flyenv.com
Typesense 文档：https://typesense.org/docs/
开源地址：https://github.com/xpf0000/FlyEnv

视频包含英文配音和英文字幕。
```

**标签**（最多 10 个）

```
FlyEnv, Typesense, 搜索引擎, 本地开发, 开发工具, 本地部署, 服务管理, 后端开发, 开源, 程序员
```

- 封面：`flyenv-typesense_bilibili_cover.png`

## Files

| File | Purpose |
| --- | --- |
| `flyenv-typesense_en_final.mp4` | Upload master: header + captions + audio |
| `flyenv-typesense_en_subtitles.srt` | English closed-caption track |
| `flyenv-typesense_en_subtitles.tsv` | Caption source relative to the demo after the header |
| `flyenv-typesense_youtube_thumbnail.png` | YouTube thumbnail, English copy |
| `flyenv-typesense_bilibili_cover.png` | Bilibili cover, Chinese copy |
| `flyenv-typesense_en_voiceover.wav` | Full-length English narration mix |
| `flyenv-typesense_en_subtitled.mp4` | Caption-burned video before the final audio mux |
| `flyenv-typesense_base_edited_1080p.mp4` | Original-speed 1080p edit before header and captions |
## Release-ready publishing settings

### YouTube

- **Category:** Science & Technology
- **Language:** English
- **Audience:** Not made for kids
- **Visibility:** Public, or schedule for the product release window
- **Thumbnail:** `flyenv-typesense_youtube_thumbnail.png` — 1920x1080, English copy

Upload `flyenv-typesense_en_subtitles.srt` as the English subtitle track. Captions are
burned into the master, while the SRT remains available for accessibility and discovery.
The chapter timeline includes the shared opener; every chapter interval is at least ten
seconds on the final master.

**Title alternatives**

- `FlyEnv Typesense Demo | Releases, Logs, Local Raft Status and Service Controls`
- `Typesense Local Service in FlyEnv | Inspect Versions, Logs and Status Pages`

### Bilibili

- **分区：** 科技 → 计算机技术
- **封面：** `flyenv-typesense_bilibili_cover.png` — 1920x1200，中文文案

**时间轴**（包含 FlyEnv 开场；每段不少于 10 秒）

```
0:00 FlyEnv 开场
0:15 Typesense 版本与安装状态
0:30 服务、配置与启动日志
0:45 本地 raft 状态
1:00 vars、flags 与 RPC 页面
1:20 返回 Typesense 服务
```

**备选标题**

- `FlyEnv Typesense 模块演示：版本、日志、本地状态与服务控制`
- `在 FlyEnv 中查看 Typesense：服务配置、启动日志与状态页面`

### Official references

- YouTube video details and chapters: https://support.google.com/youtube/answer/57404
- YouTube custom thumbnails: https://support.google.com/youtube/answer/72431
- YouTube tags and discovery guidance: https://support.google.com/youtube/answer/146402
- Bilibili creator center: https://member.bilibili.com/platform/home
- FlyEnv: https://www.flyenv.com
- Typesense documentation: https://typesense.org/docs/
- Typesense GitHub: https://github.com/typesense/typesense

## Re-rendering

```bash
cd docs/task/typesense-demo
python3 render.py all verify
python3 render.py tts subs mix assets verify
```

Voice: `en-US-BrianNeural` at `-6%`. The base edit preserves the complete
88.033-second original-speed recording; use the second command for narration-only changes.
