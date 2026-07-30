"""Contract checks for the ZincSearch publishing-wrapper entry point."""

from __future__ import annotations

from dataclasses import replace
import hashlib
import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest


TASK = Path(__file__).resolve().parent


def load_wrapper():
    path = TASK / "render.py"
    spec = importlib.util.spec_from_file_location("zincsearch_render", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RenderWrapperTests(unittest.TestCase):
    def test_raw_capture_profile_and_full_healthy_cut_are_protected(self) -> None:
        wrapper = load_wrapper()

        renderer = wrapper.ZincSearchRenderer(wrapper.CONFIG)
        self.assertEqual(wrapper.CONFIG.source.name, "FlyEnv-ZincSearch.mp4")
        self.assertEqual(
            hashlib.sha256(wrapper.CONFIG.source.read_bytes()).hexdigest(),
            wrapper.RAW_SOURCE_SHA256,
        )
        self.assertEqual(wrapper.CONFIG.cut_at, 87.6)
        self.assertEqual(wrapper.CONFIG.header_source.name, "flyenv-header.mp4")
        self.assertIn("fps=30", renderer.base_filter())
        self.assertNotIn("setpts", renderer.base_filter())

    def test_brian_narration_stays_on_visible_zincsearch_actions(self) -> None:
        wrapper = load_wrapper()

        self.assertEqual(wrapper.CONFIG.narration.voice, "en-US-BrianNeural")
        self.assertEqual(wrapper.CONFIG.narration.rate, "-6%")
        self.assertTrue(all(cue.anchor < wrapper.CONFIG.cut_at for cue in wrapper.CAPTIONS))
        narration = " ".join(cue.text for cue in wrapper.CAPTIONS)
        for visible_term in ("Version", "0.4.10", "Configuration", "4080", "interface", "0.4.5"):
            self.assertIn(visible_term, narration)
        self.assertNotIn("log output", narration.lower())

    def test_release_list_caption_waits_for_the_visible_version_tab(self) -> None:
        wrapper = load_wrapper()

        release_cue = wrapper.CAPTIONS[0]
        self.assertEqual(release_cue.anchor, 10.2)
        self.assertIn("Version tab", release_cue.text)

    def test_start_caption_finishes_before_configuration_appears(self) -> None:
        wrapper = load_wrapper()

        self.assertEqual(wrapper.CAPTIONS[4].text, "Open the 0.4.10 folder.")
        self.assertEqual(wrapper.CAPTIONS[5].text, "Start version 0.4.10.")
        self.assertEqual(wrapper.MEASURED_BRIAN_MINUS_SIX_DURATIONS[4:6], (3.624, 3.168))
        schedule = wrapper.measured_brian_minus_six_schedule()
        self.assertEqual((schedule[5].start, schedule[5].end), (41.0, 44.168))
        self.assertEqual(schedule[6].start, 44.6)

    def test_running_caption_finishes_before_the_local_interface_opens(self) -> None:
        wrapper = load_wrapper()

        self.assertEqual(wrapper.CAPTIONS[7].text, "0.4.10 is running.")
        self.assertEqual(wrapper.MEASURED_BRIAN_MINUS_SIX_DURATIONS[7], 3.216)
        schedule = wrapper.measured_brian_minus_six_schedule()
        self.assertEqual(schedule[7].end, 55.016)
        self.assertEqual(schedule[8].start, 55.6)

    def test_measured_brian_schedule_fits_the_retained_raw_tail(self) -> None:
        wrapper = load_wrapper()

        self.assertTrue(wrapper.measured_schedule_fits_cut())

    def test_final_running_caption_is_short_enough_for_the_unchanged_tail(self) -> None:
        wrapper = load_wrapper()

        self.assertEqual(wrapper.CAPTIONS[-1].text, "0.4.5 is running.")
        self.assertEqual(wrapper.MEASURED_BRIAN_MINUS_SIX_DURATIONS[-1], 2.856)
        self.assertEqual(wrapper.measured_brian_minus_six_schedule()[-1].end, 87.356)

    def test_chapters_are_header_timed_and_each_interval_is_publishable(self) -> None:
        wrapper = load_wrapper()

        self.assertTrue(
            wrapper.chapters_are_publishable(header_offset=5.033333, final_duration=92.7)
        )
        self.assertTrue(
            wrapper.bilibili_chapters_are_publishable(
                header_offset=5.033333, final_duration=92.7
            )
        )

    def test_upload_package_has_a_chinese_bilibili_timeline(self) -> None:
        wrapper = load_wrapper()

        with TemporaryDirectory() as temporary_directory:
            renderer = wrapper.ZincSearchRenderer(
                replace(wrapper.CONFIG, task_path=Path(temporary_directory))
            )
            renderer.write_upload_package()
            package = renderer.upload_output.read_text(encoding="utf-8")

        self.assertIn("0:00 FlyEnv 开场", package)
        self.assertIn("1:15 启动 ZincSearch 0.4.5", package)
        self.assertNotIn("\n                ##", package)

    def test_all_plus_verify_requests_one_complete_render(self) -> None:
        wrapper = load_wrapper()

        self.assertEqual(wrapper.normalise_stages(["all", "verify"]), ["all"])

    def test_verify_checkpoints_name_five_distinct_final_master_frames(self) -> None:
        wrapper = load_wrapper()

        checkpoints = wrapper.verify_checkpoints(header_offset=5.033333, final_duration=92.7)
        self.assertEqual(
            [name for name, _ in checkpoints],
            [
                "01_header.png",
                "02_releases_caption.png",
                "03_configuration_caption.png",
                "04_interface_caption.png",
                "05_tail.png",
            ],
        )
        self.assertEqual(len({round(at, 3) for _, at in checkpoints}), 5)


if __name__ == "__main__":
    unittest.main()
