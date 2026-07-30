#!/usr/bin/env python3
"""Original-speed post-production pipeline for the FlyEnv Meilisearch demo.

The raw capture is kept continuous at its original speed.  It is only trimmed
at 163.6 seconds, immediately before the capture's terminal sliver, then the
shared FlyEnv opener, English captions, and Brian neural narration are added.

Run ``python render.py all verify`` from this directory to rebuild and inspect
the complete package.  Individual stages (for example ``tts subs mix``) remain
available through the reusable renderer.
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
SLUG = "flyenv-meilisearch"

# Anchors are raw-demo seconds. DemoRenderer probes the normalized shared-header
# offset dynamically before these become final caption and SRT timings.
CAPTIONS = (
    Caption(0.60, "Manage Meilisearch from the FlyEnv desktop app."),
    Caption(5.40, "Choose Meilisearch from the Search Engine section."),
    Caption(10.80, "The Version tab lists the available Meilisearch releases."),
    Caption(17.20, "Each release shows its version and an install action."),
    Caption(24.00, "Select a release to download and install it locally."),
    Caption(32.00, "FlyEnv shows download progress directly in the release list."),
    Caption(43.50, "When the download completes, the installed release is ready to use."),
    Caption(57.00, "Add another release from the same version list."),
    Caption(95.00, "The Service tab lists installed versions and their local paths."),
    Caption(101.00, "Configuration opens the Meilisearch settings in FlyEnv's built-in editor."),
    Caption(114.00, "The Log tab displays the service output."),
    Caption(124.00, "The Mini Dashboard opens the local Meilisearch interface in the browser."),
    Caption(138.00, "Back in FlyEnv, installed versions, environment, and service controls stay together."),
    Caption(149.00, "Start the selected version and confirm its running state."),
    Caption(157.00, "The final view keeps the Meilisearch service controls within reach."),
)

CONFIG = DemoConfig(
    task_path=TASK,
    source=DOCS / "FlyEnv-Meilisearch.mp4",
    header_source=DOCS / "flyenv-header.mp4",
    slug=SLUG,
    # Exact tail sampling shows a healthy FlyEnv service view through 163s.
    # This excludes only the incomplete terminal sliver of the raw capture.
    cut_at=163.6,
    captions=CAPTIONS,
    narration=NarrationSettings(
        voice="en-US-BrianNeural",
        rate="-6%",
        edge_tts=str(TASK / ".venv" / "bin" / "edge-tts"),
    ),
    cover=CoverMetadata(
        youtube_title=("Meilisearch", "Local Service"),
        bilibili_title=("Meilisearch", "本地一键管理"),
        youtube_frame_at=149.0,
        bilibili_frame_at=128.0,
        youtube_body=(
            "Browse releases, install versions,",
            "run a local service, and open",
            "the Mini Dashboard from FlyEnv.",
        ),
        bilibili_body=(
            "浏览版本、安装服务、启动本地实例，",
            "并从 FlyEnv 打开 Mini Dashboard。",
        ),
    ),
    upload=UploadMetadata(
        product_name="Meilisearch",
        youtube_title="Meilisearch Local Setup in FlyEnv | Install, Run & Open Mini Dashboard",
        bilibili_title="FlyEnv Meilisearch 本地部署演示：安装、启动与 Mini Dashboard",
        youtube_description=(
            "Explore the Meilisearch module in FlyEnv at original recording speed. "
            "Browse the available releases, install versions, use the service controls, "
            "inspect configuration and logs, and open the Mini Dashboard in a browser.\n\n"
            "FlyEnv: https://www.flyenv.com\n"
            "Meilisearch: https://www.meilisearch.com\n"
            "Source: https://github.com/xpf0000/FlyEnv\n\n"
            "English narration and captions are included."
        ),
        bilibili_description=(
            "以原始录制速度演示 FlyEnv 的 Meilisearch 模块：浏览可用版本、下载安装、"
            "使用服务控制、查看配置与日志，并在浏览器中打开 Mini Dashboard。\n\n"
            "FlyEnv 官网：https://www.flyenv.com\n"
            "Meilisearch 官网：https://www.meilisearch.com\n"
            "开源地址：https://github.com/xpf0000/FlyEnv\n\n"
            "视频为英文配音与英文字幕。"
        ),
        tags=(
            "FlyEnv", "Meilisearch", "Meilisearch tutorial", "local Meilisearch",
            "Meilisearch local setup", "Mini Dashboard", "local search engine",
            "developer tools", "local development", "macOS development",
        ),
        bilibili_tags=(
            "FlyEnv", "Meilisearch", "搜索引擎", "本地开发", "开发工具",
            "本地部署", "后端开发", "开源", "程序员", "macOS",
        ),
        chapters=(
            ("0:00", "Open FlyEnv and choose Meilisearch"),
            ("0:20", "Browse official release list"),
            ("0:45", "Download and install a release"),
            ("1:10", "Add another release"),
            ("1:35", "Installed files and service controls"),
            ("1:55", "Configuration and service log"),
            ("2:15", "Open Mini Dashboard in browser"),
            ("2:35", "Final service state"),
        ),
    ),
)


def strip_shared_indent(markdown: str) -> str:
    """Keep interpolated upload copy from turning shared headings into code blocks."""

    prefix = "                "
    return "\n".join(
        line[len(prefix):] if line.startswith(prefix) else line
        for line in markdown.split("\n")
    )


def verify_checkpoints(header_offset: float, final_duration: float) -> tuple[tuple[str, float], ...]:
    """Name distinct final-master frames for the publishing-package review."""

    return (
        ("01_header.png", min(1.0, max(0.0, header_offset / 2))),
        ("02_opening_caption.png", header_offset + CAPTIONS[0].anchor + 0.15),
        ("03_service_caption.png", header_offset + CAPTIONS[8].anchor + 0.15),
        ("04_product_caption.png", header_offset + CAPTIONS[11].anchor + 0.15),
        ("05_tail.png", max(0.0, final_duration - 0.9)),
    )


class MeilisearchRenderer(DemoRenderer):
    """Keep shared rendering behavior while adding platform-ready release notes."""

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

                    - `FlyEnv Meilisearch Demo | Install Releases, Run a Local Service & Mini Dashboard`
                    - `Run Meilisearch Locally with FlyEnv | Versions, Service Controls & Mini Dashboard`

                    **Category:** Science & Technology
                    **Language:** English
                    **Audience:** Not made for kids
                    **Visibility:** Public (or schedule to the release window)
                    **Thumbnail:** `flyenv-meilisearch_youtube_thumbnail.png` — 1920x1080, English copy

                    Upload `flyenv-meilisearch_en_subtitles.srt` as the English subtitle track.  The
                    captions are already burned into the final master, while the SRT remains useful for
                    accessibility and search.

                    ### Bilibili 备选标题

                    - `FlyEnv 新增 Meilisearch 模块：版本安装、服务管理与 Mini Dashboard`
                    - `不用手动切命令：在 FlyEnv 本地安装并启动 Meilisearch`

                    **分区：** 科技 → 计算机技术
                    **封面：** `flyenv-meilisearch_bilibili_cover.png` — 1920x1200，中文文案

                    ### Official platform references

                    - YouTube video details and chapters: https://support.google.com/youtube/answer/57404
                    - YouTube custom thumbnails: https://support.google.com/youtube/answer/72431
                    - YouTube tags and discovery guidance: https://support.google.com/youtube/answer/146402
                    - Bilibili creator center: https://member.bilibili.com/platform/home
                    - FlyEnv: https://www.flyenv.com
                    - Meilisearch documentation: https://www.meilisearch.com/docs
                    """
                ).lstrip()
            )

    def extract_verify_frames(self) -> None:
        """Use explicit, distinct checkpoints instead of generic renderer samples."""

        timing = self._timing()
        final_duration = self.probe_duration(self.final_output)
        for name, at in verify_checkpoints(timing["offset"], final_duration):
            self._extract_frame(self.final_output, at, self.verify_dir / name)


def normalise_stages(argv: Sequence[str]) -> list[str]:
    """Treat ``all verify`` as the documented complete pipeline invocation."""

    return ["all"] if "all" in argv else list(argv)


def main(argv: Sequence[str] | None = None) -> None:
    MeilisearchRenderer(CONFIG).cli(normalise_stages(sys.argv[1:] if argv is None else argv))


if __name__ == "__main__":
    main()
