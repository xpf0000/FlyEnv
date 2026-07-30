# FlyEnv MinIO Demo - Upload Package

Final master: `flyenv-minio_en_final.mp4` — shared FlyEnv opener, burned English captions,
header audio, and English neural voiceover.

## YouTube

**Recommended title**

```
MinIO Local Setup in FlyEnv | Browse Releases, Install & Open Console
```

**Description**

```
FlyEnv now includes a native MinIO module. This original-speed walkthrough shows where
MinIO lives in the Object Storage group, how to browse and install available releases,
inspect installed services, review configuration and logs, and open MinIO Console in a
browser — without switching to a separate terminal workflow.

What's covered
- Selecting MinIO from FlyEnv's Object Storage group
- Browsing release entries and installing a MinIO build
- Reviewing installed service paths and service controls
- Checking configuration and the live service log
- Opening the local MinIO Console from FlyEnv
- Navigating the visible Object Browser, Access Keys, Buckets, and IAM Policies pages
- Returning to the final healthy MinIO service state

FlyEnv: https://www.flyenv.com
MinIO: https://min.io
Source: https://github.com/xpf0000/FlyEnv

English narration and captions are included.
```

**Chapters**

```
0:00 FlyEnv intro
0:15 Browse MinIO releases
0:30 Install and inspect service state
0:45 Configuration and service log
1:00 Open MinIO Console
1:15 Access keys, buckets, and IAM policies
1:35 Final MinIO service state
```

**Tags**

```
FlyEnv, MinIO, MinIO tutorial, local MinIO, MinIO Console, MinIO local setup, object storage, S3 compatible storage, developer tools, local development
```

- Language: English; upload `flyenv-minio_en_subtitles.srt` as the English caption track
- Thumbnail: `flyenv-minio_youtube_thumbnail.png`
- Audience: Not made for kids

## Bilibili

**推荐标题**

```
FlyEnv MinIO 本地部署演示：浏览版本、安装服务与打开 Console
```

**简介**

```
FlyEnv 新增 MinIO 模块。本视频以原始录制速度演示：从 Object Storage 分组进入
MinIO，浏览版本并安装，查看已安装服务的路径、配置和实时日志，然后直接在浏览器
打开本地 MinIO Console，全程无需在多个命令行窗口之间切换。

视频内容
- 在 FlyEnv 的 Object Storage 分组中选择 MinIO
- 浏览版本并安装 MinIO
- 查看已安装服务、路径与服务控制
- 查看配置和实时服务日志
- 从 FlyEnv 直接打开本地 MinIO Console
- 浏览 Object Browser、Access Keys、Buckets 与 IAM Policies 页面
- 回到最终正常运行的 MinIO 服务状态

FlyEnv 官网：https://www.flyenv.com
MinIO 官网：https://min.io
开源地址：https://github.com/xpf0000/FlyEnv

视频为英文配音与英文字幕。
```

**标签**（最多 10 个）

```
FlyEnv, MinIO, 对象存储, 本地开发, 开发工具, 本地部署, 后端开发, S3, 开源, 程序员
```

**时间轴**

```
00:00 FlyEnv 开场
00:15 浏览 MinIO 版本
00:30 安装并查看服务状态
00:45 配置与服务日志
01:00 打开 MinIO Console
01:15 Access Keys、Buckets 与 IAM Policies
01:35 最终 MinIO 服务状态
```

- 分区：科技 → 计算机技术
- 封面：`flyenv-minio_bilibili_cover.png`（1920x1200，中文文案）

## Files

| File | Purpose |
| --- | --- |
| `flyenv-minio_en_final.mp4` | Upload master: header + captions + audio |
| `flyenv-minio_en_subtitles.srt` | English closed-caption track |
| `flyenv-minio_en_subtitles.tsv` | Caption source relative to the demo after the header |
| `flyenv-minio_youtube_thumbnail.png` | YouTube thumbnail, English copy |
| `flyenv-minio_bilibili_cover.png` | Bilibili cover, Chinese copy |
| `flyenv-minio_en_voiceover.wav` | Full-length English narration mix |
| `flyenv-minio_en_subtitled.mp4` | Caption-burned video before the final audio mux |
| `flyenv-minio_base_edited_1080p.mp4` | Original-speed 1080p edit before header and captions |
## Release-ready publishing notes

### YouTube title alternatives

- `FlyEnv MinIO Demo | Browse Releases, Install Locally & Open Console`
- `Run MinIO Locally with FlyEnv | Service Controls and MinIO Console`

**Category:** Science & Technology
**Language:** English
**Audience:** Not made for kids
**Visibility:** Public, or schedule for the product release window
**Thumbnail:** `flyenv-minio_youtube_thumbnail.png` — 1920x1080, English copy

Upload `flyenv-minio_en_subtitles.srt` as the English subtitle track. Captions are
burned into the master and the SRT remains useful for accessibility and discovery.
The seven supplied chapters are timed on the final master, including the shared opener;
each chapter meets YouTube's 10-second duration condition.

### Bilibili 备选标题

- `FlyEnv 新增 MinIO 模块：版本安装、服务管理与 Console 演示`
- `在 FlyEnv 本地安装并管理 MinIO：服务状态、访问密钥与 Console`

**分区：** 科技 → 计算机技术
**封面：** `flyenv-minio_bilibili_cover.png` — 1920x1200，中文文案

### Official references

- YouTube video details and chapters: https://support.google.com/youtube/answer/57404
- YouTube custom thumbnails: https://support.google.com/youtube/answer/72431
- YouTube tags and discovery guidance: https://support.google.com/youtube/answer/146402
- Bilibili creator center: https://member.bilibili.com/platform/home
- FlyEnv: https://www.flyenv.com
- MinIO documentation: https://min.io/docs
- MinIO Console documentation: https://min.io/docs/minio/linux/administration/minio-console.html

## Re-rendering

```bash
cd docs/task/minio-demo
python3 render.py all verify
python3 render.py tts subs mix assets verify
```

Voice: `en-US-BrianNeural` at `-6%`. Caption timings are derived from the generated
speech, while the base edit preserves the full original-speed 101.133-second recording.
