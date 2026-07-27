import json
import runpy
from pathlib import Path


def test_render_configuration_matches_temporal_cli_demo_requirements() -> None:
    namespace = runpy.run_path(Path(__file__).with_name("render.py"))

    assert namespace["SLUG"] == "flyenv-temporal-cli"
    assert namespace["DEMO_END"] == 102.1
    assert namespace["VOICE_NAME"] == "en-US-BrianNeural"
    assert namespace["VOICE_RATE"] == "-6%"
    assert (namespace["W"], namespace["H"], namespace["FPS"]) == (1920, 1080, 30)
    assert "SEGMENTS" not in namespace


def test_narration_is_safe_and_chronological_for_the_raw_demo() -> None:
    namespace = runpy.run_path(Path(__file__).parent / "render.py")
    narration = namespace["NARRATION"]

    assert len(narration) == 10
    anchors = [anchor for anchor, _ in narration]
    assert anchors == sorted(anchors)
    assert all(0 <= anchor < namespace["DEMO_END"] for anchor in anchors)
    assert all(sentence.endswith(".") for _, sentence in narration)
    prose = " ".join(sentence for _, sentence in narration)
    assert all(term not in prose for term in ("Docker", "browser", "workflow", "server"))


def test_subs_renders_ten_small_opaque_bars_at_header_offset_with_final_fade(
    tmp_path: Path,
) -> None:
    namespace = runpy.run_path(Path(__file__).parent / "render.py")
    runtime = namespace["stage_subs"].__globals__
    build = tmp_path / "build"
    build.mkdir()
    full_silent = build / "full_silent_1080p.mp4"
    full_silent.touch()
    timing = build / "timing.json"
    timing.write_text(json.dumps({"header_offset": 5.033008, "total": 107.133008}), encoding="utf-8")
    narration = [
        {"index": index, "start": 0.8 + index, "end": 1.8 + index, "text": f"Caption {index}"}
        for index in range(10)
    ]
    narration[3].update({"start": 24.0, "end": 29.616})
    (build / "narration.json").write_text(json.dumps(narration), encoding="utf-8")
    commands: list[list[str]] = []

    runtime.update(
        {
            "BUILD": build,
            "FULL_SILENT": full_silent,
            "TIMING": timing,
            "SUBBED": tmp_path / "subtitled.mp4",
            "run": lambda cmd: commands.append([str(part) for part in cmd]),
            "probe_duration": lambda path: 107.133008,
        }
    )

    runtime["stage_subs"]()

    bars = [command for command in commands if command[0] == "magick"]
    assert len(bars) == 10
    assert all(command[command.index("-size") + 1] == "1720x120" for command in bars)
    assert all(command[command.index("-alpha") + 1] == "off" for command in bars)
    assert all(any(argument.startswith("png24:") for argument in command) for command in bars)

    ffmpeg = commands[-1]
    filters = ffmpeg[ffmpeg.index("-filter_complex") + 1]
    assert "subtitles=" not in filters
    assert "overlay=x=160:y=864:shortest=1" in filters
    assert "between(t,5.833,7.433)" in filters
    assert "between(t,29.033,35.249)" in filters
    assert "fade=t=out:st=106.533:d=0.600" in filters
    assert ffmpeg[ffmpeg.index("-r") + 1] == "30"
    assert "-an" in ffmpeg


def test_mix_preserves_intro_audio_and_fades_audio_at_dynamic_end(tmp_path: Path) -> None:
    namespace = runpy.run_path(Path(__file__).parent / "render.py")
    runtime = namespace["stage_mix"].__globals__
    build = tmp_path / "build"
    build.mkdir()
    timing = build / "timing.json"
    timing.write_text(json.dumps({"header_offset": 5.033008, "total": 107.133008}), encoding="utf-8")
    subbed = tmp_path / "subtitled.mp4"
    voice = tmp_path / "voice.wav"
    header_audio = tmp_path / "header.wav"
    for path in (subbed, voice, header_audio):
        path.touch()
    commands: list[list[str]] = []

    runtime.update(
        {
            "TIMING": timing,
            "SUBBED": subbed,
            "VOICE": voice,
            "HEADER_AUDIO": header_audio,
            "FINAL": tmp_path / "final.mp4",
            "run": lambda cmd: commands.append([str(part) for part in cmd]),
            "probe_duration": lambda path: 107.133008,
        }
    )

    runtime["stage_mix"]()

    ffmpeg = commands[-1]
    filters = ffmpeg[ffmpeg.index("-filter_complex") + 1]
    assert "loudnorm=I=-15:TP=-1.5:LRA=7" in filters
    assert "[2:a]atrim=0:5.033[header]" in filters
    assert "amix=inputs=2:duration=longest:normalize=0:dropout_transition=0" in filters
    assert "afade=t=out:st=106.533:d=0.600" in filters
    assert ffmpeg[ffmpeg.index("-c:v") + 1] == "copy"
    assert ffmpeg[ffmpeg.index("-ar") + 1] == "48000"
    assert ffmpeg[ffmpeg.index("-ac") + 1] == "2"


def test_srt_is_regenerated_from_narration_with_header_offset(tmp_path: Path) -> None:
    namespace = runpy.run_path(Path(__file__).parent / "render.py")
    runtime = namespace["write_srt_from_narration"].__globals__
    build = tmp_path / "build"
    build.mkdir()
    timing = build / "timing.json"
    timing.write_text(json.dumps({"header_offset": 5.033008, "total": 107.133008}), encoding="utf-8")
    (build / "narration.json").write_text(
        json.dumps(
            [
                {"index": 1, "start": 0.8, "end": 2.3, "text": "First sentence."},
                {"index": 2, "start": 8.0, "end": 9.25, "text": "Second sentence."},
            ]
        ),
        encoding="utf-8",
    )
    srt = tmp_path / "captions.srt"
    runtime.update({"BUILD": build, "TIMING": timing, "SRT": srt})

    runtime["write_srt_from_narration"]()

    assert srt.read_text(encoding="utf-8") == (
        "1\n00:00:05,833 --> 00:00:07,333\nFirst sentence.\n\n"
        "2\n00:00:13,033 --> 00:00:14,283\nSecond sentence.\n"
    )


def test_bilibili_cover_uses_the_available_cjk_font(tmp_path: Path) -> None:
    namespace = runpy.run_path(Path(__file__).parent / "render.py")
    runtime = namespace["create_cover"].__globals__
    commands: list[list[str]] = []
    runtime["run"] = lambda cmd: commands.append([str(part) for part in cmd])

    runtime["create_cover"](
        tmp_path / "product.png",
        tmp_path / "bilibili.png",
        "FLYENV 演示",
        "本地一键配置",
        runtime["BILIBILI_FONT"],
    )

    command = commands[-1]
    assert command[command.index("-font") + 1] == ".Hiragino-Sans-GB-Interface-W6"
