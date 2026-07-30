"""Focused contracts for the RustFS original-speed publishing wrapper."""

from __future__ import annotations

import hashlib
import importlib.util
from dataclasses import replace
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest


TASK = Path(__file__).resolve().parent


def load_wrapper():
    path = TASK / "render.py"
    if not path.exists():
        raise AssertionError("render.py wrapper is missing")
    spec = importlib.util.spec_from_file_location("rustfs_render", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RenderWrapperTests(unittest.TestCase):
    def test_source_bytes_are_protected_by_the_staged_capture_sha(self) -> None:
        wrapper = load_wrapper()

        self.assertEqual(wrapper.CONFIG.source.name, "FlyEnv-RustFS.mp4")
        self.assertEqual(
            hashlib.sha256(wrapper.CONFIG.source.read_bytes()).hexdigest(),
            wrapper.RAW_SOURCE_SHA256,
        )

    def test_original_speed_config_preserves_the_complete_healthy_capture(self) -> None:
        wrapper = load_wrapper()

        renderer = wrapper.RustFSRenderer(wrapper.CONFIG)
        self.assertEqual(wrapper.CONFIG.slug, "flyenv-rustfs")
        self.assertEqual(wrapper.CONFIG.cut_at, 137.9)
        self.assertEqual(wrapper.CONFIG.header_source.name, "flyenv-header.mp4")
        self.assertIn("fps=30", renderer.base_filter())
        self.assertNotIn("setpts", renderer.base_filter())

    def test_brian_narration_and_each_visible_cue_stay_inside_the_cut(self) -> None:
        wrapper = load_wrapper()

        self.assertEqual(wrapper.CONFIG.narration.voice, "en-US-BrianNeural")
        self.assertEqual(wrapper.CONFIG.narration.rate, "-6%")
        self.assertTrue(wrapper.CAPTIONS)
        self.assertTrue(all(cue.anchor < wrapper.CONFIG.cut_at for cue in wrapper.CAPTIONS))
        copy = " ".join(cue.text for cue in wrapper.CAPTIONS)
        self.assertIn("RustFS Console", copy)
        self.assertIn("Buckets", copy)
        self.assertIn("Access Keys", copy)
        self.assertNotIn("Docker", copy)

    def test_measured_brian_minus_six_schedule_never_runs_past_the_selected_cut(self) -> None:
        wrapper = load_wrapper()

        self.assertTrue(
            hasattr(wrapper, "measured_schedule_fits_cut"),
            "the wrapper must protect measured voice durations, not only cue anchors",
        )
        self.assertTrue(wrapper.measured_schedule_fits_cut())

    def test_verify_checkpoints_are_named_distinct_final_timeline_evidence(self) -> None:
        wrapper = load_wrapper()

        checkpoints = wrapper.verify_checkpoints(header_offset=5.033008, final_duration=142.933008)
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
        self.assertEqual(
            [round(at, 3) for _, at in checkpoints],
            [1.0, 15.183, 42.247, 83.183, 142.033],
        )
        self.assertEqual(len({round(at, 3) for _, at in checkpoints}), 5)

    def test_chapters_include_the_dynamic_header_offset_and_meet_youtube_duration_rules(self) -> None:
        wrapper = load_wrapper()

        self.assertEqual(
            wrapper.CONFIG.upload.chapters,
            (
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
        )
        mapping = wrapper.chapter_mapping(header_offset=5.033008)
        self.assertEqual([entry[0] for entry in mapping], [0, 15, 30, 45, 70, 80, 95, 115, 130])
        self.assertEqual([entry[1] for entry in mapping], [None, 10.0, 25.0, 40.0, 65.0, 75.0, 90.0, 110.0, 125.0])
        self.assertTrue(wrapper.chapters_are_publishable(header_offset=5.033008, final_duration=142.933008))

    def test_documented_all_verify_invocation_runs_the_full_pipeline_once(self) -> None:
        wrapper = load_wrapper()

        self.assertEqual(wrapper.normalise_stages(["all", "verify"]), ["all"])

    def test_upload_package_has_no_trailing_whitespace(self) -> None:
        wrapper = load_wrapper()

        with TemporaryDirectory() as temporary_directory:
            renderer = wrapper.RustFSRenderer(
                replace(wrapper.CONFIG, task_path=Path(temporary_directory))
            )
            renderer.write_upload_package()
            lines = renderer.upload_output.read_text(encoding="utf-8").splitlines()

        self.assertTrue(all(line == line.rstrip() for line in lines))


if __name__ == "__main__":
    unittest.main()
