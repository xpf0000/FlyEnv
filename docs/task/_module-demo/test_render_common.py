from pathlib import Path

import pytest

from render_common import (
    Caption,
    CoverMetadata,
    DemoConfig,
    DemoRenderer,
    NarrationSettings,
    UploadMetadata,
    schedule_captions,
    srt_time,
)


def make_config(tmp_path: Path) -> DemoConfig:
    return DemoConfig(
        task_path=tmp_path,
        source=Path("/recordings/FlyEnv-Example.mp4"),
        header_source=Path("/recordings/flyenv-header.mp4"),
        slug="flyenv-example",
        cut_at=42.0,
        captions=(
            Caption(0.6, "First caption."),
            Caption(1.0, "Second caption."),
        ),
        narration=NarrationSettings(),
        cover=CoverMetadata(
            youtube_title=("Example", "Without Docker"),
            bilibili_title=("Example", "本地一键运行"),
            youtube_frame_at=12.0,
            bilibili_frame_at=20.0,
        ),
        upload=UploadMetadata(
            product_name="Example",
            youtube_title="Run Example Locally Without Docker — FlyEnv Demo",
            bilibili_title="不用 Docker，本地一键运行 Example — FlyEnv 演示",
            youtube_description="English upload copy.",
            bilibili_description="中文上传文案。",
            tags=("FlyEnv", "Example"),
            bilibili_tags=("FlyEnv", "Example", "本地开发"),
        ),
    )


def test_schedule_never_overlaps_and_preserves_each_anchor() -> None:
    scheduled = schedule_captions(
        [Caption(0.6, "First"), Caption(1.0, "Second"), Caption(9.0, "Third")],
        [0.7, 0.6, 0.5],
        gap=0.28,
    )

    assert [(cue.start, cue.end) for cue in scheduled] == [
        (0.6, 1.3),
        (1.58, 2.18),
        (9.0, 9.5),
    ]
    assert all(cue.start >= cue.anchor for cue in scheduled)
    assert all(left.end + 0.28 <= right.start for left, right in zip(scheduled, scheduled[1:]))


def test_schedule_rejects_mismatched_caption_and_duration_lists() -> None:
    with pytest.raises(ValueError, match="same length"):
        schedule_captions([Caption(0.6, "Only")], [], gap=0.28)


def test_schedule_rounds_to_milliseconds_without_moving_before_an_anchor() -> None:
    scheduled = schedule_captions([Caption(0.6004, "Precise")], [0.1001], gap=0.28)

    assert scheduled[0].start == 0.601
    assert scheduled[0].end == 0.702
    assert scheduled[0].start >= scheduled[0].anchor


def test_srt_timestamp_is_zero_padded_and_caption_blocks_include_header_offset(tmp_path: Path) -> None:
    renderer = DemoRenderer(make_config(tmp_path))
    scheduled = schedule_captions(list(renderer.config.captions), [0.7, 0.6], gap=0.28)

    assert srt_time(65.008) == "00:01:05,008"
    assert renderer.srt_contents(scheduled, header_offset=5.085) == (
        "1\n00:00:05,685 --> 00:00:06,385\nFirst caption.\n\n"
        "2\n00:00:06,665 --> 00:00:07,265\nSecond caption.\n"
    )


def test_base_and_header_commands_normalize_to_original_speed_export_profile(tmp_path: Path) -> None:
    commands: list[list[str]] = []
    renderer = DemoRenderer(make_config(tmp_path), runner=commands.append)

    renderer.stage_base()
    renderer.stage_header()

    base, header_video, header_audio = commands
    assert base[:5] == ["ffmpeg", "-y", "-v", "error", "-stats"]
    assert "-t" in base and base[base.index("-t") + 1] == "42.000"
    assert "setpts" not in " ".join(base)
    base_filter = base[base.index("-vf") + 1]
    header_filter = header_video[header_video.index("-vf") + 1]
    assert "scale=1920:1080:flags=lanczos,fps=30" in base_filter
    assert "fade=t=out:st=41.400:d=0.600" in base_filter
    assert "-an" in base
    assert renderer.x264_profile() == [
        "-c:v", "libx264", "-profile:v", "high", "-preset", "medium", "-crf", "19",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    ]
    assert "-an" in header_video
    assert header_filter == "scale=1920:1080:flags=lanczos,fps=30,format=yuv420p"
    assert header_audio[header_audio.index("-vn")] == "-vn"
    assert "pcm_s16le" in header_audio


def test_tts_and_final_mux_commands_keep_header_audio_and_publishable_audio_profile(tmp_path: Path) -> None:
    commands: list[list[str]] = []
    durations = iter((0.7, 0.6, 47.085))
    renderer = DemoRenderer(
        make_config(tmp_path),
        runner=commands.append,
        duration_probe=lambda _: next(durations),
        tts_available=lambda: True,
    )
    scheduled = renderer.generate_caption_audio()

    renderer.write_caption_audio(scheduled, header_offset=5.085, total_duration=47.085)
    renderer.stage_mix()

    edge_tts = commands[0]
    voice_mix = commands[4]
    final_mux = commands[-1]
    assert edge_tts[0] == "edge-tts"
    assert "en-US-BrianNeural" in edge_tts
    assert "--rate=-6%" in edge_tts
    assert "adelay=5685|5685" in voice_mix[voice_mix.index("-filter_complex") + 1]
    filter_graph = final_mux[final_mux.index("-filter_complex") + 1]
    assert "loudnorm=I=-15:TP=-1.5:LRA=7" in filter_graph
    assert "amix=inputs=2:normalize=0" in filter_graph
    assert "alimiter=limit=0.97" in filter_graph
    assert final_mux.count("-i") == 3
    assert ["-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"] == final_mux[
        final_mux.index("-c:a"):final_mux.index("-c:a") + 8
    ]
    assert "+faststart" in final_mux
