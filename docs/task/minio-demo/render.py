#!/usr/bin/env python3
"""Original-speed post-production pipeline for the FlyEnv MinIO demo.

The raw 101.133333-second capture stays continuous at its recorded speed.  A
tail review confirms its final service screen is healthy, so the edit keeps the
complete capture and only applies the shared renderer's short final fade.  The
shared FlyEnv opener, English captions, and Brian neural narration are added.

Run ``python render.py all verify`` from this directory to rebuild and inspect
the complete publishing package.
"""

from __future__ import annotations

import sys
import textwrap
from pathlib import Path
from typing import Sequence


TASK = Path(__file__).resolve().parent
sys.path.insert(0, str(TASK.parent / "_module-demo"))

from render_common import (  # noqa: E402
    Caption,
    CoverMetadata,
    DemoConfig,
    DemoRenderer,
    NarrationSettings,
    UploadMetadata,
)


DOCS = TASK.parent.parent
SLUG = "flyenv-minio"
RAW_SOURCE_SHA256 = "2a64d575d1c5f16b970c82796719f500375d7cfb4629a677c9c2625975df4789"

# Anchors are seconds in the untouched raw demo.  DemoRenderer measures the
# normalized shared-header duration and offsets the spoken SRT times from it.
CAPTIONS = (
    Caption(5.50, "Choose MinIO under Object Storage."),
    Caption(6.00, "MinIO opens with Service, Version, Configuration, and Log tabs."),
    Caption(10.50, "The Version tab lists the available MinIO releases."),
    Caption(16.50, "Select a release to download and install it locally."),
    Caption(21.00, "FlyEnv shows download progress in the release list."),
    Caption(28.50, "The Service tab shows installed releases and their local paths."),
    Caption(36.50, "Open Configuration to inspect the MinIO settings."),
    Caption(43.00, "The Log tab displays startup details and local endpoints."),
    Caption(51.00, "Open MinIO Console in a browser."),
    Caption(57.00, "The Console sign-in page is ready for local access."),
    Caption(61.00, "The Object Browser is available after signing in."),
    Caption(65.00, "Open Access Keys from the Console navigation."),
    Caption(68.00, "Start the visible access-key creation workflow."),
    Caption(72.00, "The confirmation dialog displays the new access key details."),
    Caption(77.00, "The Access Keys view lists the active key."),
    Caption(81.00, "Browse the available Buckets page."),
    Caption(84.00, "The IAM Policies page lists built-in policy names."),
    Caption(90.00, "Return to FlyEnv to inspect the installed MinIO releases."),
    Caption(96.00, "The final service view keeps MinIO controls in one place."),
)

CONFIG = DemoConfig(
    task_path=TASK,
    source=DOCS / "FlyEnv-Minio.mp4",
    header_source=DOCS / "flyenv-header.mp4",
    slug=SLUG,
    # Visual review through 101.100s shows a healthy final service screen;
    # therefore no unrelated/broken tail is removed from the 101.133333s raw.
    cut_at=101.133333,
    captions=CAPTIONS,
    narration=NarrationSettings(
        voice="en-US-BrianNeural",
        rate="-6%",
        edge_tts=str(TASK / ".venv" / "bin" / "edge-tts"),
    ),
    cover=CoverMetadata(
        youtube_title=("MinIO", "Local Management"),
        bilibili_title=("MinIO", "本地一键管理"),
        youtube_frame_at=90.0,
        bilibili_frame_at=84.0,
        youtube_body=(
            "Browse releases, install MinIO,",
            "open the Console, and manage",
            "the local service in FlyEnv.",
        ),
        bilibili_body=(
            "浏览官方版本、安装服务、打开 Console，",
            "在 FlyEnv 中管理本地 MinIO。",
        ),
    ),
    upload=UploadMetadata(
        product_name="MinIO",
        youtube_title="MinIO Local Setup in FlyEnv | Browse Releases, Install & Open Console",
        bilibili_title="FlyEnv MinIO 本地部署演示：浏览版本、安装服务与打开 Console",
        youtube_description=(
            "Explore the MinIO module in FlyEnv at original recording speed. "
            "Browse the available releases, install MinIO, inspect the service state, "
            "configuration, and logs, then open MinIO Console in a browser. The recording "
            "also shows Object Browser, Access Keys, Buckets, and IAM Policies views.\n\n"
            "FlyEnv: https://www.flyenv.com\n"
            "MinIO: https://min.io\n"
            "Source: https://github.com/xpf0000/FlyEnv\n\n"
            "English narration and captions are included."
        ),
        bilibili_description=(
            "以原始录制速度演示 FlyEnv 的 MinIO 模块：浏览可用版本、下载安装、"
            "查看服务状态、配置与日志，并在浏览器中打开 MinIO Console。视频还展示了"
            "对象浏览器、访问密钥、存储桶和 IAM 策略页面。\n\n"
            "FlyEnv 官网：https://www.flyenv.com\n"
            "MinIO 官网：https://min.io\n"
            "开源地址：https://github.com/xpf0000/FlyEnv\n\n"
            "视频为英文配音与英文字幕。"
        ),
        tags=(
            "FlyEnv", "MinIO", "MinIO tutorial", "local MinIO", "MinIO Console",
            "MinIO local setup", "object storage", "S3 compatible storage", "developer tools",
            "local development",
        ),
        bilibili_tags=(
            "FlyEnv", "MinIO", "对象存储", "本地开发", "开发工具", "本地部署",
            "后端开发", "S3", "开源", "程序员",
        ),
        # These final-master chapter times include the shared opener.  Every
        # chapter interval is at least 15 seconds, exceeding YouTube's 10s bar.
        chapters=(
            ("0:00", "FlyEnv intro"),
            ("0:15", "Browse MinIO releases"),
            ("0:30", "Install and inspect service state"),
            ("0:45", "Configuration and service log"),
            ("1:00", "Open MinIO Console"),
            ("1:15", "Access keys, buckets, and IAM policies"),
            ("1:30", "Final MinIO service state"),
        ),
    ),
)


def strip_shared_indent(markdown: str) -> str:
    """Keep interpolated upload copy from turning shared headings into code blocks."""

    prefix = "                "
    return "\n".join(
        line[len(prefix) :] if line.startswith(prefix) else line
        for line in markdown.split("\n")
    )


def verify_checkpoints(header_offset: float, final_duration: float) -> tuple[tuple[str, float], ...]:
    """Name distinct final-master evidence frames for package review."""

    return (
        ("01_header.png", min(1.0, max(0.0, header_offset / 2))),
        ("02_opening_caption.png", header_offset + CAPTIONS[0].anchor + 0.15),
        ("03_service_caption.png", header_offset + CAPTIONS[5].anchor + 0.15),
        ("04_product_caption.png", header_offset + CAPTIONS[8].anchor + 0.15),
        ("05_tail.png", max(0.0, final_duration - 0.9)),
    )


class MinioRenderer(DemoRenderer):
    """Shared renderer with MinIO release-copy and explicit evidence frames."""

    def write_upload_package(self) -> None:
        super().write_upload_package()
        self.upload_output.write_text(
            strip_shared_indent(self.upload_output.read_text(encoding="utf-8")),
            encoding="utf-8",
        )
        with self.upload_output.open("a", encoding="utf-8") as package:
            package.write(
                textwrap.dedent(
                    """

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
                    each chapter interval is at least 15 seconds.

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
                    """
                ).lstrip()
            )

    def extract_verify_frames(self) -> None:
        """Extract exactly the five requested named review checkpoints."""

        timing = self._timing()
        final_duration = self.probe_duration(self.final_output)
        for name, at in verify_checkpoints(timing["offset"], final_duration):
            self._extract_frame(self.final_output, at, self.verify_dir / name)


def normalise_stages(argv: Sequence[str]) -> list[str]:
    """Treat ``all verify`` as the documented complete-pipeline invocation."""

    return ["all"] if "all" in argv else list(argv)


def main(argv: Sequence[str] | None = None) -> None:
    MinioRenderer(CONFIG).cli(normalise_stages(sys.argv[1:] if argv is None else argv))


if __name__ == "__main__":
    main()
