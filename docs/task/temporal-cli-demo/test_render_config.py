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
