"""Contract checks for the MinIO original-speed publishing wrapper."""

from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path
import unittest


TASK = Path(__file__).resolve().parent


def load_wrapper():
    path = TASK / "render.py"
    spec = importlib.util.spec_from_file_location("minio_render", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RenderWrapperTests(unittest.TestCase):
    def test_source_is_the_staged_raw_capture_and_its_bytes_are_protected(self) -> None:
        wrapper = load_wrapper()

        self.assertEqual(wrapper.CONFIG.source.name, "FlyEnv-Minio.mp4")
        self.assertEqual(
            hashlib.sha256(wrapper.CONFIG.source.read_bytes()).hexdigest(),
            wrapper.RAW_SOURCE_SHA256,
        )

    def test_original_speed_config_keeps_the_complete_healthy_capture_and_header(self) -> None:
        wrapper = load_wrapper()

        config = wrapper.CONFIG
        self.assertEqual(config.slug, "flyenv-minio")
        self.assertEqual(config.cut_at, 101.133333)
        self.assertEqual(config.header_source.name, "flyenv-header.mp4")
        self.assertIn("fps=30", wrapper.MinioRenderer(config).base_filter())
        self.assertNotIn("setpts", wrapper.MinioRenderer(config).base_filter())

    def test_spoken_captions_stay_inside_the_selected_cut(self) -> None:
        wrapper = load_wrapper()

        self.assertTrue(wrapper.CAPTIONS)
        self.assertTrue(all(cue.anchor < wrapper.CONFIG.cut_at for cue in wrapper.CAPTIONS))
        self.assertIn("Access Keys", " ".join(cue.text for cue in wrapper.CAPTIONS))
        self.assertIn("MinIO Console", " ".join(cue.text for cue in wrapper.CAPTIONS))

    def test_voice_and_publishing_metadata_are_release_ready(self) -> None:
        wrapper = load_wrapper()

        config = wrapper.CONFIG
        self.assertEqual(config.narration.voice, "en-US-BrianNeural")
        self.assertEqual(config.narration.rate, "-6%")
        self.assertEqual(config.upload.product_name, "MinIO")
        self.assertIn("MinIO", config.upload.youtube_title)
        self.assertIn("MinIO", config.upload.bilibili_title)
        self.assertEqual(len(config.upload.chapters), 7)

    def test_documented_all_verify_invocation_runs_the_full_pipeline_once(self) -> None:
        wrapper = load_wrapper()

        self.assertEqual(wrapper.normalise_stages(["all", "verify"]), ["all"])

    def test_named_verify_frames_are_distinct_final_timeline_evidence(self) -> None:
        wrapper = load_wrapper()

        checkpoints = wrapper.verify_checkpoints(header_offset=5.033008, final_duration=106.2)
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
        self.assertEqual([round(at, 3) for _, at in checkpoints], [1.0, 5.683, 33.683, 56.183, 105.3])
        self.assertEqual(len({round(at, 3) for _, at in checkpoints}), 5)


if __name__ == "__main__":
    unittest.main()
