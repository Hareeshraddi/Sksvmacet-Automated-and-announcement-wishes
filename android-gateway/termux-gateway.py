#!/usr/bin/env python3
"""SMS bridge for Termux on Android.

Runs a tiny HTTP server on the phone. The college backend posts
{"to": "+919164066966", "body": "..."} and this script sends it through
the phone's SIM using Termux:API (no API key, no vendor account).

Termux setup (from F-Droid, not the Play Store build):
  pkg update
  pkg install python termux-api
  termux-wake-lock
  python termux-gateway.py

Optional shared secret (recommended on shared Wi-Fi):
  GATEWAY_TOKEN=long-random-string python termux-gateway.py
"""
import json
import os
import re
import shutil
import subprocess
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("PORT", "8080"))
TOKEN = os.environ.get("GATEWAY_TOKEN", "").strip()
DEVICE = "termux"


def normalize(number):
    digits = re.sub(r"\D", "", str(number or ""))
    if len(digits) == 10:
        digits = "91" + digits
    elif len(digits) == 12 and digits.startswith("91"):
        pass
    elif len(digits) == 11 and digits.startswith("0"):
        digits = "91" + digits[1:]
    if not re.fullmatch(r"91[6-9]\d{9}", digits):
        raise ValueError("Invalid Indian mobile number")
    return "+" + digits


def send_sms(number, body):
    if not shutil.which("termux-sms-send"):
        raise RuntimeError("termux-sms-send not found. Install Termux:API with: pkg install termux-api")
    subprocess.run(
        ["termux-sms-send", "-n", normalize(number), body],
        check=True,
        timeout=120,
        capture_output=True,
        text=True,
    )


class Handler(BaseHTTPRequestHandler):
    server_version = "CollegeSmsGateway/1.0"

    def log_message(self, fmt, *args):
        print("[%s] %s" % (time.strftime("%H:%M:%S"), fmt % args), flush=True)

    def reply(self, code, payload):
        data = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def authorized(self):
        if not TOKEN:
            return True
        return self.headers.get("X-Gateway-Token", "") == TOKEN

    def do_GET(self):
        if not self.authorized():
            return self.reply(401, {"ok": False, "error": "Invalid gateway token"})
        if self.path.split("?")[0] == "/health":
            return self.reply(200, {"ok": True, "device": DEVICE, "port": PORT})
        self.reply(404, {"ok": False, "error": "Not found"})

    def do_POST(self):
        if not self.authorized():
            return self.reply(401, {"ok": False, "error": "Invalid gateway token"})
        if self.path.split("?")[0] != "/send":
            return self.reply(404, {"ok": False, "error": "Not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 100000:
                raise ValueError("Invalid request body")
            data = json.loads(self.rfile.read(length).decode("utf-8"))
            body = str(data.get("body", "")).strip()
            if not body:
                raise ValueError("Message body is empty")
            if len(body) > 4000:
                raise ValueError("Message too long")
            send_sms(data.get("to"), body)
            self.reply(200, {"ok": True, "id": str(int(time.time() * 1000))})
        except subprocess.CalledProcessError as e:
            detail = (e.stderr or e.stdout or str(e)).strip()
            if "SMS permission" in detail or "SecurityException" in detail:
                detail = "SMS permission denied. Open Termux:API once and allow SMS."
            self.reply(502, {"ok": False, "error": detail[:300]})
        except Exception as e:
            self.reply(400, {"ok": False, "error": str(e)[:300]})


if __name__ == "__main__":
    print("SMS gateway listening on 0.0.0.0:%d (token %s)" % (PORT, "enabled" if TOKEN else "disabled"), flush=True)
    print("Open Termux => keep this running. Backend URL: http://<phone-ip>:%d" % PORT, flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
