#!/usr/bin/env python3
"""Original-speed publishing pipeline for the FlyEnv ZincSearch demo.

The silent source recording remains continuous at its recorded speed through
the final healthy 0.4.5 running state.  This task wrapper adds the shared
FlyEnv header, factual English captions, Brian neural narration, real-frame
covers, and platform upload notes.

Run ``python render.py all verify`` from this directory to rebuild the package.
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
    schedule_captions,
)


DOCS = TASK.parent.parent
SLUG = "flyenv-zincsearch"
RAW_SOURCE_SHA256 = "cf777e646c9e3204b4a17327f575b9d2839b7d848af82914ca9576e1a500f904"

# Anchors are seconds in the untouched silent source.  Each caption follows a
# visible action or on-screen state, rather than inferring behavior that is not
# demonstrated in the recording.
CAPTIONS = (
    Caption(10.2, "The Version tab lists ZincSearch releases and install actions."),
    Caption(18.6, "Install ZincSearch 0.4.10 from the release list."),
    Caption(26.0, "Version 0.4.10 is installed while 0.4.5 downloads."),
    Caption(31.8, "The Service tab lists installed versions and their paths."),
    Caption(35.0, "Open the 0.4.10 folder."),
    Caption(41.0, "Start 0.4.10.", speak="Start."),
    Caption(44.6, "Configuration shows the local address and port 4080."),
    Caption(51.8, "0.4.10 is running.", speak="Running."),
    Caption(53.6, "Open the local ZincSearch interface in the browser."),
    Caption(60.0, "The local search screen opens with no data available."),
    Caption(70.0, "Return to FlyEnv and select version 0.4.5."),
    Caption(74.0, "Start version 0.4.5 from the service row."),
    Caption(80.0, "The tray menu exposes a ZincSearch service toggle."),
    Caption(84.5, "0.4.5 is running."),
)

# Replaced with the individually probed en-US-BrianNeural/-6% durations after
# the first complete render.  Retain the compact schedule so future text edits
# cannot silently push speech past the deliberately preserved final state.
MEASURED_BRIAN_MINUS_SIX_DURATIONS = (
    4.512, 5.160, 6.144, 3.912, 3.624, 0.936, 4.056,
    0.936, 3.744, 3.816, 4.896, 4.296, 4.032, 2.856,
)

BILIBILI_CHAPTERS = (
    ("0:00", "FlyEnv 开场"),
    ("0:15", "ZincSearch 版本列表"),
    ("0:30", "安装选定版本"),
    ("0:45", "服务路径与配置"),
    ("1:00", "本地 ZincSearch 界面"),
    ("1:15", "启动 ZincSearch 0.4.5"),
)

CONFIG = DemoConfig(
    task_path=TASK,
    source=DOCS / "FlyEnv-ZincSearch.mp4",
    header_source=DOCS / "flyenv-header.mp4",
    slug=SLUG,
    # Samples through 87.6s show version 0.4.5 in a healthy running state.
    # The full source is retained at 1x; only the standard final fade is added.
    cut_at=87.6,
    captions=CAPTIONS,
    narration=NarrationSettings(
        voice="en-US-BrianNeural",
        rate="-6%",
        edge_tts=str(TASK / ".venv" / "bin" / "edge-tts"),
    ),
    cover=CoverMetadata(
        youtube_title=("ZincSearch", "Local Service"),
        bilibili_title=("ZincSearch", "本地服务管理"),
        youtube_frame_at=60.0,
        bilibili_frame_at=86.2,
        youtube_body=(
            "Browse releases, install versions,",
            "manage local service controls, and",
            "open the ZincSearch interface.",
        ),
        bilibili_body=(
            "浏览版本、安装服务、管理本地实例，",
            "并打开 ZincSearch 界面。",
        ),
    ),
    upload=UploadMetadata(
        product_name="ZincSearch",
        youtube_title="ZincSearch Local Setup in FlyEnv | Install Versions, Run Service & Open UI",
        bilibili_title="FlyEnv ZincSearch 本地部署演示：安装版本、启动服务与打开界面",
        youtube_description=(
            "This original-speed FlyEnv walkthrough shows the ZincSearch module. "
            "It browses the visible release list, installs versions 0.4.10 and 0.4.5, "
            "checks installed service paths and configuration, starts the service, and opens "
            "the local ZincSearch interface in a browser.\n\n"
            "FlyEnv: https://www.flyenv.com\n"
            "ZincSearch: https://zincsearch-docs.zinc.dev/\n"
            "Source: https://github.com/xpf0000/FlyEnv\n\n"
            "English narration and captions are included."
        ),
        bilibili_description=(
            "本视频以原始录制速度演示 FlyEnv 中的 ZincSearch 模块：浏览可见版本列表，"
            "安装 0.4.10 和 0.4.5，查看已安装服务路径与配置，启动服务，并在浏览器中打开本地 ZincSearch 界面。\n\n"
            "FlyEnv 官网：https://www.flyenv.com\n"
            "ZincSearch 文档：https://zincsearch-docs.zinc.dev/\n"
            "开源地址：https://github.com/xpf0000/FlyEnv\n\n"
            "视频包含英文配音和英文字幕。"
        ),
        tags=(
            "FlyEnv", "ZincSearch", "ZincSearch tutorial", "local ZincSearch",
            "ZincSearch setup", "search engine", "local development", "developer tools",
            "service manager", "self hosted search",
        ),
        bilibili_tags=(
            "FlyEnv", "ZincSearch", "搜索引擎", "本地开发", "开发工具", "本地部署",
            "服务管理", "后端开发", "开源", "程序员",
        ),
        # Starts include the 5.033s shared header; every span, including the
        # final chapter, remains at least ten seconds on the final master.
        chapters=(
            ("0:00", "FlyEnv intro"),
            ("0:15", "ZincSearch release list"),
            ("0:30", "Install selected versions"),
            ("0:45", "Service paths and configuration"),
            ("1:00", "Local ZincSearch interface"),
            ("1:15", "Start ZincSearch 0.4.5"),
        ),
    ),
)


def strip_shared_indent(markdown: str) -> str:
    """Keep headings from the shared Markdown template flush-left."""

    prefix = "                "
    return "\n".join(
        line[len(prefix) :] if line.startswith(prefix) else line
        for line in markdown.split("\n")
    )


def chapter_seconds(timestamp: str) -> int:
    """Convert an mm:ss chapter time to seconds."""

    minutes, seconds = timestamp.split(":", maxsplit=1)
    return int(minutes) * 60 + int(seconds)


def measured_brian_minus_six_schedule() -> list[Caption]:
    """Return the observed Brian/-6% timing schedule for this narration."""

    return schedule_captions(
        CAPTIONS, MEASURED_BRIAN_MINUS_SIX_DURATIONS, CONFIG.narration.gap
    )


def measured_schedule_fits_cut() -> bool:
    """Protect the complete healthy tail from a later narration overrun."""

    return all((cue.end or 0.0) <= CONFIG.cut_at for cue in measured_brian_minus_six_schedule())


def chapters_are_publishable(header_offset: float, final_duration: float) -> bool:
    """Validate final-master chapter spacing and source-action alignment."""

    starts = [chapter_seconds(timestamp) for timestamp, _ in CONFIG.upload.chapters]
    if not starts or starts[0] != 0 or final_duration - starts[-1] < 10:
        return False
    if any(right - left < 10 for left, right in zip(starts, starts[1:])):
        return False
    raw_anchors = (None, 9.0, 24.9, 39.9, 54.9, 69.9)
    return all(
        raw is None or header_offset + raw - 1.0 <= start <= header_offset + raw + 1.0
        for start, raw in zip(starts, raw_anchors, strict=True)
    )


def bilibili_chapters_are_publishable(header_offset: float, final_duration: float) -> bool:
    """Keep the Chinese creator timeline aligned with the final master."""

    return (
        [timestamp for timestamp, _ in BILIBILI_CHAPTERS]
        == [timestamp for timestamp, _ in CONFIG.upload.chapters]
        and chapters_are_publishable(header_offset, final_duration)
    )


def verify_checkpoints(header_offset: float, final_duration: float) -> tuple[tuple[str, float], ...]:
    """Name five distinct final-master review frames tied to actual actions."""

    return (
        ("01_header.png", min(1.0, max(0.0, header_offset / 2))),
        ("02_releases_caption.png", header_offset + CAPTIONS[0].anchor + 0.15),
        ("03_configuration_caption.png", header_offset + CAPTIONS[6].anchor + 0.15),
        ("04_interface_caption.png", header_offset + CAPTIONS[8].anchor + 0.15),
        ("05_tail.png", max(0.0, final_duration - 0.9)),
    )


class ZincSearchRenderer(DemoRenderer):
    """Shared renderer with ZincSearch-specific release notes and frame names."""

    def write_upload_package(self) -> None:
        super().write_upload_package()
        self.upload_output.write_text(
            strip_shared_indent(self.upload_output.read_text(encoding="utf-8")),
            encoding="utf-8",
        )
        bilibili_timeline = "\n".join(f"{at} {title}" for at, title in BILIBILI_CHAPTERS)
        with self.upload_output.open("a", encoding="utf-8") as package:
            package.write(
                textwrap.dedent(
                    """

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
                    __BILIBILI_CHAPTERS__
                    ```

                    ### Official references

                    - YouTube video details and chapters: https://support.google.com/youtube/answer/57404
                    - YouTube custom thumbnails: https://support.google.com/youtube/answer/72431
                    - YouTube tags and discovery guidance: https://support.google.com/youtube/answer/146402
                    - Bilibili creator center: https://member.bilibili.com/platform/home
                    - FlyEnv: https://www.flyenv.com
                    - ZincSearch documentation: https://zincsearch-docs.zinc.dev/
                    - ZincSearch GitHub: https://github.com/zincsearch/zincsearch
                    """
                ).lstrip().replace("__BILIBILI_CHAPTERS__", bilibili_timeline)
            )

    def extract_verify_frames(self) -> None:
        """Extract the requested header, action, product, and tail evidence."""

        timing = self._timing()
        final_duration = self.probe_duration(self.final_output)
        for name, at in verify_checkpoints(timing["offset"], final_duration):
            self._extract_frame(self.final_output, at, self.verify_dir / name)


def normalise_stages(argv: Sequence[str]) -> list[str]:
    """Treat ``all verify`` as the documented one-command complete render."""

    return ["all"] if "all" in argv else list(argv)


def main(argv: Sequence[str] | None = None) -> None:
    ZincSearchRenderer(CONFIG).cli(normalise_stages(sys.argv[1:] if argv is None else argv))


if __name__ == "__main__":
    main()
