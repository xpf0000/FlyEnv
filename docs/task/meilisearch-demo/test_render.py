"""Focused contract checks for the task-local Meilisearch render wrapper."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest


def load_wrapper():
    path = Path(__file__).with_name("render.py")
    spec = importlib.util.spec_from_file_location("meilisearch_render", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RenderWrapperTests(unittest.TestCase):
    def test_wrapper_uses_full_speed_healthy_cut_and_brian_voice(self) -> None:
        wrapper = load_wrapper()

        config = wrapper.CONFIG
        self.assertEqual(config.slug, "flyenv-meilisearch")
        self.assertEqual(config.cut_at, 163.6)
        self.assertEqual(config.source.name, "FlyEnv-Meilisearch.mp4")
        self.assertEqual(config.header_source.name, "flyenv-header.mp4")
        self.assertEqual(config.narration.voice, "en-US-BrianNeural")
        self.assertEqual(config.narration.rate, "-6%")
        self.assertEqual(
            config.captions[0].text,
            "Manage Meilisearch from the FlyEnv desktop app.",
        )
        self.assertTrue(all(caption.anchor < config.cut_at for caption in config.captions))

    def test_all_plus_verify_is_a_valid_full_render_invocation(self) -> None:
        wrapper = load_wrapper()

        self.assertEqual(wrapper.normalise_stages(["all", "verify"]), ["all"])

    def test_narration_covers_the_visible_environment_controls(self) -> None:
        wrapper = load_wrapper()

        self.assertTrue(any("environment" in cue.text.lower() for cue in wrapper.CAPTIONS))

    def test_upload_package_keeps_shared_markdown_headings_out_of_code_blocks(self) -> None:
        wrapper = load_wrapper()

        self.assertEqual(
            wrapper.strip_shared_indent("                # Heading\nPlain paragraph\n"),
            "# Heading\nPlain paragraph\n",
        )
