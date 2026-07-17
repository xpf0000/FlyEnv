# FlyEnv Feature Overview Publishing Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a ready-to-paste YouTube/Bilibili publishing document and two verified platform-language cover images for the completed FlyEnv feature overview video.

**Architecture:** Keep all generated publishing assets beside the final video in `docs/task/flyenv-feature-overview/`. A task-local shell script extracts subtitle-free real UI frames and uses ImageMagick for deterministic cover composition; a standard-library Python validator checks the Markdown package, chapter timing, output dimensions, formats, and file sizes.

**Tech Stack:** Markdown, Bash, FFmpeg/ffprobe, ImageMagick 7, Python 3 standard library

---

## File Map

- Create `docs/task/flyenv-feature-overview/publishing-package.md` — ready-to-paste YouTube and Bilibili metadata.
- Create `docs/task/flyenv-feature-overview/render-publishing-assets.sh` — deterministic real-frame cover renderer.
- Create `docs/task/flyenv-feature-overview/validate_publishing_assets.py` — metadata, chapter, and image validation.
- Create `docs/task/flyenv-feature-overview/flyenv_feature_overview_youtube_thumbnail.jpg` — English YouTube cover.
- Create `docs/task/flyenv-feature-overview/flyenv_feature_overview_bilibili_cover.jpg` — Chinese Bilibili cover.
- Create `docs/task/flyenv-feature-overview/publishing-assets/` — extracted source frames and small verification previews.
- Modify `docs/task/flyenv-feature-overview/README.md` — add publishing asset paths and rebuild command.

### Task 1: Add the Publishing Asset Validator

**Files:**
- Create: `docs/task/flyenv-feature-overview/validate_publishing_assets.py`

- [ ] **Step 1: Write the validator before creating the assets**

Create a standard-library Python script with these checks:

```python
#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PACKAGE = ROOT / "publishing-package.md"
YOUTUBE = ROOT / "flyenv_feature_overview_youtube_thumbnail.jpg"
BILIBILI = ROOT / "flyenv_feature_overview_bilibili_cover.jpg"
FINAL_DURATION = 779.4
MAX_IMAGE_BYTES = 2_000_000

REQUIRED_TEXT = (
    "FlyEnv Feature Overview | Native Local Development Without Docker",
    "FlyEnv 功能总览：无需 Docker 的原生本地开发环境",
    "https://www.flyenv.com",
    "https://github.com/xpf0000/FlyEnv",
    "https://github.com/xpf0000/FlyEnv/releases",
    "English narration and English subtitles",
    "英文旁白和英文字幕",
)


def timestamp_seconds(value: str) -> int:
    minutes, seconds = map(int, value.split(":"))
    return minutes * 60 + seconds


def validate_chapters(text: str, heading: str) -> None:
    section = text.split(heading, 1)[1].split("## ", 1)[0]
    values = re.findall(r"^- `(\d{2}:\d{2})` ", section, re.MULTILINE)
    assert values, f"no chapters found below {heading}"
    seconds = [timestamp_seconds(value) for value in values]
    assert seconds[0] == 0, f"{heading} must begin at 00:00"
    assert seconds == sorted(set(seconds)), f"{heading} chapters are not strictly increasing"
    assert seconds[-1] < FINAL_DURATION, f"{heading} chapter exceeds final duration"


def identify(path: Path) -> tuple[int, int, str]:
    output = subprocess.check_output(
        ["magick", "identify", "-format", "%w %h %m", str(path)], text=True
    )
    width, height, image_format = output.split()
    return int(width), int(height), image_format


def validate_image(path: Path) -> None:
    assert path.is_file(), f"missing image: {path.name}"
    width, height, image_format = identify(path)
    assert (width, height) == (1280, 720), f"wrong dimensions for {path.name}"
    assert image_format.upper() == "JPEG", f"wrong format for {path.name}: {image_format}"
    assert path.stat().st_size < MAX_IMAGE_BYTES, f"{path.name} is 2 MB or larger"


def main() -> None:
    assert PACKAGE.is_file(), "missing publishing-package.md"
    text = PACKAGE.read_text(encoding="utf-8")
    for value in REQUIRED_TEXT:
        assert value in text, f"missing required package text: {value}"
    validate_chapters(text, "### YouTube Chapters")
    validate_chapters(text, "### Bilibili 章节")
    validate_image(YOUTUBE)
    validate_image(BILIBILI)
    assert hashlib.sha256(YOUTUBE.read_bytes()).digest() != hashlib.sha256(
        BILIBILI.read_bytes()
    ).digest(), "platform covers must not be identical"
    print("publishing_assets_validation=passed")
    print(f"youtube_bytes={YOUTUBE.stat().st_size}")
    print(f"bilibili_bytes={BILIBILI.stat().st_size}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the validator and confirm the expected failure**

Run:

```bash
python3 docs/task/flyenv-feature-overview/validate_publishing_assets.py
```

Expected: failure with `AssertionError: missing publishing-package.md` because no publishing assets have been created yet.

- [ ] **Step 3: Commit the validation contract**

```bash
git add docs/task/flyenv-feature-overview/validate_publishing_assets.py
git commit -m "test: validate FlyEnv publishing assets" -- docs/task/flyenv-feature-overview/validate_publishing_assets.py
```

### Task 2: Write the YouTube and Bilibili Publishing Package

**Files:**
- Create: `docs/task/flyenv-feature-overview/publishing-package.md`

- [ ] **Step 1: Write the shared delivery section**

Start the document with the final upload file and official FlyEnv destinations:

```markdown
# FlyEnv Feature Overview — Publishing Package

## Shared Upload File

- Video: `flyenv_feature_overview_en_final.mp4`
- Duration: `12:59` (`779.400` seconds)
- Video: H.264, 1920x1080, 30fps
- Audio: AAC, English narration
- Subtitles: burned English subtitles; external SRT also available

Official links:

- Website: https://www.flyenv.com
- GitHub: https://github.com/xpf0000/FlyEnv
- Releases: https://github.com/xpf0000/FlyEnv/releases
- Documentation: https://www.flyenv.com/guide/
- Discord: https://discord.gg/u5SuMGxjPE
```

- [ ] **Step 2: Add the complete YouTube metadata**

Use this recommended title and two alternatives:

```text
FlyEnv Feature Overview | Native Local Development Without Docker
FlyEnv: All-in-One Native Local Dev Environment (No Docker)
Manage Runtimes, Databases, Sites & Tools with FlyEnv | Full Demo
```

The English description must open with the core search terms, explain the visible features, link to the official destinations, and include this chapter list:

```markdown
### YouTube Chapters

- `00:00` FlyEnv intro and product overview
- `00:44` Show or hide modules for a focused workspace
- `02:31` Browse and download multiple module versions
- `04:18` Manage installed versions and start services
- `05:42` Build reusable project startup groups
- `09:40` Configure and open local sites
- `10:22` Switch languages and themes
- `10:44` Use the built-in developer toolbox
- `12:31` Summary
```

Include a focused keyword list containing FlyEnv, local development environment, native development environment, no Docker, Docker alternative, runtime manager, PHP, Node.js, Python, MySQL, PostgreSQL, Redis, Nginx, Apache, version manager, startup groups, local sites, developer tools, Windows development, macOS development, and Linux development. Recommend `Science & Technology` and use no more than three hashtags in the description footer: `#FlyEnv #WebDevelopment #DeveloperTools`.

- [ ] **Step 3: Add the complete Bilibili metadata**

Use this recommended title and two alternatives:

```text
FlyEnv 功能总览：无需 Docker 的原生本地开发环境
一个应用管理 PHP、Node.js、数据库和本地站点｜FlyEnv
FlyEnv 完整演示：多版本、服务、启动组、站点与开发工具
```

The Chinese description must state `本视频使用英文旁白和英文字幕`, describe the same demonstrated features in natural Chinese, include the official links, and use this chapter list:

```markdown
### Bilibili 章节

- `00:00` FlyEnv 片头与产品概览
- `00:44` 按需显示或隐藏模块
- `02:31` 浏览并下载不同模块版本
- `04:18` 管理已安装版本并启动服务
- `05:42` 创建可复用的项目启动组
- `09:40` 配置并打开本地站点
- `10:22` 切换界面语言和主题
- `10:44` 使用内置开发工具箱
- `12:31` 功能总结
```

Recommend `科技 > 软件应用`, with `知识 > 计算机技术` as an alternate section. Include focused Chinese tags for FlyEnv、本地开发环境、开发环境、无需Docker、Docker替代、PHP、Node.js、Python、MySQL、PostgreSQL、Redis、Nginx、版本管理、启动组、本地站点 and 开发工具.

- [ ] **Step 4: Add cover paths, upload checklist, and official platform references**

Record both cover filenames, a checklist for video/cover/title/description/category/subtitle verification, and these official reference URLs:

```text
https://support.google.com/youtube/answer/57407?hl=en
https://support.google.com/youtube/answer/146402?hl=en
https://support.google.com/youtube/answer/72431?hl=en
https://member.bilibili.com/platform/upload/video/frame
```

- [ ] **Step 5: Check the package text and expected remaining failure**

Run:

```bash
python3 docs/task/flyenv-feature-overview/validate_publishing_assets.py
```

Expected: the package text and chapters are accepted, then validation fails with `missing image: flyenv_feature_overview_youtube_thumbnail.jpg`.

- [ ] **Step 6: Commit the publishing document**

```bash
git add docs/task/flyenv-feature-overview/publishing-package.md
git commit -m "docs: add FlyEnv upload metadata" -- docs/task/flyenv-feature-overview/publishing-package.md
```

### Task 3: Render the English and Chinese Covers

**Files:**
- Create: `docs/task/flyenv-feature-overview/render-publishing-assets.sh`
- Create: `docs/task/flyenv-feature-overview/publishing-assets/service-frame.png`
- Create: `docs/task/flyenv-feature-overview/publishing-assets/startup-group-frame.png`
- Create: `docs/task/flyenv-feature-overview/publishing-assets/youtube-preview.jpg`
- Create: `docs/task/flyenv-feature-overview/publishing-assets/bilibili-preview.jpg`
- Create: `docs/task/flyenv-feature-overview/flyenv_feature_overview_youtube_thumbnail.jpg`
- Create: `docs/task/flyenv-feature-overview/flyenv_feature_overview_bilibili_cover.jpg`

- [ ] **Step 1: Write the deterministic rendering script**

Use the subtitle-free base video and real repository branding:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$ROOT/../../.." && pwd)"
BASE="$ROOT/flyenv_feature_overview_base_edited_1080p.mp4"
ASSETS="$ROOT/publishing-assets"
SERVICE_FRAME="$ASSETS/service-frame.png"
STARTUP_FRAME="$ASSETS/startup-group-frame.png"
ICON="$PROJECT_ROOT/build/icons/512x512.png"
WORDMARK="$PROJECT_ROOT/docs/task/flyenv-header-standardization/flyenv-wordmark.png"
YOUTUBE="$ROOT/flyenv_feature_overview_youtube_thumbnail.jpg"
BILIBILI="$ROOT/flyenv_feature_overview_bilibili_cover.jpg"
EN_FONT="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
ZH_FONT="/System/Library/Fonts/Hiragino Sans GB.ttc"

mkdir -p "$ASSETS"

ffmpeg -y -hide_banner -loglevel error -ss 280 -i "$BASE" -frames:v 1 "$SERVICE_FRAME"
ffmpeg -y -hide_banner -loglevel error -ss 350 -i "$BASE" -frames:v 1 "$STARTUP_FRAME"

render_cover() {
  local output="$1"
  local font="$2"
  local line_one="$3"
  local line_two="$4"
  local badge="$5"

  magick "$SERVICE_FRAME" \
    -resize '1280x720^' -gravity center -extent 1280x720 \
    -fill 'rgba(3,7,18,0.86)' -draw 'rectangle 0,0 620,720' \
    -fill 'rgba(3,7,18,0.24)' -draw 'rectangle 620,0 1280,720' \
    \( "$ICON" -resize 78x78 \) -gravity northwest -geometry +70+54 -composite \
    \( "$WORDMARK" -resize 190x \) -gravity northwest -geometry +170+62 -composite \
    \( "$STARTUP_FRAME" -resize '470x264^' -gravity center -extent 470x264 \
       -bordercolor '#52b7ff' -border 3x3 \) \
       -gravity northwest -geometry +748+386 -composite \
    -gravity northwest -font "$font" -fill white -pointsize 66 \
    -annotate +70+225 "$line_one" \
    -fill '#52b7ff' -annotate +70+310 "$line_two" \
    -fill 'rgba(22,45,78,0.96)' -draw 'roundrectangle 70,440 540,505 16,16' \
    -font "$font" -fill white -pointsize 27 -annotate +94+484 "$badge" \
    -strip -quality 90 "$output"
}

render_cover "$YOUTUBE" "$EN_FONT" 'LOCAL DEV.' 'SIMPLIFIED' 'NATIVE · NO DOCKER'
render_cover "$BILIBILI" "$ZH_FONT" '本地开发' '一个应用' '原生运行 · 无需 Docker'

magick "$YOUTUBE" -resize 320x180 -quality 86 "$ASSETS/youtube-preview.jpg"
magick "$BILIBILI" -resize 320x180 -quality 86 "$ASSETS/bilibili-preview.jpg"

magick identify -format '%f %wx%h %m %b\n' "$YOUTUBE" "$BILIBILI"
```

- [ ] **Step 2: Make the renderer executable and generate both covers**

Run:

```bash
chmod +x docs/task/flyenv-feature-overview/render-publishing-assets.sh
docs/task/flyenv-feature-overview/render-publishing-assets.sh
```

Expected: both output lines report `1280x720 JPEG`, and each file is below 2 MB.

- [ ] **Step 3: Run the automated validation**

Run:

```bash
python3 docs/task/flyenv-feature-overview/validate_publishing_assets.py
```

Expected:

```text
publishing_assets_validation=passed
youtube_bytes=<positive integer below 2000000>
bilibili_bytes=<positive integer below 2000000>
```

- [ ] **Step 4: Inspect the full-size covers and small previews**

Open these files with the local image viewer:

```text
docs/task/flyenv-feature-overview/flyenv_feature_overview_youtube_thumbnail.jpg
docs/task/flyenv-feature-overview/flyenv_feature_overview_bilibili_cover.jpg
docs/task/flyenv-feature-overview/publishing-assets/youtube-preview.jpg
docs/task/flyenv-feature-overview/publishing-assets/bilibili-preview.jpg
```

Expected: both headlines and benefit labels remain legible at 320x180; the service UI and startup-group inset remain recognizable; neither cover contains burned subtitles, fake UI, clipped text, or platform logos.

- [ ] **Step 5: Commit the renderer and generated covers**

```bash
git add \
  docs/task/flyenv-feature-overview/render-publishing-assets.sh \
  docs/task/flyenv-feature-overview/publishing-assets \
  docs/task/flyenv-feature-overview/flyenv_feature_overview_youtube_thumbnail.jpg \
  docs/task/flyenv-feature-overview/flyenv_feature_overview_bilibili_cover.jpg
git commit -m "feat: add FlyEnv video covers" -- \
  docs/task/flyenv-feature-overview/render-publishing-assets.sh \
  docs/task/flyenv-feature-overview/publishing-assets \
  docs/task/flyenv-feature-overview/flyenv_feature_overview_youtube_thumbnail.jpg \
  docs/task/flyenv-feature-overview/flyenv_feature_overview_bilibili_cover.jpg
```

### Task 4: Document and Verify the Final Publishing Package

**Files:**
- Modify: `docs/task/flyenv-feature-overview/README.md`

- [ ] **Step 1: Add a Publishing Assets section to the task README**

Document the package, both covers, and the rebuild/validation commands:

```markdown
## Publishing assets

- `publishing-package.md` — ready-to-paste YouTube and Bilibili metadata
- `flyenv_feature_overview_youtube_thumbnail.jpg` — English 1280x720 YouTube thumbnail
- `flyenv_feature_overview_bilibili_cover.jpg` — Chinese 1280x720 Bilibili cover
- `render-publishing-assets.sh` — rebuilds both covers from real subtitle-free video frames
- `validate_publishing_assets.py` — checks required metadata, chapters, dimensions, formats, and sizes

Rebuild and verify:

```bash
docs/task/flyenv-feature-overview/render-publishing-assets.sh
python3 docs/task/flyenv-feature-overview/validate_publishing_assets.py
```
```

- [ ] **Step 2: Run fresh final verification**

Run:

```bash
python3 docs/task/flyenv-feature-overview/validate_publishing_assets.py
git diff --check -- \
  docs/task/flyenv-feature-overview/README.md \
  docs/task/flyenv-feature-overview/publishing-package.md \
  docs/task/flyenv-feature-overview/render-publishing-assets.sh \
  docs/task/flyenv-feature-overview/validate_publishing_assets.py
```

Expected: `publishing_assets_validation=passed` and no `git diff --check` output.

- [ ] **Step 3: Verify the task-only repository scope**

Run:

```bash
git status --short -- \
  docs/task/flyenv-feature-overview \
  docs/superpowers/specs/2026-07-17-flyenv-feature-overview-publishing-assets-design.md \
  docs/superpowers/plans/2026-07-17-flyenv-feature-overview-publishing-assets.md
```

Expected: only approved task assets and documentation are listed; unrelated existing worktree changes remain untouched.

- [ ] **Step 4: Commit the README and validator**

```bash
git add \
  docs/task/flyenv-feature-overview/README.md \
  docs/task/flyenv-feature-overview/validate_publishing_assets.py
git commit -m "docs: finalize FlyEnv publishing package" -- \
  docs/task/flyenv-feature-overview/README.md \
  docs/task/flyenv-feature-overview/validate_publishing_assets.py
```
