import os
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT.parent / 'Deliverables' / 'Project_24I-3030_24I-3079_24I-3114_C.zip'
EXCLUDED_DIRS = {
    'node_modules', 'dist', '.turbo', 'work', 'test-results',
    '.venv', '__pycache__', '.stryker-tmp',
}


def is_excluded_coverage(rel_parts: tuple[str, ...]) -> bool:
    return 'coverage' in rel_parts and rel_parts[:3] != ('docs', 'team', 'evidence')


def include(path: Path) -> bool:
    rel = path.relative_to(ROOT)
    if any(part in EXCLUDED_DIRS for part in rel.parts) or is_excluded_coverage(rel.parts):
        return False
    if rel.parts and rel.parts[0] == 'reports' and path.suffix.lower() == '.png' and path.name.startswith(('final-report', 'final-qa', 'final-layout', 'last-check')):
        return False
    if rel.parts and rel.parts[0] == '.git' and '.git' not in rel.parts:
        return False
    name = path.name
    if name == '.env' or (name.startswith('.env.') and not name.endswith('.example')):
        return False
    if path.is_symlink():
        return False
    return path.is_file()


def main():
    git_meta = ROOT / '.git'
    if not git_meta.exists():
        raise SystemExit("The assignment archive requires the project's .git metadata.")
    files = []
    for current, directories, names in os.walk(ROOT, topdown=True, followlinks=False):
        current_path = Path(current)
        rel_dir = current_path.relative_to(ROOT)
        directories[:] = [
            name for name in directories
            if name not in EXCLUDED_DIRS
            and not is_excluded_coverage(rel_dir.parts + (name,))
            and not (current_path / name).is_symlink()
        ]
        files.extend(
            path for name in names
            if include(path := current_path / name)
        )
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(OUTPUT, 'w', compression=ZIP_DEFLATED, compresslevel=6) as archive:
        for path in files:
            archive.write(path, Path(ROOT.name) / path.relative_to(ROOT))
    print(f'Wrote {OUTPUT} with {len(files)} files (including .git history).')
    print('Excluded local environment files, dependencies, build outputs, test run folders, and scratch work.')


if __name__ == '__main__':
    main()
