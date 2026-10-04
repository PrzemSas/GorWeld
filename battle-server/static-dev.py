#!/usr/bin/env python3
"""Serve the ARC static client for local Battle Weld device testing."""

import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from functools import partial


ARC_DIR = Path(__file__).resolve().parent.parent / "arc"


class NoStoreHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1", help="bind address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8898, help="listen port (default: 8898)")
    args = parser.parse_args()
    handler = partial(NoStoreHandler, directory=str(ARC_DIR))
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"Serving {ARC_DIR} at http://{args.host}:{args.port} (Cache-Control: no-store)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
