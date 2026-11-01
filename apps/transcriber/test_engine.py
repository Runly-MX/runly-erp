"""Focused tests for the hosted-engine path and repeat collapsing.

Run: python -m unittest apps/transcriber/test_engine.py  (needs the service
requirements installed; no network, no real Whisper model).
"""

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).parent))
os.environ.setdefault("WHISPER_CPU_THREADS", "2")

import groq_engine  # noqa: E402
import main  # noqa: E402


class FakeResponse:
    def __init__(self, status=200, payload=None, headers=None):
        self.status_code = status
        self._payload = payload or {}
        self.headers = headers or {}

    def json(self):
        return self._payload


def chunk_file(tmp):
    path = Path(tmp) / "c.ogg"
    path.write_bytes(b"x")
    return path


class TranscribeChunkTests(unittest.TestCase):
    def setUp(self):
        os.environ["GROQ_API_KEY"] = "test-key"

    def test_returns_cleaned_segments_and_sends_prompt_and_language(self):
        payload = {"segments": [
            {"start": 0, "end": 2, "text": " Hola BACnet ", "no_speech_prob": 0.01, "avg_logprob": -0.2},
            {"start": 2, "end": 4, "text": "Gracias por ver", "no_speech_prob": 0.95, "avg_logprob": -1.8},
        ]}
        post = mock.Mock(return_value=FakeResponse(200, payload))
        with tempfile.TemporaryDirectory() as tmp:
            segments = groq_engine.transcribe_chunk(chunk_file(tmp), "es", "Términos: BACnet", post=post)
        self.assertEqual(segments, [{"start": 0.0, "end": 2.0, "text": "Hola BACnet"}])
        sent = post.call_args.kwargs["data"]
        self.assertEqual(sent["language"], "es")
        self.assertEqual(sent["prompt"], "Términos: BACnet")

    def test_rate_limit_waits_then_succeeds(self):
        post = mock.Mock(side_effect=[
            FakeResponse(429, headers={"retry-after": "3"}),
            FakeResponse(200, {"segments": [{"start": 0, "end": 1, "text": "ok"}]}),
        ])
        sleep = mock.Mock()
        with tempfile.TemporaryDirectory() as tmp:
            segments = groq_engine.transcribe_chunk(chunk_file(tmp), "es", None, sleep=sleep, post=post)
        self.assertEqual(len(segments), 1)
        sleep.assert_called_once_with(4.0)

    def test_long_rate_limit_gives_up_immediately(self):
        post = mock.Mock(return_value=FakeResponse(429, headers={"retry-after": "3600"}))
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(groq_engine.GroqUnavailable):
                groq_engine.transcribe_chunk(chunk_file(tmp), "es", None, sleep=mock.Mock(), post=post)
        self.assertEqual(post.call_count, 1)

    def test_client_error_is_not_retried(self):
        post = mock.Mock(return_value=FakeResponse(400))
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(groq_engine.GroqUnavailable):
                groq_engine.transcribe_chunk(chunk_file(tmp), "es", None, sleep=mock.Mock(), post=post)
        self.assertEqual(post.call_count, 1)


class TranscribeFallbackTests(unittest.TestCase):
    def test_failed_chunk_falls_back_to_local_and_records_both_engines(self):
        os.environ["GROQ_API_KEY"] = "test-key"
        with tempfile.TemporaryDirectory() as tmp:
            first, second = chunk_file(tmp), Path(tmp) / "d.ogg"
            second.write_bytes(b"x")
            chunks = [(first, 0), (second, 600)]
            hosted = [[{"start": 1.0, "end": 2.0, "text": "uno"}], groq_engine.GroqUnavailable("429")]

            def fake_hosted(*_args, **_kwargs):
                result = hosted.pop(0)
                if isinstance(result, Exception):
                    raise result
                return result

            local = mock.Mock(return_value=([{"start_ms": 500, "end_ms": 900, "text": "dos"}], 1000, "es"))
            used = set()
            with mock.patch.object(groq_engine, "split_audio", return_value=chunks), \
                    mock.patch.object(groq_engine, "transcribe_chunk", side_effect=fake_hosted), \
                    mock.patch.object(main, "transcribe_local", local), \
                    mock.patch.object(main, "wav_duration_s", return_value=1200.0):
                segments, duration_ms, _ = main.transcribe_groq(Path(tmp) / "a.wav", "es", "vocab", None, used)

        self.assertEqual([s["text"] for s in segments], ["uno", "dos"])
        self.assertEqual(segments[1]["start_ms"], 600_500)  # chunk offset applied to the local result too
        self.assertEqual(duration_ms, 1_200_000)
        self.assertEqual(used, {groq_engine.model_label(), main.local_label()})

    def test_without_key_the_local_model_is_used(self):
        os.environ.pop("GROQ_API_KEY", None)
        local = mock.Mock(return_value=([{"start_ms": 0, "end_ms": 10, "text": "hola"}], 10, "es"))
        used = set()
        with mock.patch.object(main, "transcribe_local", local):
            segments, _, _ = main.transcribe(Path("x.wav"), "es", None, "GROQ", "vocab", used)
        self.assertEqual(segments[0]["text"], "hola")
        self.assertEqual(used, {main.local_label()})


class CollapseRepeatsTests(unittest.TestCase):
    def seg(self, text):
        return {"start_ms": 0, "end_ms": 1, "text": text}

    def test_identical_consecutive_segments_are_capped(self):
        out = main.collapse_repeats([self.seg("esto es")] * 6 + [self.seg("otra cosa")])
        self.assertEqual([s["text"] for s in out], ["esto es", "esto es", "otra cosa"])

    def test_short_legitimate_repeat_survives(self):
        out = main.collapse_repeats([self.seg("Sí."), self.seg("Sí.")])
        self.assertEqual(len(out), 2)

    def test_phrase_loop_inside_one_segment_collapses(self):
        out = main.collapse_repeats([self.seg("Entonces esto es, esto es, esto es, esto es, esto es aquí")])
        self.assertEqual(out[0]["text"], "Entonces esto es aquí")

    def test_normal_text_is_untouched(self):
        text = "Vamos a hacer la conexión por medio de un dispositivo."
        self.assertEqual(main.collapse_repeats([self.seg(text)])[0]["text"], text)


class BuildPromptTests(unittest.TestCase):
    def test_keeps_the_end_when_too_long_and_orders_parts(self):
        prompt = main.build_prompt("V" * 800, "cola")
        self.assertEqual(len(prompt), main.PROMPT_MAX_CHARS)
        self.assertTrue(prompt.endswith("cola"))

    def test_empty_is_none(self):
        with mock.patch.object(main, "WHISPER_INITIAL_PROMPT", None):
            self.assertIsNone(main.build_prompt(None, ""))


if __name__ == "__main__":
    unittest.main()
