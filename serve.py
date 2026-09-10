"""Serve Cloud EVA locally without depending on the current directory."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


if __name__ == "__main__":
    directory = str(Path(__file__).resolve().parent)
    handler = partial(SimpleHTTPRequestHandler, directory=directory)
    with ThreadingHTTPServer(("127.0.0.1", 8765), handler) as server:
        print("Cloud EVA: http://127.0.0.1:8765/", flush=True)
        server.serve_forever()
