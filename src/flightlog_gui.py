from __future__ import annotations

import argparse
import json
import uuid
from pathlib import Path

from flask import Flask, jsonify, render_template, request
from werkzeug.utils import secure_filename

from flightlog_core import DJIParseError, DJILogAnalyzer, summarize_flight


BASE_DIR = Path(__file__).resolve().parent
RUNTIME_DIR = BASE_DIR / "runtime_data"
PARSER_BIN = BASE_DIR / "dji-log.exe"
SAMPLE_JSON = BASE_DIR / "json"

RUNTIME_DIR.mkdir(exist_ok=True)

app = Flask(__name__, template_folder="templates", static_folder="static")
app.config["MAX_CONTENT_LENGTH"] = 128 * 1024 * 1024
app.config["TEMPLATES_AUTO_RELOAD"] = True
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
app.jinja_env.auto_reload = True


def _load_sample_analysis() -> dict:
    if not SAMPLE_JSON.exists():
        raise FileNotFoundError(f"Sample JSON file not found: {SAMPLE_JSON}")
    with SAMPLE_JSON.open("r", encoding="utf-8") as handle:
        return summarize_flight(json.load(handle))


def _build_session_dir() -> Path:
    session_dir = RUNTIME_DIR / uuid.uuid4().hex
    session_dir.mkdir(parents=True, exist_ok=False)
    return session_dir


@app.get("/")
def index():
    return render_template("index.html", sample_available=SAMPLE_JSON.exists())


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "parser_exists": PARSER_BIN.exists()})


@app.get("/api/sample")
def sample():
    try:
        analysis = _load_sample_analysis()
        return jsonify(
            {
                "ok": True,
                "analysis": analysis,
                "artifact": {
                    "source": str(SAMPLE_JSON),
                    "decrypted_output": None,
                },
            }
        )
    except Exception as exc:  # pragma: no cover - exposed as API response
        return jsonify({"ok": False, "error": str(exc)}), 500


@app.post("/api/analyze")
def analyze():
    api_key = (request.form.get("api_key") or "").strip()
    upload = request.files.get("flight_record")

    if not api_key:
        return jsonify({"ok": False, "error": "API key is required."}), 400
    if upload is None or not upload.filename:
        return jsonify({"ok": False, "error": "FlightRecord.txt file is required."}), 400
    if not PARSER_BIN.exists():
        return jsonify({"ok": False, "error": f"Parser executable not found: {PARSER_BIN}"}), 500

    session_dir = _build_session_dir()
    filename = secure_filename(upload.filename) or "FlightRecord.txt"
    upload_path = session_dir / filename
    decrypted_path = session_dir / f"{upload_path.stem}_decrypted.txt"
    normalized_path = session_dir / "analysis.json"

    try:
        upload.save(str(upload_path))
        analyzer = DJILogAnalyzer(PARSER_BIN, api_key)
        raw_data = analyzer.parse_log(upload_path, decrypted_path)
        analysis = summarize_flight(raw_data)
        normalized_path.write_text(
            json.dumps(analysis, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return jsonify(
            {
                "ok": True,
                "analysis": analysis,
                "artifact": {
                    "upload": str(upload_path),
                    "decrypted_output": str(decrypted_path),
                    "normalized_output": str(normalized_path),
                },
            }
        )
    except (DJIParseError, FileNotFoundError, ValueError) as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    except Exception as exc:  # pragma: no cover - exposed as API response
        return jsonify({"ok": False, "error": f"Unexpected error: {exc}"}), 500


def main() -> None:
    parser = argparse.ArgumentParser(description="DJI FlightRecord GUI server")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host")
    parser.add_argument("--port", type=int, default=5000, help="Bind port")
    parser.add_argument("--debug", action="store_true", help="Enable Flask debug mode")
    args = parser.parse_args()

    app.run(host=args.host, port=args.port, debug=args.debug)


if __name__ == "__main__":
    main()
