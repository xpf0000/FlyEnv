#!/usr/bin/env python3
"""Original-speed publishing pipeline for the FlyEnv Typesense screen demo.

The silent raw capture remains continuous at its recorded speed through the
healthy final Typesense service screen.  The shared FlyEnv header, concise
English captions, Brian neural narration, platform covers, and upload notes
are generated around that unmodified workflow.

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
SLUG = "flyenv-typesense"
RAW_SOURCE_SHA256 = "f816e33bdcf6328506e8d502a472c9812a10c6194e69b35fe83c8bd395804ee3"

# Anchors are seconds in the untouched raw capture.  Every line describes a
# visible UI action or on-screen result; none is inferred from the silent video.
CAPTIONS = (
    Caption(3.60, "The Typesense Version tab lists the available releases."),
    Caption(7.20, "An installed release is marked in the version list."),
    Caption(10.80, "Another Typesense release shows its install action."),
    Caption(15.20, "The Service tab lists installed versions and local paths."),
    Caption(18.80, "Open Configuration to inspect the Typesense server settings."),
    Caption(22.40, "The Log tab shows the Typesense startup output."),
    Caption(28.20, "The service log reports Typesense listening on port 8108."),
    Caption(41.20, "A local raft status page opens in the browser."),
    Caption(44.60, "The raft page shows the default group as leader."),
    Caption(50.80, "Open the vars page to inspect process values."),
    Caption(59.80, "The flags page lists runtime options and descriptions."),
    Caption(63.20, "The RPC page offers optional recent-call tracking."),
    Caption(66.20, "The heap page reports that the profiler is not enabled."),
    Caption(69.20, "The local page links its status and health routes."),
    Caption(75.20, "Return to the Typesense service tab."),
    Caption(81.60, "The service list refreshes the installed releases."),
    Caption(85.30, "The release is running."),
)

# Measured from the task-local en-US-BrianNeural -6% render.  Keep this compact
# evidence schedule with the wrapper so an edit to the narration cannot quietly
# overrun the deliberately retained healthy tail.
MEASURED_BRIAN_MINUS_SIX_DURATIONS = (
    3.960, 3.552, 3.816, 4.104, 4.224, 3.456, 5.040, 3.768, 3.528,
    3.456, 4.200, 3.936, 3.816, 3.600, 2.832, 3.768, 1.800,
)

CONFIG = DemoConfig(
    task_path=TASK,
    source=DOCS / "FlyEnv-Typesense.mp4",
    header_source=DOCS / "flyenv-header.mp4",
    slug=SLUG,
    # Tail samples through 87.5s remain on the selected Typesense service with
    # a running control, so retain the complete 88.033333-second capture.
    cut_at=88.033333,
    captions=CAPTIONS,
    narration=NarrationSettings(
        voice="en-US-BrianNeural",
        rate="-6%",
        edge_tts=str(TASK / ".venv" / "bin" / "edge-tts"),
    ),
    cover=CoverMetadata(
        youtube_title=("Typesense", "Service Controls"),
        bilibili_title=("Typesense", "本地服务管理"),
        youtube_frame_at=85.3,
        bilibili_frame_at=15.2,
        youtube_body=(
            "Browse releases, inspect startup logs,",
            "open local status pages, and return",
            "to the running Typesense service.",
        ),
        bilibili_body=(
            "浏览版本、查看启动日志，打开本地状态页，",
            "然后返回运行中的 Typesense 服务。",
        ),
    ),
    upload=UploadMetadata(
        product_name="Typesense",
        youtube_title="Typesense in FlyEnv | Browse Releases, Inspect Logs & Check Local Status",
        bilibili_title="FlyEnv Typesense 本地服务演示：版本、日志与状态页面",
        youtube_description=(
            "This original-speed recording follows the Typesense module in FlyEnv. "
            "It browses the visible releases and installed states, inspects the service, "
            "configuration, and startup log, then opens the local raft status, vars, flags, "
            "and RPC pages before returning to the running service.\n\n"
            "FlyEnv: https://www.flyenv.com\n"
            "Typesense documentation: https://typesense.org/docs/\n"
            "Source: https://github.com/xpf0000/FlyEnv\n\n"
            "English narration and captions are included."
        ),
        bilibili_description=(
            "本视频以原始录制速度演示 FlyEnv 中的 Typesense 模块：浏览可见版本和已安装状态，"
            "查看服务、配置与启动日志，然后在浏览器打开本地 raft 状态、vars、flags 和 RPC 页面，"
            "最后返回正在运行的服务。\n\n"
            "FlyEnv 官网：https://www.flyenv.com\n"
            "Typesense 文档：https://typesense.org/docs/\n"
            "开源地址：https://github.com/xpf0000/FlyEnv\n\n"
            "视频包含英文配音和英文字幕。"
        ),
        tags=(
            "FlyEnv", "Typesense", "Typesense tutorial", "local Typesense", "Typesense setup",
            "Typesense server", "search engine", "local development", "developer tools", "service logs",
        ),
        bilibili_tags=(
            "FlyEnv", "Typesense", "搜索引擎", "本地开发", "开发工具", "本地部署",
            "服务管理", "后端开发", "开源", "程序员",
        ),
        # Starts are final-master times including the normalized shared header.
        # Each interval, including the final one, is at least ten seconds.
        chapters=(
            ("0:00", "FlyEnv intro"),
            ("0:15", "Typesense releases and install states"),
            ("0:30", "Service, configuration, and startup log"),
            ("0:45", "Local raft status"),
            ("1:00", "Variables, flags, and RPC page"),
            ("1:20", "Return to the Typesense service"),
        ),
    ),
)


def strip_shared_indent(markdown: str) -> str:
    """Keep the shared renderer's interpolated Markdown headings flush-left."""

    prefix = "                "
    return "\n".join(
        line[len(prefix) :] if line.startswith(prefix) else line
        for line in markdown.split("\n")
    )


def chapter_seconds(timestamp: str) -> int:
    """Convert a YouTube chapter timestamp into elapsed seconds."""

    minutes, seconds = timestamp.split(":", maxsplit=1)
    return int(minutes) * 60 + int(seconds)


def measured_brian_minus_six_schedule() -> list[Caption]:
    """Return the recorded cue schedule used to protect the retained tail."""

    return schedule_captions(
        CAPTIONS, MEASURED_BRIAN_MINUS_SIX_DURATIONS, CONFIG.narration.gap
    )


def measured_schedule_fits_cut() -> bool:
    """Ensure the actual Brian -6% cue timings never run beyond the raw capture."""

    return all((cue.end or 0.0) <= CONFIG.cut_at for cue in measured_brian_minus_six_schedule())


def chapters_are_publishable(header_offset: float, final_duration: float) -> bool:
    """Verify chapter starts track the header-aware master and meet YouTube spacing."""

    starts = [chapter_seconds(timestamp) for timestamp, _title in CONFIG.upload.chapters]
    if not starts or starts[0] != 0 or final_duration - starts[-1] < 10:
        return False
    if any(right - left < 10 for left, right in zip(starts, starts[1:])):
        return False
    # The non-intro chapters should remain close to their raw action anchors
    # once the shared header has been prepended.
    raw_anchors = (None, 10.8, 25.2, 40.0, 55.0, 74.8)
    return all(
        raw is None or header_offset + raw - 1.0 <= start <= header_offset + raw + 1.0
        for start, raw in zip(starts, raw_anchors, strict=True)
    )


def verify_checkpoints(header_offset: float, final_duration: float) -> tuple[tuple[str, float], ...]:
    """Name five distinct final-master evidence frames for reviewer inspection."""

    return (
        ("01_header.png", min(1.0, max(0.0, header_offset / 2))),
        ("02_opening_caption.png", header_offset + CAPTIONS[0].anchor + 0.15),
        ("03_service_caption.png", header_offset + CAPTIONS[3].anchor + 0.15),
        ("04_product_caption.png", header_offset + CAPTIONS[8].anchor + 0.15),
        ("05_tail.png", max(0.0, final_duration - 0.9)),
    )


class TypesenseRenderer(DemoRenderer):
    """Shared renderer with Typesense-specific publishing notes and evidence frames."""

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
                    """
                ).lstrip()
            )

    def extract_verify_frames(self) -> None:
        """Extract exactly the five requested named final-master checkpoints."""

        timing = self._timing()
        final_duration = self.probe_duration(self.final_output)
        for name, at in verify_checkpoints(timing["offset"], final_duration):
            self._extract_frame(self.final_output, at, self.verify_dir / name)


def normalise_stages(argv: Sequence[str]) -> list[str]:
    """Treat ``all verify`` as the documented full-pipeline invocation."""

    return ["all"] if "all" in argv else list(argv)


def main(argv: Sequence[str] | None = None) -> None:
    TypesenseRenderer(CONFIG).cli(normalise_stages(sys.argv[1:] if argv is None else argv))


if __name__ == "__main__":
    main()
