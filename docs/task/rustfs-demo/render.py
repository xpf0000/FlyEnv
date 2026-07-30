#!/usr/bin/env python3
"""Original-speed publishing pipeline for the FlyEnv RustFS screen demo.

The staged raw capture is intentionally retained through its 137.900-second
healthy final service frame at recorded speed.  The shared FlyEnv opener is
normalized separately, so its measured output duration offsets captions, voice,
and the final evidence frames without guessing from its source frame rate.

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
SLUG = "flyenv-rustfs"
RAW_SOURCE_SHA256 = "4e3ddbb4651bffe3867e0aa7c1dac3afa0ffc0058cb983783f542e776a5671e3"

# Anchors are raw-demo seconds.  The shared renderer schedules actual Brian
# neural speech durations from these anchors, then offsets emitted SRT times by
# the measured normalized header duration.
CAPTIONS = (
    Caption(10.0, "The RustFS module opens with Service, Version, Configuration, Log, and Error Log tabs."),
    Caption(15.0, "The Version tab lists RustFS 1.0.0-beta.11-preview.1 with an Install action."),
    Caption(25.0, "The selected RustFS release is downloading in the Version tab."),
    Caption(30.0, "The Version tab then marks that RustFS release installed."),
    Caption(35.0, "The Service tab shows the installed version, data directory, environment, and start control."),
    Caption(40.0, "Configuration presents RustFS address, console address, security, and KMS fields."),
    Caption(55.0, "Additional configuration sections show Console, observability, and performance settings."),
    Caption(68.0, "The Log tab displays the visible RustFS startup log entries."),
    Caption(78.0, "The local RustFS Console opens at 127.0.0.1:9001 with Key Login and STS Login."),
    Caption(86.0, "After login, the Console opens the Buckets page, which currently shows no buckets."),
    Caption(93.0, "The Access Keys view opens its Create Key form."),
    Caption(102.0, "The Console confirms a new access key and warns that the secret key is shown only once."),
    Caption(105.0, "The Access Keys table shows the newly available key."),
    Caption(110.0, "The Console then shows the Users page."),
    Caption(118.0, "The User Groups page and Bucket Events navigation are visible."),
    Caption(122.0, "The Lifecycle page is also visible without any buckets."),
    Caption(125.0, "FlyEnv returns to the running RustFS service while the Console remains open behind it."),
)

# These Brian -6% measurements/budgets are intentionally kept with the cue
# copy.  They exercise the end-of-recording scheduling path in unit tests; the
# renderer separately measures every actual WAV and rejects any overrun.
MEASURED_BRIAN_MINUS_SIX_DURATIONS = (
    7.752, 9.288, 4.632, 4.272, 6.960, 7.728, 6.552, 4.800, 9.816,
    6.000, 3.528, 5.976, 3.768, 2.976, 4.248, 4.296, 6.240,
)


CHAPTER_RAW_ANCHORS = (
    None,
    10.0,
    25.0,
    40.0,
    65.0,
    75.0,
    90.0,
    110.0,
    125.0,
)


CONFIG = DemoConfig(
    task_path=TASK,
    source=DOCS / "FlyEnv-RustFS.mp4",
    header_source=DOCS / "flyenv-header.mp4",
    slug=SLUG,
    # Tail review through raw 137.900s remains in the FlyEnv RustFS service
    # context.  No unrelated or broken tail exists to remove.
    cut_at=137.9,
    captions=CAPTIONS,
    narration=NarrationSettings(
        voice="en-US-BrianNeural",
        rate="-6%",
        edge_tts=str(TASK / ".venv" / "bin" / "edge-tts"),
    ),
    cover=CoverMetadata(
        youtube_title=("RustFS", "Local Console"),
        bilibili_title=("RustFS", "本地服务与 Console"),
        youtube_frame_at=90.0,
        bilibili_frame_at=125.0,
        youtube_body=(
            "Inspect the visible release and install state,",
            "then open the local RustFS Console",
            "from FlyEnv.",
        ),
        bilibili_body=(
            "查看版本安装、服务配置与日志，",
            "再从 FlyEnv 打开本地 RustFS Console。",
        ),
    ),
    upload=UploadMetadata(
        product_name="RustFS",
        youtube_title="RustFS in FlyEnv | Install, Configure & Open the Local Console",
        bilibili_title="FlyEnv RustFS 演示：安装、配置与本地 Console",
        youtube_description=(
            "This original-speed recording opens the RustFS module in FlyEnv, shows the visible "
            "release, download, installed state, service controls, configuration, and log output, "
            "then opens the local RustFS Console. The Console walkthrough shows Buckets, the Access "
            "Keys creation form and confirmation, Users, User Groups, Bucket Events, and Lifecycle. "
            "No bucket is created in this recording.\n\n"
            "FlyEnv: https://www.flyenv.com\n"
            "RustFS: https://rustfs.com\n"
            "RustFS documentation: https://docs.rustfs.com\n"
            "Source: https://github.com/xpf0000/FlyEnv\n\n"
            "English narration and captions are included."
        ),
        bilibili_description=(
            "本视频以原始录制速度演示 FlyEnv 的 RustFS 模块：查看可见版本、下载与安装状态、"
            "服务控制、配置和日志，然后打开本地 RustFS Console。Console 中展示了 Buckets、"
            "Access Keys 创建表单及确认、Users、User Groups、Bucket Events 和 Lifecycle。"
            "录制中没有创建 Bucket。\n\n"
            "FlyEnv 官网：https://www.flyenv.com\n"
            "RustFS 官网：https://rustfs.com\n"
            "RustFS 文档：https://docs.rustfs.com\n"
            "开源地址：https://github.com/xpf0000/FlyEnv\n\n"
            "视频包含英文配音和英文字幕。"
        ),
        tags=(
            "FlyEnv", "RustFS", "RustFS tutorial", "RustFS Console", "local RustFS",
            "object storage", "distributed file system", "local development", "developer tools",
            "RustFS installation",
        ),
        bilibili_tags=(
            "FlyEnv", "RustFS", "对象存储", "分布式文件系统", "本地开发", "开发工具",
            "本地部署", "后端开发", "开源", "程序员",
        ),
        # These rounded chapter starts are in final-master time, including the
        # normalized shared opener.  The mapping helper below verifies their
        # relationship to the raw visual anchors and the YouTube 10s rule.
        chapters=(
            ("0:00", "FlyEnv intro"),
            ("0:15", "RustFS module and version"),
            ("0:30", "Download and install"),
            ("0:45", "Service controls and configuration"),
            ("1:10", "RustFS log output"),
            ("1:20", "Local RustFS Console"),
            ("1:35", "Buckets and Access Keys"),
            ("1:55", "Users and User Groups"),
            ("2:10", "Return to RustFS service"),
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
    """Convert a YouTube chapter timestamp to elapsed seconds."""

    minutes, seconds = timestamp.split(":", maxsplit=1)
    return int(minutes) * 60 + int(seconds)


def measured_schedule_fits_cut() -> bool:
    """Protect the recorded Brian -6% cue schedule from a tail overrun."""

    scheduled = measured_brian_minus_six_schedule()
    return all((cue.end or 0.0) <= CONFIG.cut_at for cue in scheduled)


def measured_brian_minus_six_schedule() -> list[Caption]:
    """Return the persisted measured-duration schedule used for evidence timing."""

    return schedule_captions(
        CAPTIONS, MEASURED_BRIAN_MINUS_SIX_DURATIONS, CONFIG.narration.gap
    )


def chapter_mapping(header_offset: float) -> tuple[tuple[int, float | None, float], ...]:
    """Relate final chapter starts to their raw visual anchors and header offset."""

    return tuple(
        (
            chapter_seconds(timestamp),
            raw_anchor,
            0.0 if raw_anchor is None else header_offset + raw_anchor,
        )
        for (timestamp, _title), raw_anchor in zip(CONFIG.upload.chapters, CHAPTER_RAW_ANCHORS, strict=True)
    )


def chapters_are_publishable(header_offset: float, final_duration: float) -> bool:
    """Confirm chapter spacing and rounded header-aware mapping for the final master."""

    mapping = chapter_mapping(header_offset)
    starts = [start for start, _raw, _expected in mapping]
    if not starts or starts[0] != 0 or final_duration - starts[-1] < 10:
        return False
    if any(right - left < 10 for left, right in zip(starts, starts[1:])):
        return False
    return all(
        raw_anchor is None or expected - 0.2 <= start <= expected
        for start, raw_anchor, expected in mapping
    )


def verify_checkpoints(header_offset: float, final_duration: float) -> tuple[tuple[str, float], ...]:
    """Name the five distinct final-master frames required for review."""

    measured = measured_brian_minus_six_schedule()
    return (
        ("01_header.png", min(1.0, max(0.0, header_offset / 2))),
        ("02_opening_caption.png", header_offset + CAPTIONS[0].anchor + 0.15),
        ("03_service_caption.png", header_offset + (measured[4].start or 0.0) + 0.15),
        ("04_product_caption.png", header_offset + CAPTIONS[8].anchor + 0.15),
        ("05_tail.png", max(0.0, final_duration - 0.9)),
    )


class RustFSRenderer(DemoRenderer):
    """Shared renderer with RustFS release notes and explicit evidence frames."""

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
                    """
                ).lstrip()
            )

    def extract_verify_frames(self) -> None:
        """Extract exactly the requested distinct final-master evidence frames."""

        timing = self._timing()
        final_duration = self.probe_duration(self.final_output)
        for name, at in verify_checkpoints(timing["offset"], final_duration):
            self._extract_frame(self.final_output, at, self.verify_dir / name)


def normalise_stages(argv: Sequence[str]) -> list[str]:
    """Treat ``all verify`` as the documented complete-pipeline command."""

    return ["all"] if "all" in argv else list(argv)


def main(argv: Sequence[str] | None = None) -> None:
    RustFSRenderer(CONFIG).cli(normalise_stages(sys.argv[1:] if argv is None else argv))


if __name__ == "__main__":
    main()
