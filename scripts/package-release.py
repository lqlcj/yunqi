"""Bundle the tested build and source without secrets, records or dependencies."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json

root = Path(__file__).resolve().parent.parent
out = root / 'release'
out.mkdir(exist_ok=True)
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
target = out / f'qing-pregnancy-v{version}.zip'
directories = ('dist', 'src', 'server', 'shared', 'public', 'scripts', 'docs', '.github')
files = ('package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts',
         'index.html', 'README.md', 'CHANGELOG.md', '.env.example', '.gitignore', '.gitattributes', '.dockerignore',
         'Dockerfile', 'Dockerfile.prebuilt', 'Dockerfile.prebuilt.dockerignore',
         'compose.yaml', 'compose.prebuilt.yaml', 'Caddyfile')
if not (root / 'dist' / 'sw.js').is_file():
    raise SystemExit('Run npm run build first')
with ZipFile(target, 'w', ZIP_DEFLATED, compresslevel=9) as archive:
    for filename in files:
        archive.write(root / filename, 'qing-pregnancy/' + filename)
    for directory in directories:
        for path in sorted((root / directory).rglob('*')):
            if path.is_file() and '__pycache__' not in path.parts:
                archive.write(path, 'qing-pregnancy/' + path.relative_to(root).as_posix())
with ZipFile(target) as archive:
    names = archive.namelist()
    assert 'qing-pregnancy/.env' not in names
    assert not any('/data/' in p or '/node_modules/' in p or '/tests/' in p or '/test-results/' in p for p in names)
    assert 'qing-pregnancy/dist/sw.js' in names
    assert archive.testzip() is None
print(f'Created {target} ({target.stat().st_size:,} bytes, {len(names)} files)')
