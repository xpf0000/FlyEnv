"""Contract checks for the Typesense original-speed publishing wrapper."""

from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path
import unittest


TASK = Path(__file__).resolve().parent


def load_wrapper():
    path = TASK / "render.py"
    if not path.exists():
        raise AssertionError("render.py wrapper is missing")
    spec = importlib.util.spec_from_file_location("typesense_render", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RenderWrapperTests(unittest.TestCase):
    def test_staged_raw_capture_is_protected_and_kept_at_original_speed(self) -> None:
        wrapper = load_wrapper()

        renderer = wrapper.TypesenseRenderer(wrapper.CONFIG)
        self.assertEqual(wrapper.CONFIG.source.name, "FlyEnv-Typesense.mp4")
        self.assertEqual(
            hashlib.sha256(wrapper.CONFIG.source.read_bytes()).hexdigest(),
            wrapper.RAW_SOURCE_SHA256,
        )
        self.assertEqual(wrapper.CONFIG.cut_at, 88.033333)
        self.assertEqual(wrapper.CONFIG.header_source.name, "flyenv-header.mp4")
        self.assertIn("fps=30", renderer.base_filter())
        self.assertNotIn("setpts", renderer.base_filter())

    def test_brian_narration_describes_visible_typesense_actions(self) -> None:
        wrapper = load_wrapper()

        self.assertEqual(wrapper.CONFIG.narration.voice, "en-US-BrianNeural")
        self.assertEqual(wrapper.CONFIG.narration.rate, "-6%")
        self.assertTrue(wrapper.CAPTIONS)
        self.assertTrue(all(caption.anchor < wrapper.CONFIG.cut_at for caption in wrapper.CAPTIONS))
        narration = " ".join(caption.text for caption in wrapper.CAPTIONS)
        for visible_term in ("Version", "Configuration", "Log", "port 8108", "raft", "vars"):
            self.assertIn(visible_term, narration)
        self.assertNotIn("FlyEnv brings local development services together.", narration)

    def test_final_running_caption_is_short_enough_for_the_unchanged_tail(self) -> None:
        wrapper = load_wrapper()

        self.assertEqual(wrapper.CAPTIONS[-1].anchor, 85.3)
        self.assertEqual(wrapper.CAPTIONS[-1].text, "The release is running.")

    def test_measured_brian_minus_six_schedule_fits_inside_the_full_healthy_capture(self) -> None:
        wrapper = load_wrapper()

        self.assertTrue(
            hasattr(wrapper, "measured_schedule_fits_cut"),
            "the wrapper must protect measured voice durations, not only cue anchors",
        )
        self.assertTrue(wrapper.measured_schedule_fits_cut())

    def test_chapters_are_final_master_timed_and_meet_the_ten_second_rule(self) -> None:
        wrapper = load_wrapper()

        chapters = wrapper.CONFIG.upload.chapters
        self.assertGreaterEqual(len(chapters), 6)
        self.assertEqual(chapters[0][0], "0:00")
        self.assertTrue(wrapper.chapters_are_publishable(header_offset=5.033008, final_duration=93.066341))

    def test_all_plus_verify_requests_one_complete_render(self) -> None:
        wrapper = load_wrapper()

        self.assertEqual(wrapper.normalise_stages(["all", "verify"]), ["all"])

    def test_verify_checkpoints_name_five_distinct_final_master_frames(self) -> None:
        wrapper = load_wrapper()

        checkpoints = wrapper.verify_checkpoints(header_offset=5.033008, final_duration=93.066341)
        self.assertEqual(
            [name for name, _ in checkpoints],
            [
                "01_header.png",
                "02_opening_caption.png",
                "03_service_caption.png",
                "04_product_caption.png",
                "05_tail.png",
            ],
        )
        self.assertEqual(len({round(at, 3) for _, at in checkpoints}), 5)


if __name__ == "__main__":
    unittest.main()
