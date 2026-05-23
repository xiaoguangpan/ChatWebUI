from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class UTF8Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".md": "text/markdown; charset=utf-8",
        ".txt": "text/plain; charset=utf-8",
    }


if __name__ == "__main__":
    server = ThreadingHTTPServer(("", 5500), UTF8Handler)
    print("Serving HTTP on http://localhost:5500/ with UTF-8 headers")
    server.serve_forever()
