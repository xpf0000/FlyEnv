# FlyEnv RustFS Demo - Upload Package

Final master: `flyenv-rustfs_en_final.mp4` — shared FlyEnv opener, burned English captions,
header audio, and English neural voiceover.

## YouTube

**Recommended title**

```
RustFS in FlyEnv | Install, Configure & Open the Local Console
```

**Description**

```
FlyEnv now includes a native RustFS module. This original-speed walkthrough follows the
full visible workflow: inspect the available build, download and install it, check the
service controls, configuration and logs, then open the local RustFS Console from
FlyEnv. It is a product demo of the recorded screens, not a claim that every Console
operation is completed.

What's covered
- Opening RustFS in FlyEnv and inspecting the visible release
- Downloading the build and confirming its installed state
- Reviewing service controls, configuration values, and server log output
- Opening the local RustFS Console
- Browsing Buckets, Access Keys, Users, User Groups, Bucket Events, and Lifecycle
- Returning to FlyEnv and confirming the final RustFS service state

FlyEnv: https://www.flyenv.com
RustFS: https://rustfs.com
RustFS documentation: https://docs.rustfs.com
Source: https://github.com/xpf0000/FlyEnv

English narration and captions are included.
```

**Chapters**

```
0:00 FlyEnv intro
0:15 RustFS module and version
0:30 Download and install
0:45 Service controls and configuration
1:10 RustFS log output
1:20 Local RustFS Console
1:35 Buckets and Access Keys
1:55 Users and User Groups
2:10 Return to RustFS service
```

**Tags**

```
FlyEnv, RustFS, RustFS tutorial, RustFS Console, local RustFS, object storage, distributed file system, local development, developer tools, RustFS installation
```

- Language: English; upload `flyenv-rustfs_en_subtitles.srt` as the English caption track
- Thumbnail: `flyenv-rustfs_youtube_thumbnail.png`
- Audience: Not made for kids

## Bilibili

**推荐标题**

```
FlyEnv RustFS 演示：安装、配置与本地 Console
```

**简介**

```
FlyEnv 新增 RustFS 模块。本视频以原始录制速度展示从版本查看、下载与安装状态，
到服务控制、配置、日志以及从 FlyEnv 打开本地 RustFS Console 的完整画面流程。
Console 中可见 Buckets、Access Keys、Users、User Groups、Bucket Events 和 Lifecycle；
录制中没有创建 Bucket。

视频内容
- 查看 RustFS 可用版本、下载与安装结果
- 查看服务控制、配置字段和服务器日志
- 从 FlyEnv 打开本地 RustFS Console
- 浏览 Buckets、Access Keys、Users、User Groups
- 查看 Bucket Events 与 Lifecycle 页面
- 回到 FlyEnv 确认最终服务状态

FlyEnv 官网：https://www.flyenv.com
RustFS 官网：https://rustfs.com
RustFS 文档：https://docs.rustfs.com
开源地址：https://github.com/xpf0000/FlyEnv

视频包含英文配音和英文字幕。
```

**标签**（最多 10 个）

```
FlyEnv, RustFS, 对象存储, 分布式文件系统, 本地开发, 开发工具, 本地部署, 后端开发, 开源, 程序员
```

**时间轴**

```
00:00 FlyEnv 开场
00:15 RustFS 模块与版本
00:30 下载与安装
00:45 服务控制与配置
01:10 RustFS 日志输出
01:20 本地 RustFS Console
01:35 Buckets 与 Access Keys
01:55 Users 与 User Groups
02:10 返回 RustFS 服务
```

- 分区：科技 → 计算机技术
- 封面：`flyenv-rustfs_bilibili_cover.png`（1920x1200，中文文案）

## Files

| File | Purpose |
| --- | --- |
| `flyenv-rustfs_en_final.mp4` | Upload master: header + captions + audio |
| `flyenv-rustfs_en_subtitles.srt` | English closed-caption track |
| `flyenv-rustfs_en_subtitles.tsv` | Caption source relative to the demo after the header |
| `flyenv-rustfs_youtube_thumbnail.png` | YouTube thumbnail, English copy |
| `flyenv-rustfs_bilibili_cover.png` | Bilibili cover, Chinese copy |
| `flyenv-rustfs_en_voiceover.wav` | Full-length English narration mix |
| `flyenv-rustfs_en_subtitled.mp4` | Caption-burned video before the final audio mux |
| `flyenv-rustfs_base_edited_1080p.mp4` | Original-speed 1080p edit before header and captions |
## Release-ready publishing settings

### YouTube

- **Category:** Science & Technology
- **Language:** English
- **Audience:** Not made for kids
- **Visibility:** Public, or schedule for the release window
- **Thumbnail:** `flyenv-rustfs_youtube_thumbnail.png` — 1920x1080, English copy

Upload `flyenv-rustfs_en_subtitles.srt` as the English subtitle track. Captions are
burned into the master and the SRT remains available for accessibility and discovery.
The chapter timeline is measured on the final master, includes the shared opener, and
every chapter interval meets YouTube's 10-second condition.

**Title alternatives**

- `FlyEnv RustFS Demo | Install a Release and Open the Local Console`
- `RustFS Local Console in FlyEnv | Service Controls, Configuration and Logs`

### Bilibili

- **分区：** 科技 → 计算机技术
- **封面：** `flyenv-rustfs_bilibili_cover.png` — 1920x1200，中文文案

**备选标题**

- `FlyEnv RustFS 模块演示：版本安装、服务配置与 Console`
- `在 FlyEnv 中管理 RustFS：查看日志并打开本地 Console`

### Official references

- YouTube video details and chapters: https://support.google.com/youtube/answer/57404
- YouTube custom thumbnails: https://support.google.com/youtube/answer/72431
- YouTube tags and discovery guidance: https://support.google.com/youtube/answer/146402
- Bilibili creator center: https://member.bilibili.com/platform/home
- FlyEnv: https://www.flyenv.com
- RustFS: https://rustfs.com
- RustFS documentation: https://docs.rustfs.com
- RustFS source releases: https://github.com/rustfs/rustfs/releases

## Re-rendering

```bash
cd docs/task/rustfs-demo
python3 render.py all verify
python3 render.py tts subs mix assets verify
```

Voice: `en-US-BrianNeural` at `-6%`. The base edit retains the complete
137.900-second original-speed recording; captions and narration are rebuilt independently.
