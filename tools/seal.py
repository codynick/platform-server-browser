import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
files = {}
for path in sorted(root.rglob('*')):
    relative = path.relative_to(root)
    if not path.is_file() or any(part.startswith('.') or part in ('__pycache__', 'test-output') for part in relative.parts):
        continue
    if path.name == 'release.json' or path.suffix == '.pyc':
        continue
    files[relative.as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
(root / 'release.json').write_bytes((json.dumps({'version': '0.1.0-browser', 'files': files}, indent=2) + '\n').encode())
print('Sealed', len(files), 'files')
