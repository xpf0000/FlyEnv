# FlyEnv Feature Overview Publishing Assets Design

**Date:** 2026-07-17

## Goal

Prepare a platform-specific publishing package for the completed FlyEnv feature overview video. The package must provide ready-to-paste titles, descriptions, keywords, chapters, category recommendations, and separate English and Chinese cover images for YouTube and Bilibili.

## Audience and Language

- YouTube targets an international developer audience with English metadata and an English cover.
- Bilibili targets Chinese-speaking developers with Chinese metadata and a Chinese cover.
- Both platforms use the existing English-narrated, English-subtitled final video.
- The Bilibili description explicitly states that the video contains English narration and English subtitles.

## Positioning

Use an official product-overview position rather than presenting the video as a Docker comparison or a step-by-step tutorial. The primary promise is that FlyEnv brings runtimes, databases, web servers, sites, startup groups, and developer tools into one native desktop workspace. “No Docker required” is a supporting benefit, not the entire topic.

Recommended titles:

- YouTube: `FlyEnv Feature Overview | Native Local Development Without Docker`
- Bilibili: `FlyEnv 功能总览：无需 Docker 的原生本地开发环境`

Each platform section also includes two or three alternate titles so the uploader can adjust emphasis without rewriting the package.

## Publishing Document

Create `docs/task/flyenv-feature-overview/publishing-package.md` with these sections:

1. Shared video file and product links
2. YouTube recommended title and alternate titles
3. YouTube complete English description
4. YouTube chapters, keywords, hashtags, category, and thumbnail path
5. Bilibili recommended title and alternate titles
6. Bilibili complete Chinese description
7. Bilibili chapters, keywords, hashtags, recommended section, and cover path
8. Upload checklist and platform-reference links

Chapters are calculated against the final 779.4-second video, including the 5.085-second FlyEnv header. The first chapter starts at `00:00` and the remaining timestamps follow the actual narration sections: overview, module visibility, version management, service management, startup groups, sites, language and themes, built-in tools, and summary.

Descriptions place the strongest product and search terms in the first two sentences, then summarize the demonstrated features. They include the official website, GitHub repository, releases page, documentation, Discord, and the platform-specific chapter list.

## Cover Design

Create two 1280x720 JPG files under `docs/task/flyenv-feature-overview/`:

- `flyenv_feature_overview_youtube_thumbnail.jpg`
- `flyenv_feature_overview_bilibili_cover.jpg`

Both covers use real frames from the completed FlyEnv demo. The service-management screen is the main background because it shows module breadth and active services. A smaller startup-group wizard frame reinforces project orchestration. The composition must not invent or regenerate product UI.

Visual structure:

- dark navy gradient panel for high-contrast text
- FlyEnv wordmark or icon near the top
- large two-line platform-language headline
- small cyan-accent benefit label
- real UI remains recognizable on the right side
- no YouTube or Bilibili platform logos

Copy:

- YouTube headline: `LOCAL DEV.` / `SIMPLIFIED`
- YouTube benefit label: `NATIVE · NO DOCKER`
- Bilibili headline: `本地开发` / `一个应用`
- Bilibili benefit label: `原生运行 · 无需 Docker`

Each JPG must stay below 2 MB and remain readable when reduced to a small thumbnail.

## Implementation

Use FFmpeg to extract clean frames from the existing final video and ImageMagick to resize, crop, composite, and render text. Reuse the repository's existing FlyEnv wordmark or app icon. Save the rendering script in the task directory so both covers can be rebuilt without manually editing image files.

The final cover source frames must not contain burned subtitles. Extract frames from moments between subtitle intervals or use the subtitle-free base video at equivalent content timestamps.

## Verification

- Confirm the publishing document contains both platform sections and every required metadata field.
- Confirm recommended titles remain comfortably within common platform title limits.
- Confirm chapter timestamps are increasing, start at `00:00`, and do not exceed the final duration.
- Confirm both covers are exactly 1280x720 JPG and under 2 MB.
- Inspect both covers at full size and at a small preview size for text clarity, real-UI accuracy, and balanced cropping.
- Confirm only task-specific publishing assets and the approved design/plan documents are added or changed.

## Out of Scope

- Uploading or scheduling the video
- Re-editing the final video, narration, or subtitles
- Creating Chinese narration or Chinese burned subtitles
- Producing AI-generated product UI
- Creating short-form clips or additional social media assets
