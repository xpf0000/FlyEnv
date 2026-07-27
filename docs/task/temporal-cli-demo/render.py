#!/usr/bin/env python3
"""Post-production pipeline for the FlyEnv Temporal CLI demo.

Run individual stages, for example ``python3 render.py base header concat``,
or run the complete pipeline with ``python3 render.py all``.  The source is
never modified.  Task 1 intentionally leaves NARRATION empty until copy is
approved, so the TTS stage exits before making media when it has no script.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import textwrap
from pathlib import Path


TASK = Path(__file__).resolve().parent
DOCS = TASK.parent.parent
SRC = DOCS / "FlyEnv-Temporal-CLI.mp4"
HEADER_SRC = DOCS / "flyenv-header.mp4"
BUILD = TASK / "build"

SLUG = "flyenv-temporal-cli"
BASE = TASK / f"{SLUG}_base_edited_1080p.mp4"
HEADER = BUILD / "header_1080p30.mp4"
HEADER_AUDIO = BUILD / "header_audio.wav"
FULL_SILENT = BUILD / "full_silent_1080p.mp4"
VOICE = TASK / f"{SLUG}_en_voiceover.wav"
SUBBED = TASK / f"{SLUG}_en_subtitled.mp4"
FINAL = TASK / f"{SLUG}_en_final.mp4"
SRT = TASK / f"{SLUG}_en_subtitles.srt"
TSV = TASK / f"{SLUG}_en_subtitles.tsv"
THUMB = TASK / f"{SLUG}_youtube_thumbnail.png"
UPLOAD = TASK / "youtube_upload_package.md"
TIMING = BUILD / "timing.json"

VENV_BIN = TASK / ".venv" / "bin"
EDGE_TTS = VENV_BIN / "edge-tts"
VOICE_NAME = "en-US-BrianNeural"
VOICE_RATE = "-6%"

W, H, FPS = 1920, 1080, 30
DEMO_END = 102.1

# Add approved English copy as (source-time seconds, spoken caption) tuples.
NARRATION: list[tuple[float, str]] = []


def run(cmd: list[str | Path]) -> None:
    """Run one external tool command with its resolved arguments displayed."""
    rendered = [str(part) for part in cmd]
    print("+ " + " ".join(rendered))
    subprocess.run(rendered, check=True)


def probe_duration(path: Path) -> float:
    """Return a media file's duration in seconds."""
    value = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "csv=p=0",
            str(path),
        ],
        text=True,
    ).strip()
    return float(value)


def x264(*extra: str) -> list[str]:
    """Return the shared H.264 settings for publishable 1080p artifacts."""
    return [
        "-c:v",
        "libx264",
        "-profile:v",
        "high",
        "-preset",
        "medium",
        "-crf",
        "19",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        *extra,
    ]


def require_file(path: Path, stage: str) -> None:
    if not path.exists():
        raise SystemExit(f"{stage} requires {path.name}. Run its prerequisite stage first.")


def load_timing() -> tuple[float, float]:
    require_file(TIMING, "This stage")
    timing = json.loads(TIMING.read_text(encoding="utf-8"))
    return float(timing["header_offset"]), float(timing["total"])


def srt_time(value: float) -> str:
    total_ms = int(round(value * 1000))
    hours, total_ms = divmod(total_ms, 3_600_000)
    minutes, total_ms = divmod(total_ms, 60_000)
    seconds, millis = divmod(total_ms, 1_000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{millis:03d}"


def stage_base() -> None:
    """Create the continuous, silent 1080p master with no speed adjustment."""
    BUILD.mkdir(parents=True, exist_ok=True)
    run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-stats",
            "-i",
            SRC,
            "-t",
            f"{DEMO_END:.3f}",
            "-vf",
            f"scale={W}:{H}:flags=lanczos,fps={FPS},format=yuv420p",
            "-an",
            *x264(),
            BASE,
        ]
    )
    print(f"base edit: {probe_duration(BASE):.3f}s")


def stage_header() -> None:
    """Normalize the shared FlyEnv opener and keep its audio for the final mix."""
    BUILD.mkdir(parents=True, exist_ok=True)
    run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-stats",
            "-i",
            HEADER_SRC,
            "-vf",
            f"scale={W}:{H}:flags=lanczos,fps={FPS},format=yuv420p",
            "-an",
            *x264(),
            HEADER,
        ]
    )
    run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-i",
            HEADER_SRC,
            "-vn",
            "-ac",
            "2",
            "-ar",
            "48000",
            "-c:a",
            "pcm_s16le",
            HEADER_AUDIO,
        ]
    )
    print(f"header: {probe_duration(HEADER):.3f}s")


def stage_concat() -> None:
    """Prepend the normalized opener to the silent base master."""
    require_file(HEADER, "concat")
    require_file(BASE, "concat")
    listing = BUILD / "full_concat.txt"
    listing.write_text(f"file '{HEADER}'\nfile '{BASE}'\n", encoding="utf-8")
    run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            listing,
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            FULL_SILENT,
        ]
    )
    header_offset = probe_duration(HEADER)
    total = probe_duration(FULL_SILENT)
    TIMING.write_text(
        json.dumps({"header_offset": header_offset, "total": total}, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"full silent master: {total:.3f}s (header offset {header_offset:.3f}s)")


def tts_paths(index: int) -> tuple[Path, Path]:
    return BUILD / f"vo_{index:02d}.mp3", BUILD / f"vo_{index:02d}.wav"


def stage_tts() -> None:
    """Generate timed Brian neural voiceover and subtitle timing artifacts."""
    if not NARRATION:
        raise SystemExit(
            "NARRATION is empty. Add approved (source-time seconds, caption) tuples before running tts."
        )
    if not EDGE_TTS.exists():
        raise SystemExit(
            f"edge-tts is missing: {EDGE_TTS}. Create the task venv with "
            "python3 -m venv .venv && .venv/bin/pip install edge-tts"
        )
    require_file(FULL_SILENT, "tts")
    header_offset, total = load_timing()
    BUILD.mkdir(parents=True, exist_ok=True)

    lines: list[dict[str, float | int | str]] = []
    for index, (anchor, caption) in enumerate(NARRATION, 1):
        mp3, wav = tts_paths(index)
        run(
            [
                EDGE_TTS,
                "--voice",
                VOICE_NAME,
                f"--rate={VOICE_RATE}",
                "--text",
                caption,
                "--write-media",
                mp3,
            ]
        )
        run(["ffmpeg", "-y", "-v", "error", "-i", mp3, "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", wav])
        lines.append({"index": index, "anchor": anchor, "text": caption, "duration": probe_duration(wav), "wav": str(wav)})

    cursor = 0.0
    for line in lines:
        start = max(float(line["anchor"]), cursor)
        end = start + float(line["duration"])
        line["start"] = start
        line["end"] = end
        cursor = end + 0.28

    inputs: list[str | Path] = []
    filters: list[str] = []
    audio_labels: list[str] = []
    for input_index, line in enumerate(lines):
        inputs.extend(["-i", Path(str(line["wav"]))])
        delay = int(round((header_offset + float(line["start"])) * 1000))
        label = f"a{input_index}"
        filters.append(f"[{input_index}:a]adelay={delay}|{delay}[{label}]")
        audio_labels.append(f"[{label}]")
    filters.append(
        f"{''.join(audio_labels)}amix=inputs={len(lines)}:normalize=0:dropout_transition=0,"
        f"apad,atrim=0:{total:.3f},aresample=48000[voice]"
    )
    run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-stats",
            *inputs,
            "-filter_complex",
            ";".join(filters),
            "-map",
            "[voice]",
            "-c:a",
            "pcm_s16le",
            VOICE,
        ]
    )
    TSV.write_text(
        "".join(
            f"{header_offset + float(line['start']):.3f}\t{header_offset + float(line['end']):.3f}\t{line['text']}\n"
            for line in lines
        ),
        encoding="utf-8",
    )
    SRT.write_text(
        "\n".join(
            f"{index}\n{srt_time(header_offset + float(line['start']))} --> "
            f"{srt_time(header_offset + float(line['end']))}\n{line['text']}\n"
            for index, line in enumerate(lines, 1)
        ),
        encoding="utf-8",
    )
    (BUILD / "narration.json").write_text(json.dumps(lines, indent=2) + "\n", encoding="utf-8")
    print(f"voiceover: {probe_duration(VOICE):.3f}s, {len(lines)} captions")


def stage_subs() -> None:
    """Burn the generated English SRT captions into the silent video master."""
    require_file(FULL_SILENT, "subs")
    require_file(SRT, "subs")
    run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-stats",
            "-i",
            FULL_SILENT,
            "-vf",
            f"subtitles={SRT}",
            "-an",
            *x264(),
            SUBBED,
        ]
    )
    print(f"subtitled: {probe_duration(SUBBED):.3f}s")


def stage_mix() -> None:
    """Mix the opener audio and voiceover with the captioned video."""
    require_file(SUBBED, "mix")
    require_file(VOICE, "mix")
    require_file(HEADER_AUDIO, "mix")
    total = probe_duration(SUBBED)
    run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-stats",
            "-i",
            SUBBED,
            "-i",
            VOICE,
            "-i",
            HEADER_AUDIO,
            "-filter_complex",
            f"[1:a]loudnorm=I=-15:TP=-1.5:LRA=7,aresample=48000[voice];"
            f"[2:a]apad,atrim=0:{total:.3f}[header];"
            f"[voice][header]amix=inputs=2:normalize=0:dropout_transition=0,"
            f"alimiter=limit=0.97,aresample=48000[audio]",
            "-map",
            "0:v",
            "-map",
            "[audio]",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-movflags",
            "+faststart",
            FINAL,
        ]
    )
    print(f"final: {probe_duration(FINAL):.3f}s")


def upload_package() -> str:
    return textwrap.dedent(
        f"""\
        # FlyEnv Temporal CLI Demo - Upload Package

        Final master: `{FINAL.name}`

        ## YouTube

        **Recommended title:** FlyEnv Temporal CLI — Local Setup and Workflow Demo

        **Description:**

        See FlyEnv's native Temporal CLI workflow, from local setup through the
        everyday command-line experience.

        **Tags:** FlyEnv, Temporal CLI, Temporal, local development, developer tools
        """
    )


def stage_assets() -> None:
    """Create the English thumbnail and starter YouTube upload package."""
    require_file(FINAL, "assets")
    require_file(SRT, "assets")
    run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-ss",
            "1",
            "-i",
            FINAL,
            "-frames:v",
            "1",
            "-vf",
            f"scale={W}:{H}:flags=lanczos",
            THUMB,
        ]
    )
    UPLOAD.write_text(upload_package(), encoding="utf-8")
    print(f"assets: {THUMB.name}, {UPLOAD.name}")


STAGE_ORDER = ("base", "header", "concat", "tts", "subs", "mix", "assets")
STAGE_HANDLERS = {
    "base": stage_base,
    "header": stage_header,
    "concat": stage_concat,
    "tts": stage_tts,
    "subs": stage_subs,
    "mix": stage_mix,
    "assets": stage_assets,
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stages", nargs="*", choices=("all", *STAGE_ORDER), help="stages to run in order")
    args = parser.parse_args(argv)
    if not args.stages:
        parser.print_help()
        return 0

    selected = STAGE_ORDER if "all" in args.stages else args.stages
    for stage in selected:
        STAGE_HANDLERS[stage]()
    return 0


if __name__ == "__main__":
    sys.exit(main())
