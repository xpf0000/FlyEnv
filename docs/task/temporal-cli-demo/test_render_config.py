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
