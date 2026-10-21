"""Servidor de prévia em loopback, sem dependências de terceiros."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import webbrowser

class PreviewHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

def main():
    parser = argparse.ArgumentParser(description='Prévia local XUI NAXX')
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--host', default='127.0.0.1', help='Endereço de escuta; padrão local ao PC')
    args = parser.parse_args()
    directory = Path(__file__).resolve().parent / 'previa'
    handler = partial(PreviewHandler, directory=str(directory))
    for port in range(args.port, min(args.port + 20, 65536)):
        try:
            server = ThreadingHTTPServer((args.host, port), handler)
            break
        except OSError:
            continue
    else:
        raise SystemExit('Nao foi possivel abrir uma porta local. Feche outra previa e tente novamente.')
    url = f'http://127.0.0.1:{server.server_address[1]}/'
    print(f'\nPainel de teste: {url}\nDados simulados. Pressione Ctrl+C para encerrar.\n', flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == '__main__':
    main()
