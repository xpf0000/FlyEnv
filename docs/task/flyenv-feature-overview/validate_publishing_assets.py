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
