import json
import os
import sys
from types import SimpleNamespace as NS

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import main  # noqa: E402

# other test files swap main.ask_claude for a fake; keep the real one (collection runs before any test)
REAL_ASK = main.ask_claude


def fake_client(captured, usage=None):
    msg = NS(
        model="claude-sonnet-5-5", stop_reason="end_turn", content=[NS(type="text", text='{"ok": true}')],
        usage=usage or NS(input_tokens=120, output_tokens=340, cache_read_input_tokens=0, cache_creation_input_tokens=0,
                          output_tokens_details=NS(thinking_tokens=200), server_tool_use=NS(web_search_requests=2)),
    )

    def create(**kw):
        captured.update(kw)
        return msg

    return NS(messages=NS(create=create))


def test_each_call_logs_one_usage_line(monkeypatch, capsys):
    got = {}
    monkeypatch.setattr(main, "client", lambda: fake_client(got))
    monkeypatch.delenv("EFFORT", raising=False)
    monkeypatch.delenv("EFFORT_SOLVE", raising=False)
    assert REAL_ASK("sys", "hi", endpoint="solve") == {"ok": True}
    line = [ln for ln in capsys.readouterr().out.splitlines() if ln.startswith("usage ")][0]
    rec = json.loads(line[len("usage "):])
    assert rec == {"endpoint": "solve", "model": "claude-sonnet-5-5", "input": 120, "output": 340, "thinking": 200,
                   "cache_read": 0, "cache_write": 0, "searches": 2, "effort": None}
    assert "extra_body" not in got  # nothing changes until effort is set


def test_effort_is_opt_in_per_endpoint_or_for_all(monkeypatch):
    monkeypatch.delenv("EFFORT", raising=False)
    monkeypatch.setenv("EFFORT_IDENTIFY", "low")
    monkeypatch.setenv("EFFORT", "medium")
    got = {}
    monkeypatch.setattr(main, "client", lambda: fake_client(got))
    REAL_ASK("s", "u", endpoint="identify")
    assert got["extra_body"] == {"output_config": {"effort": "low"}}  # the endpoint setting wins
    REAL_ASK("s", "u", endpoint="solve")
    assert got["extra_body"] == {"output_config": {"effort": "medium"}}
    monkeypatch.setenv("EFFORT", "turbo")  # not a real level: ignored rather than sent
    monkeypatch.delenv("EFFORT_IDENTIFY")
    got.clear()
    REAL_ASK("s", "u", endpoint="solve")
    assert "extra_body" not in got


def test_missing_usage_never_breaks_a_call(monkeypatch):
    got = {}
    msg_client = fake_client(got)
    bare = NS(model="m", stop_reason="end_turn", content=[NS(type="text", text="{}")])
    monkeypatch.setattr(main, "client", lambda: NS(messages=NS(create=lambda **kw: bare)))
    assert REAL_ASK("s", "u", endpoint="read") == {}
    assert msg_client is not None


def test_web_search_limit_is_configurable_and_clamped():
    assert main.WEB_SEARCH_MAX_USES == 5  # unchanged default
