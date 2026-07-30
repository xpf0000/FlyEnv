#!/usr/bin/env python3
"""Reusable original-speed renderer for FlyEnv module demo packages.

Task-local ``render.py`` wrappers provide a :class:`DemoConfig` and delegate
selected stages to :class:`DemoRenderer`.  Media tools are always invoked with
argument lists so paths and caption text are not interpreted by a shell.
"""

from __future__ import annotations

import json
import math
import shutil
import subprocess
import sys
import textwrap
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Callable, Iterable, Sequence


W, H, FPS = 1920, 1080, 30
BAR_W, BAR_H, BAR_PT = 1600, 108, 32
BAR_X, BAR_Y = (W - BAR_W) // 2, 864


@dataclass(frozen=True)
class Caption:
    """A source-timeline caption and its optionally scheduled speech timing."""

    anchor: float
    text: str
    speak: str | None = None
    start: float | None = None
    end: float | None = None


@dataclass(frozen=True)
class NarrationSettings:
    voice: str = "en-US-BrianNeural"
    rate: str = "-6%"
    gap: float = 0.28
    edge_tts: str = "edge-tts"
    loudness_i: float = -15.0
    loudness_tp: float = -1.5
    loudness_lra: float = 7.0


@dataclass(frozen=True)
class FontSettings:
    """Font names used for Latin and CJK caption/cover text."""

    latin: str = "Arial"
    latin_bold: str = "Arial-Bold"
    cjk: str = "Hiragino-Sans-GB-W3"
    cjk_bold: str = "Hiragino-Sans-GB-W6"


@dataclass(frozen=True)
class CoverMetadata:
    """Copy and raw-source frame locations for the two publishing covers."""

    youtube_title: tuple[str, str]
    bilibili_title: tuple[str, str]
    youtube_frame_at: float
    bilibili_frame_at: float
    youtube_body: tuple[str, ...] = (
        "Install official releases, run a native local service,",
        "and manage it from one desktop app.",
    )
    bilibili_body: tuple[str, ...] = (
        "一键安装官方版本，以原生服务在本地运行，",
        "在同一个桌面应用中完成管理。",
    )
    youtube_eyebrow: str = "FLYENV DEMO"
    bilibili_eyebrow: str = "FLYENV 演示"


@dataclass(frozen=True)
class UploadMetadata:
    product_name: str
    youtube_title: str
    bilibili_title: str
    youtube_description: str
    bilibili_description: str
    tags: tuple[str, ...]
    bilibili_tags: tuple[str, ...]
    chapters: tuple[tuple[str, str], ...] = ()


@dataclass(frozen=True)
class DemoConfig:
    """All task-local choices needed to render a demo package.

    ``cut_at`` is the selected healthy source frame in seconds.  The base stage
    does not change playback speed; it only scales/fps-normalizes and fades at
    that final healthy frame.
    """

    task_path: Path
    source: Path
    header_source: Path
    slug: str
    cut_at: float
    captions: tuple[Caption, ...]
    narration: NarrationSettings
    cover: CoverMetadata
    upload: UploadMetadata
    final_fade: float = 0.6
    fonts: FontSettings = field(default_factory=FontSettings)

    def __post_init__(self) -> None:
        if self.cut_at <= 0:
            raise ValueError("cut_at must be positive")
        if not 0 < self.final_fade < self.cut_at:
            raise ValueError("final_fade must be positive and shorter than cut_at")
        if not self.captions:
            raise ValueError("at least one caption is required")
        for label, value in (
            ("task_path", self.task_path),
            ("source", self.source),
            ("header_source", self.header_source),
            ("slug", self.slug),
        ):
            if any(ord(character) <= 31 or 127 <= ord(character) <= 159 for character in str(value)):
                raise ValueError(f"{label} must not contain a control character")


def schedule_captions(
    captions: Sequence[Caption], durations: Sequence[float], gap: float
) -> list[Caption]:
    """Schedule actual TTS durations without moving a cue before its anchor."""

    if len(captions) != len(durations):
        raise ValueError("captions and durations must have the same length")
    if gap < 0:
        raise ValueError("gap must not be negative")

    cursor = 0.0
    scheduled: list[Caption] = []
    for caption, duration in zip(captions, durations, strict=True):
        if duration < 0:
            raise ValueError("caption durations must not be negative")
        # Millisecond precision is the output contract for TSV/SRT.  Ceiling
        # rather than ordinary rounding ensures persistence never moves a cue
        # before its source anchor or truncates its measured speech duration.
        start = math.ceil(max(caption.anchor, cursor) * 1000 - 1e-9) / 1000
        end = math.ceil((start + duration) * 1000 - 1e-9) / 1000
        scheduled.append(replace(caption, start=start, end=end))
        cursor = end + gap
    return scheduled


def srt_time(value: float) -> str:
    """Render an SRT timestamp with rounded, zero-padded milliseconds."""

    milliseconds = int(round(value * 1000))
    hours, milliseconds = divmod(milliseconds, 3_600_000)
    minutes, milliseconds = divmod(milliseconds, 60_000)
    seconds, milliseconds = divmod(milliseconds, 1_000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}"


def has_cjk(text: str) -> bool:
    """Use the configured CJK face for Han, Kana, or Hangul text."""

    return any(
        "\u3000" <= character <= "\u30ff"
        or "\u3400" <= character <= "\u9fff"
        or "\uac00" <= character <= "\ud7af"
        for character in text
    )


Runner = Callable[[list[str]], object]
DurationProbe = Callable[[Path], float]
TtsAvailable = Callable[[], bool]


class DemoRenderer:
    """Stage-oriented media renderer used by each FlyEnv module wrapper."""

    order = ("base", "header", "concat", "tts", "subs", "mix", "assets", "verify")
    dependency_hints = {
        "ffmpeg": "FFmpeg",
        "ffprobe": "FFmpeg",
        "magick": "ImageMagick",
        "edge-tts": "Edge TTS (edge-tts)",
    }

    def __init__(
        self,
        config: DemoConfig,
        *,
        runner: Runner | None = None,
        duration_probe: DurationProbe | None = None,
        tts_available: TtsAvailable | None = None,
    ) -> None:
        self.config = config
        self._runner = runner or self._subprocess_runner
        self._duration_probe = duration_probe or self._ffprobe_duration
        self._tts_available = tts_available or self._edge_tts_available

    # ------------------------------------------------------------------ paths

    @property
    def task(self) -> Path:
        return self.config.task_path

    @property
    def build(self) -> Path:
        return self.task / "build"

    @property
    def verify_dir(self) -> Path:
        return self.task / "verify"

    @property
    def base_output(self) -> Path:
        return self.task / f"{self.config.slug}_base_edited_1080p.mp4"

    @property
    def header_output(self) -> Path:
        return self.build / "header_1080p30.mp4"

    @property
    def header_audio_output(self) -> Path:
        return self.build / "header_audio.wav"

    @property
    def full_silent_output(self) -> Path:
        return self.build / "full_silent_1080p.mp4"

    @property
    def voiceover_output(self) -> Path:
        return self.task / f"{self.config.slug}_en_voiceover.wav"

    @property
    def subtitled_output(self) -> Path:
        return self.task / f"{self.config.slug}_en_subtitled.mp4"

    @property
    def final_output(self) -> Path:
        return self.task / f"{self.config.slug}_en_final.mp4"

    @property
    def srt_output(self) -> Path:
        return self.task / f"{self.config.slug}_en_subtitles.srt"

    @property
    def tsv_output(self) -> Path:
        return self.task / f"{self.config.slug}_en_subtitles.tsv"

    @property
    def timing_output(self) -> Path:
        return self.build / "timing.json"

    @property
    def narration_output(self) -> Path:
        return self.build / "narration.json"

    @property
    def youtube_cover_output(self) -> Path:
        return self.task / f"{self.config.slug}_youtube_thumbnail.png"

    @property
    def bilibili_cover_output(self) -> Path:
        return self.task / f"{self.config.slug}_bilibili_cover.png"

    @property
    def upload_output(self) -> Path:
        return self.task / "youtube_upload_package.md"

    def caption_mp3(self, index: int) -> Path:
        return self.build / f"vo_{index:02d}.mp3"

    def caption_wav(self, index: int) -> Path:
        return self.build / f"vo_{index:02d}.wav"

    # ---------------------------------------------------------- process layer

    @staticmethod
    def _display(command: Sequence[str]) -> None:
        print("+ " + " ".join(command), flush=True)

    @staticmethod
    def _subprocess_runner(command: list[str]) -> subprocess.CompletedProcess[str]:
        return subprocess.run(command, check=True, text=True)

    @classmethod
    def _unavailable_command(cls, command: str, error: OSError) -> RuntimeError:
        executable = Path(command).name
        dependency = cls.dependency_hints.get(executable, executable)
        return RuntimeError(
            f"Required command '{executable}' is unavailable; install or configure {dependency}."
        )

    def run(self, command: Iterable[str | Path]) -> object:
        """Emit and execute one argv-only process invocation."""

        argv = [str(part) for part in command]
        self._display(argv)
        try:
            result = self._runner(argv)
        except OSError as error:
            raise self._unavailable_command(argv[0], error) from error
        return_code = getattr(result, "returncode", 0)
        if return_code not in (None, 0):
            raise subprocess.CalledProcessError(return_code, argv)
        return result

    def ffmpeg(self, *args: str | Path) -> object:
        return self.run(["ffmpeg", "-y", "-v", "error", "-stats", *args])

    def _ffprobe_duration(self, path: Path) -> float:
        command = [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "csv=p=0", str(path),
        ]
        self._display(command)
        try:
            value = subprocess.check_output(command, text=True).strip()
        except OSError as error:
            raise self._unavailable_command(command[0], error) from error
        return float(value)

    def _edge_tts_available(self) -> bool:
        executable = self.config.narration.edge_tts
        return Path(executable).exists() or shutil.which(executable) is not None

    def probe_duration(self, path: Path) -> float:
        return self._duration_probe(path)

    # --------------------------------------------------------------- profiles

    def x264_profile(self) -> list[str]:
        return [
            "-c:v", "libx264", "-profile:v", "high", "-preset", "medium", "-crf", "19",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        ]

    def base_filter(self) -> str:
        fade_start = self.config.cut_at - self.config.final_fade
        return (
            f"scale={W}:{H}:flags=lanczos,fps={FPS},"
            f"fade=t=out:st={fade_start:.3f}:d={self.config.final_fade:.3f},format=yuv420p"
        )

    @staticmethod
    def header_filter() -> str:
        return f"scale={W}:{H}:flags=lanczos,fps={FPS},format=yuv420p"

    # ---------------------------------------------------------------- stages

    def stage_base(self) -> None:
        """Make a continuous original-speed base edit ending at the healthy frame."""

        self.build.mkdir(parents=True, exist_ok=True)
        self.ffmpeg(
            "-i", self.config.source, "-t", f"{self.config.cut_at:.3f}",
            "-vf", self.base_filter(), "-an", *self.x264_profile(), self.base_output,
        )

    def stage_header(self) -> None:
        """Normalize the shared 60fps header and separately preserve its audio."""

        self.build.mkdir(parents=True, exist_ok=True)
        self.ffmpeg(
            "-i", self.config.header_source, "-vf", self.header_filter(), "-an",
            *self.x264_profile(), self.header_output,
        )
        header_offset = self.probe_duration(self.header_output)
        self.ffmpeg(
            "-i", self.config.header_source, "-vn", "-af",
            f"atrim=0:{header_offset:.6f},asetpts=N/SR/TB", "-ac", "2", "-ar", "48000",
            "-c:a", "pcm_s16le", self.header_audio_output,
        )

    def stage_concat(self) -> None:
        """Prepend the normalized header without parsing task paths as text."""

        self.build.mkdir(parents=True, exist_ok=True)
        self.ffmpeg(
            "-i", self.header_output, "-i", self.base_output,
            "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0,format=yuv420p[v]",
            "-map", "[v]", "-r", str(FPS), "-an", *self.x264_profile(), self.full_silent_output,
        )
        offset = self.probe_duration(self.header_output)
        total = self.probe_duration(self.full_silent_output)
        self.timing_output.write_text(
            json.dumps({"offset": offset, "total": total}, indent=2) + "\n", encoding="utf-8"
        )

    def _timing(self) -> dict[str, float]:
        if self.timing_output.exists():
            raw = json.loads(self.timing_output.read_text(encoding="utf-8"))
            return {"offset": float(raw["offset"]), "total": float(raw["total"])}
        offset = self.probe_duration(self.header_output if self.header_output.exists() else self.config.header_source)
        return {"offset": offset, "total": offset + self.config.cut_at}

    def _require_tts(self) -> None:
        if not self._tts_available():
            raise RuntimeError(
                "edge-tts is missing; set NarrationSettings.edge_tts to the task-local executable"
            )

    def generate_caption_audio(self) -> list[Caption]:
        """Generate each cue, then schedule based on its measured duration."""

        self.build.mkdir(parents=True, exist_ok=True)
        self._require_tts()
        durations: list[float] = []
        for index, caption in enumerate(self.config.captions, 1):
            mp3, wav = self.caption_mp3(index), self.caption_wav(index)
            self.run([
                self.config.narration.edge_tts, "--voice", self.config.narration.voice,
                f"--rate={self.config.narration.rate}", "--text", caption.speak or caption.text,
                "--write-media", mp3,
            ])
            self.ffmpeg("-i", mp3, "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", wav)
            durations.append(self.probe_duration(wav))
        return self.validate_scheduled_captions(
            schedule_captions(self.config.captions, durations, self.config.narration.gap)
        )

    def validate_scheduled_captions(self, captions: Sequence[Caption]) -> list[Caption]:
        """Prevent speech, bars, and SRT cues from extending past the base edit."""

        validated = list(captions)
        for index, caption in enumerate(validated, 1):
            if caption.start is not None and caption.end is not None and caption.end < caption.start:
                raise ValueError(f"caption {index} ends before it starts")
            if caption.end is not None and caption.end > self.config.cut_at:
                raise ValueError(
                    f"caption {index} ends at {caption.end:.3f}s beyond cut_at {self.config.cut_at:.3f}s"
                )
        return validated

    def _write_narration_timing(self, captions: Sequence[Caption]) -> None:
        captions = self.validate_scheduled_captions(captions)
        records = [
            {
                "i": index,
                "anchor": caption.anchor,
                "start": caption.start,
                "end": caption.end,
                "dur": (caption.end or 0.0) - (caption.start or 0.0),
                "text": caption.text,
                "speak": caption.speak,
                "wav": str(self.caption_wav(index)),
            }
            for index, caption in enumerate(captions, 1)
        ]
        self.narration_output.write_text(
            json.dumps(records, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        self.tsv_output.write_text(
            "".join(
                f"{caption.start:.3f}\t{caption.end:.3f}\t{caption.text}\n"
                for caption in captions
                if caption.start is not None and caption.end is not None
            ),
            encoding="utf-8",
        )

    def write_caption_audio(
        self, captions: Sequence[Caption], *, header_offset: float, total_duration: float
    ) -> None:
        """Place scheduled speech after the header in a full-length voice WAV."""

        captions = self.validate_scheduled_captions(captions)
        if not captions:
            raise ValueError("at least one scheduled caption is required")
        inputs: list[str | Path] = []
        chains: list[str] = []
        streams: list[str] = []
        for index, caption in enumerate(captions, 1):
            if caption.start is None or caption.end is None:
                raise ValueError("captions must be scheduled before mixing audio")
            inputs.extend(("-i", self.caption_wav(index)))
            delay = int(round((caption.start + header_offset) * 1000))
            chains.append(f"[{index - 1}:a]adelay={delay}|{delay}[a{index}]")
            streams.append(f"[a{index}]")
        chains.append(
            f"{''.join(streams)}amix=inputs={len(captions)}:normalize=0:dropout_transition=0,"
            f"apad,atrim=0:{total_duration:.3f},aresample=48000[out]"
        )
        self.ffmpeg(
            *inputs, "-filter_complex", ";".join(chains), "-map", "[out]",
            "-c:a", "pcm_s16le", self.voiceover_output,
        )

    def stage_tts(self) -> None:
        captions = self.generate_caption_audio()
        timing = self._timing()
        self.write_caption_audio(captions, header_offset=timing["offset"], total_duration=timing["total"])
        self._write_narration_timing(captions)

    def scheduled_captions(self) -> list[Caption]:
        records = json.loads(self.narration_output.read_text(encoding="utf-8"))
        return self.validate_scheduled_captions([
            Caption(
                anchor=float(record["anchor"]), text=str(record["text"]),
                speak=record.get("speak"), start=float(record["start"]), end=float(record["end"]),
            )
            for record in records
        ])

    def _caption_font(self, text: str) -> str:
        return self.config.fonts.cjk if has_cjk(text) else self.config.fonts.latin

    def _caption_bar(self, index: int, caption: Caption) -> Path:
        output = self.build / f"bar_{index:02d}.png"
        self.run([
            "magick", "-size", f"{BAR_W}x{BAR_H}", "xc:none",
            "-fill", "rgba(0,0,0,0.72)",
            "-draw", f"roundrectangle 0,0 {BAR_W - 1},{BAR_H - 1} 22,22",
            "-font", self._caption_font(caption.text), "-fill", "white", "-pointsize", str(BAR_PT),
            "-gravity", "center", "-annotate", "+0+0", caption.text, output,
        ])
        return output

    def stage_subs(self) -> None:
        captions = self.scheduled_captions()
        timing = self._timing()
        bars = [self._caption_bar(index, caption) for index, caption in enumerate(captions, 1)]
        inputs: list[str | Path] = ["-i", self.full_silent_output]
        for bar in bars:
            inputs.extend(("-loop", "1", "-i", bar))

        chains: list[str] = []
        previous = "0:v"
        for index, caption in enumerate(captions, 1):
            if caption.start is None or caption.end is None:
                raise ValueError("captions must be scheduled before rendering subtitles")
            start, end = caption.start + timing["offset"], caption.end + timing["offset"]
            label = f"v{index}"
            chains.append(
                f"[{previous}][{index}:v]overlay={BAR_X}:{BAR_Y}:"
                f"enable='between(t,{start:.3f},{end:.3f})':shortest=1[{label}]"
            )
            previous = label
        # The original-speed base already fades once at its selected healthy
        # final frame.  Do not apply another video fade while adding bars.
        chains.append(f"[{previous}]format=yuv420p[v]")
        self.ffmpeg(
            *inputs, "-filter_complex", ";".join(chains), "-map", "[v]", "-r", str(FPS),
            "-an", *self.x264_profile(), self.subtitled_output,
        )

    def stage_mix(self) -> None:
        """Keep the opener audio and mix its full-length voiceover underneath."""

        total = self.probe_duration(self.subtitled_output)
        settings = self.config.narration
        graph = (
            f"[1:a]loudnorm=I={settings.loudness_i:g}:TP={settings.loudness_tp:g}:"
            f"LRA={settings.loudness_lra:g},aresample=48000[vo];"
            f"[2:a]volume=1.0,apad,atrim=0:{total:.3f}[header];"
            f"[vo][header]amix=inputs=2:normalize=0:dropout_transition=0,"
            f"afade=t=out:st={max(0.0, total - self.config.final_fade):.3f}:"
            f"d={self.config.final_fade:.3f},alimiter=limit=0.97,aresample=48000[a]"
        )
        self.ffmpeg(
            "-i", self.subtitled_output, "-i", self.voiceover_output, "-i", self.header_audio_output,
            "-filter_complex", graph, "-map", "0:v", "-map", "[a]", "-c:v", "copy",
            "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
            "-movflags", "+faststart", self.final_output,
        )

    # --------------------------------------------------------- assets/verify

    def srt_contents(self, captions: Sequence[Caption], *, header_offset: float) -> str:
        captions = self.validate_scheduled_captions(captions)
        blocks: list[str] = []
        for index, caption in enumerate(captions, 1):
            if caption.start is None or caption.end is None:
                raise ValueError("captions must be scheduled before writing SRT")
            blocks.append(
                f"{index}\n{srt_time(caption.start + header_offset)} --> "
                f"{srt_time(caption.end + header_offset)}\n{caption.text}\n"
            )
        return "\n".join(blocks)

    def _extract_frame(self, source: Path, at: float, output: Path) -> None:
        output.parent.mkdir(parents=True, exist_ok=True)
        self.ffmpeg(
            "-ss", f"{at:.3f}", "-i", source, "-frames:v", "1",
            "-vf", f"scale={W}:{H}:flags=lanczos", output,
        )

    def _render_cover(
        self,
        output: Path,
        size: tuple[int, int],
        frame: Path,
        eyebrow: str,
        title: tuple[str, str],
        body: Sequence[str],
        *,
        chinese: bool,
    ) -> None:
        """Compose a text card around an extracted real FlyEnv/product frame."""

        width, height = size
        directory = self.build / f"cover_{output.stem}"
        directory.mkdir(parents=True, exist_ok=True)
        background, shot = directory / "background.png", directory / "shot.png"
        font = self.config.fonts.cjk_bold if chinese else self.config.fonts.latin_bold
        regular_font = self.config.fonts.cjk if chinese else self.config.fonts.latin
        self.run(["magick", "-size", f"{width}x{height}", "radial-gradient:#182541-#050812", background])
        self.run(["magick", frame, "-resize", "960x", "-strip", shot])
        self.run([
            "magick", background, "-gravity", "northwest", shot,
            "-geometry", f"+{width - 998}+74", "-composite",
            "-fill", "rgba(7,11,24,0.93)", "-draw", f"roundrectangle 48,48 900,{height - 48} 34,34",
            "-fill", "none", "-stroke", "rgba(255,255,255,0.18)", "-strokewidth", "3",
            "-draw", f"roundrectangle 49,49 899,{height - 49} 34,34", "-stroke", "none",
            "-font", font, "-fill", "#34D399", "-pointsize", "29", "-annotate", "+108+138", eyebrow,
            "-fill", "white", "-pointsize", "88", "-annotate", "+108+285", title[0],
            "-fill", "#34D399", "-pointsize", "80", "-annotate", "+108+392", title[1],
            "-fill", "#34D399", "-draw", "roundrectangle 108,455 350,464 5,5",
            "-font", regular_font, "-fill", "#C3CEE2", "-pointsize", "32", "-annotate", "+108+555",
            "\n".join(body), "-strip", "-define", "png:compression-level=9", output,
        ])

    def write_upload_package(self) -> None:
        metadata = self.config.upload
        chapters = "\n".join(f"{at} {title}" for at, title in metadata.chapters) or "0:00 FlyEnv intro"
        self.upload_output.write_text(
            textwrap.dedent(
                f"""\
                # FlyEnv {metadata.product_name} Demo - Upload Package

                Final master: `{self.final_output.name}` — shared FlyEnv opener, burned English captions,
                header audio, and English neural voiceover.

                ## YouTube

                **Recommended title**

                ```
                {metadata.youtube_title}
                ```

                **Description**

                ```
                {metadata.youtube_description}
                ```

                **Chapters**

                ```
                {chapters}
                ```

                **Tags**

                ```
                {', '.join(metadata.tags)}
                ```

                - Language: English; upload `{self.srt_output.name}` as the English caption track
                - Thumbnail: `{self.youtube_cover_output.name}`
                - Audience: Not made for kids

                ## Bilibili

                **推荐标题**

                ```
                {metadata.bilibili_title}
                ```

                **简介**

                ```
                {metadata.bilibili_description}
                ```

                **标签**（最多 10 个）

                ```
                {', '.join(metadata.bilibili_tags[:10])}
                ```

                - 封面：`{self.bilibili_cover_output.name}`

                ## Files

                | File | Purpose |
                | --- | --- |
                | `{self.final_output.name}` | Upload master: header + captions + audio |
                | `{self.srt_output.name}` | English closed-caption track |
                | `{self.tsv_output.name}` | Caption source relative to the demo after the header |
                | `{self.youtube_cover_output.name}` | YouTube thumbnail, English copy |
                | `{self.bilibili_cover_output.name}` | Bilibili cover, Chinese copy |
                """
            ),
            encoding="utf-8",
        )

    def stage_assets(self) -> None:
        captions = self.scheduled_captions()
        timing = self._timing()
        self.srt_output.write_text(self.srt_contents(captions, header_offset=timing["offset"]), encoding="utf-8")
        youtube_frame = self.build / "cover_youtube_frame.png"
        bilibili_frame = self.build / "cover_bilibili_frame.png"
        self._extract_frame(self.config.source, self.config.cover.youtube_frame_at, youtube_frame)
        self._extract_frame(self.config.source, self.config.cover.bilibili_frame_at, bilibili_frame)
        self._render_cover(
            self.youtube_cover_output, (1920, 1080), youtube_frame,
            self.config.cover.youtube_eyebrow, self.config.cover.youtube_title,
            self.config.cover.youtube_body, chinese=False,
        )
        self._render_cover(
            self.bilibili_cover_output, (1920, 1200), bilibili_frame,
            self.config.cover.bilibili_eyebrow, self.config.cover.bilibili_title,
            self.config.cover.bilibili_body, chinese=True,
        )
        self.write_upload_package()

    def probe_final(self) -> None:
        self.run([
            "ffprobe", "-v", "error", "-show_entries",
            "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,pix_fmt",
            "-of", "default=nw=1", self.final_output,
        ])

    def extract_verify_frames(self) -> None:
        captions = self.scheduled_captions()
        timing = self._timing()
        final_duration = self.probe_duration(self.final_output)
        first = captions[0]
        caption_at = timing["offset"] + (first.start or 0.0) + 0.15
        frames = (
            ("01_header.png", min(1.0, max(0.0, timing["offset"] / 2))),
            ("02_demo_start.png", timing["offset"] + 0.6),
            ("03_caption.png", caption_at),
            ("04_product.png", timing["offset"] + self.config.cut_at * 0.65),
            ("05_tail.png", max(0.0, final_duration - 0.9)),
        )
        for name, at in frames:
            self._extract_frame(self.final_output, at, self.verify_dir / name)

    def stage_verify(self) -> None:
        self.probe_final()
        self.extract_verify_frames()

    # ------------------------------------------------------------ orchestration

    def run_stages(self, names: Sequence[str]) -> None:
        wanted = list(names) or ["all"]
        if wanted == ["all"]:
            wanted = list(self.order)
        stages = {
            "base": self.stage_base,
            "header": self.stage_header,
            "concat": self.stage_concat,
            "tts": self.stage_tts,
            "subs": self.stage_subs,
            "mix": self.stage_mix,
            "assets": self.stage_assets,
            "verify": self.stage_verify,
        }
        unknown = [name for name in wanted if name not in stages]
        if unknown:
            raise ValueError(f"unknown stage(s): {', '.join(unknown)}; choose from {', '.join(self.order)} or all")
        for name in wanted:
            print(f"\n=== stage: {name} ===")
            stages[name]()

    def cli(self, argv: Sequence[str] | None = None) -> None:
        try:
            self.run_stages(list(argv) if argv is not None else sys.argv[1:])
        except (RuntimeError, ValueError, subprocess.CalledProcessError) as error:
            raise SystemExit(str(error)) from error


def run_demo(config: DemoConfig, argv: Sequence[str] | None = None) -> None:
    """Convenience entry point for a task-local ``render.py`` wrapper."""

    DemoRenderer(config).cli(argv)
