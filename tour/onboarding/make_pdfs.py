"""Build the onboarding PDFs and preview shots. One headless browser, one page, reused for every file.

python -E tour/onboarding/make_pdfs.py                 -> jackson + template PDFs
python -E tour/onboarding/make_pdfs.py jackson         -> one roofer
python -E tour/onboarding/make_pdfs.py jackson --shots <dir>   -> also desktop + phone screenshots into <dir>
PDFs land in tour/onboarding/pdf/<roofer>/ : one per page plus <roofer>-onboarding-packet.pdf (all pages merged).
"""
import pathlib, sys
from playwright.sync_api import sync_playwright

D = pathlib.Path(__file__).resolve().parent
PAGES = ['welcome', 'needs', 'timeline', 'kickoff', 'rep-quickstart', 'faq', 'intake']
argv = sys.argv[1:]
shots = None
if '--shots' in argv:
    i = argv.index('--shots'); shots = pathlib.Path(argv[i + 1]); del argv[i:i + 2]
    shots.mkdir(parents=True, exist_ok=True)
args = [a for a in argv if not a.startswith('--')]
roofers = args or ['jackson', 'template']

with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--disable-gpu', '--renderer-process-limit=1'])
    pg = b.new_page(viewport={'width': 1100, 'height': 1400})
    for r in roofers:
        out = D / 'pdf' / r; out.mkdir(parents=True, exist_ok=True)
        files = []
        for p in PAGES:
            pg.goto((D / f'{p}.html').as_uri() + f'?roofer={r}&print=1'); pg.wait_for_timeout(400)
            f = out / f'{r}-{p}.pdf'
            pg.pdf(path=str(f), format='Letter', print_background=True, margin={'top': '0.5in', 'bottom': '0.5in', 'left': '0.55in', 'right': '0.55in'})
            files.append(f); print('pdf', f.relative_to(D))
        try:
            from pypdf import PdfWriter
            w = PdfWriter()
            for f in files: w.append(str(f))
            w.write(str(out / f'{r}-onboarding-packet.pdf')); w.close(); print('pdf', f'pdf/{r}/{r}-onboarding-packet.pdf')
        except ImportError:
            print('pypdf missing: per-page PDFs only')
        if shots and r != 'template':
            for p in ['index'] + PAGES:
                for name, vw, vh in (('desk', 1280, 900), ('phone', 390, 844)):
                    pg.set_viewport_size({'width': vw, 'height': vh})
                    pg.goto((D / f'{p}.html').as_uri() + f'?roofer={r}'); pg.wait_for_timeout(300)
                    pg.screenshot(path=str(shots / f'{r}-{p}-{name}.png'), full_page=(name == 'desk'))
            pg.set_viewport_size({'width': 1100, 'height': 1400})
            print('shots', shots)
    b.close()
