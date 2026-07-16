#!/usr/bin/env python3
"""Repo dependency report: size, internal-vs-external edges, version drift,
possibly-unused deps, cross-package relative-import anti-patterns.
No network calls, no external tools beyond `du`."""
import json
import re
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
PACKAGES = ["client", "server", "reviewer-core", "e2e", "evals"]
TOP_N = 15

# Source root to scan for imports, relative to each package dir. e2e has no src/,
# so its whole tree is scanned (minus EXCLUDE_DIRS below).
SRC_ROOT = {
    "client": "src",
    "server": "src",
    "reviewer-core": "src",
    "e2e": "",
    "evals": "src",
}
CODE_EXT = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}
EXCLUDE_DIRS = {"node_modules", "test-results", ".next", "dist", "build", "vendor"}
IMPORT_RE = re.compile(r'''(?:from\s+|import\(|require\()\s*["']([^"']+)["']''')


def du_kb(path: Path) -> int:
    # pnpm links node_modules/<pkg> to the content-addressable .pnpm store, so
    # symlinks must be followed (-L) or every pnpm-managed package reports 0 KB.
    try:
        out = subprocess.run(["du", "-sk", "-L", str(path)], capture_output=True, text=True, check=True)
        return int(out.stdout.split()[0])
    except Exception:
        return 0


def human(kb: int) -> str:
    mb = kb / 1024
    if mb >= 1024:
        return f"{mb / 1024:.2f} GB"
    if mb >= 1:
        return f"{mb:.1f} MB"
    return f"{kb} KB"


def list_top_level_packages(node_modules: Path):
    """Yield (package_name, path) for every installed package; @scope/* resolved one level deeper."""
    if not node_modules.is_dir():
        return
    for entry in sorted(node_modules.iterdir()):
        if entry.name == ".bin" or entry.name.startswith("."):
            continue
        if entry.name.startswith("@") and entry.is_dir():
            for scoped in sorted(entry.iterdir()):
                if scoped.is_dir():
                    yield f"{entry.name}/{scoped.name}", scoped
        elif entry.is_dir():
            yield entry.name, entry


def load_package_json(pkg_dir: Path) -> dict:
    pj = pkg_dir / "package.json"
    if not pj.is_file():
        return {}
    return json.loads(pj.read_text())


def analyze_sizes(name: str) -> dict:
    pkg_dir = REPO_ROOT / name
    manifest = load_package_json(pkg_dir)
    deps = manifest.get("dependencies", {})
    dev_deps = manifest.get("devDependencies", {})
    node_modules = pkg_dir / "node_modules"

    result = {
        "name": name,
        "direct": len(deps),
        "dev": len(dev_deps),
        "installed": node_modules.is_dir(),
        "total_kb": 0,
        "entries": [],
    }
    if not result["installed"]:
        return result

    entries = [(pkg_name, du_kb(path)) for pkg_name, path in list_top_level_packages(node_modules)]
    entries.sort(key=lambda e: e[1], reverse=True)
    result["entries"] = entries
    result["total_kb"] = sum(kb for _, kb in entries)
    return result


def analyze_internal_edges() -> list[tuple[str, str, str, str]]:
    """Detect real cross-package source edges from each package's tsconfig `paths`.

    An edge exists when a path alias resolves to a file physically located inside
    a *different* top-level package directory. `vendor` in the resolved path marks
    a copied/vendored coupling rather than a live workspace import — and note this
    repo is NOT a pnpm/npm workspace, so there is no `workspace:*` protocol involved
    at all; every cross-package edge here is a TypeScript path-alias pointing at a
    sibling package's source tree directly.
    """
    edges = []
    for name in PACKAGES:
        tsconfig_path = REPO_ROOT / name / "tsconfig.json"
        if not tsconfig_path.is_file():
            continue
        text = tsconfig_path.read_text()
        m = re.search(r'"paths"\s*:\s*\{(.*?)\n\s*\}', text, re.DOTALL)
        if not m:
            continue
        for alias, target in re.findall(r'"([^"]+)"\s*:\s*\[\s*"([^"]+)"', m.group(1)):
            if not target.startswith("./") and not target.startswith("../"):
                continue
            resolved = (tsconfig_path.parent / target).resolve()
            try:
                rel_parts = resolved.relative_to(REPO_ROOT).parts
            except ValueError:
                continue
            if not rel_parts or rel_parts[0] == name:
                continue
            kind = "vendored" if "vendor" in target else "import"
            edges.append((name, rel_parts[0], alias, kind))
    return edges


def iter_source_files(pkg_name: str):
    root = REPO_ROOT / pkg_name / SRC_ROOT[pkg_name] if SRC_ROOT[pkg_name] else REPO_ROOT / pkg_name
    if not root.is_dir():
        return
    for path in root.rglob("*"):
        if path.suffix not in CODE_EXT or not path.is_file():
            continue
        if any(part in EXCLUDE_DIRS for part in path.parts):
            continue
        yield path


def find_imports(pkg_name: str) -> list[tuple[str, Path]]:
    """(import_string, file_path) pairs across a package's source tree."""
    out = []
    for path in iter_source_files(pkg_name):
        try:
            text = path.read_text(errors="ignore")
        except Exception:
            continue
        out.extend((m.group(1), path) for m in IMPORT_RE.finditer(text))
    return out


def import_top_level_name(imp: str) -> str:
    if imp.startswith("@"):
        return "/".join(imp.split("/")[:2])
    return imp.split("/")[0]


def analyze_version_drift(manifests: dict) -> list[tuple[str, list[tuple[str, str]]]]:
    by_name: dict[str, list[tuple[str, str]]] = {}
    for pkg, manifest in manifests.items():
        for kind in ("dependencies", "devDependencies"):
            for dep_name, version in manifest.get(kind, {}).items():
                by_name.setdefault(dep_name, []).append((pkg, version))
    drift = [(dep_name, locs) for dep_name, locs in by_name.items() if len({v for _, v in locs}) > 1]
    drift.sort(key=lambda d: d[0])
    return drift


def analyze_unused(manifests: dict, all_imports: dict) -> list[tuple[str, str]]:
    unused = []
    for pkg, manifest in manifests.items():
        deps = manifest.get("dependencies", {})
        if not deps:
            continue
        imported = {import_top_level_name(imp) for imp, _ in all_imports[pkg]}
        for dep_name in deps:
            if dep_name not in imported:
                unused.append((pkg, dep_name))
    return unused


def analyze_cross_package_relative_imports(all_imports: dict) -> list[tuple[str, str, str]]:
    findings = []
    for pkg in PACKAGES:
        for imp, path in all_imports[pkg]:
            if not (imp.startswith("./") or imp.startswith("../")):
                continue
            resolved = (path.parent / imp).resolve()
            try:
                rel_parts = resolved.relative_to(REPO_ROOT).parts
            except ValueError:
                continue
            if rel_parts and rel_parts[0] != pkg and rel_parts[0] in PACKAGES:
                findings.append((pkg, str(path.relative_to(REPO_ROOT)), imp))
    return findings


def print_report():
    manifests = {name: load_package_json(REPO_ROOT / name) for name in PACKAGES}
    all_imports = {name: find_imports(name) for name in PACKAGES}
    size_results = [analyze_sizes(p) for p in PACKAGES]

    print("# Dependency size report\n")
    grand_total_kb = 0
    for r in size_results:
        print(f"## {r['name']}")
        print(f"- direct deps: {r['direct']}, devDependencies: {r['dev']}")
        if not r["installed"]:
            print("- node_modules: not installed (run pnpm install / npm install)\n")
            continue
        print(f"- node_modules total size: {human(r['total_kb'])} ({len(r['entries'])} packages)")
        print(f"- top {min(TOP_N, len(r['entries']))} heaviest:")
        for pkg_name, kb in r["entries"][:TOP_N]:
            pct = (kb / r["total_kb"] * 100) if r["total_kb"] else 0
            print(f"  {human(kb):>10}  {pct:5.1f}%  {pkg_name}")
        print()
        grand_total_kb += r["total_kb"]

    print(f"## Repo-wide total node_modules footprint: {human(grand_total_kb)}\n")

    print(f"## Repo-wide size ranking (top {TOP_N} heaviest dependency instances across all packages)")
    combined = [(name, kb, r["name"]) for r in size_results for name, kb in r["entries"]]
    combined.sort(key=lambda e: e[1], reverse=True)
    for name, kb, pkg in combined[:TOP_N]:
        print(f"  {human(kb):>10}  {name}  (in {pkg})")
    print()

    print("## Internal package edges (external npm deps NOT included here; from tsconfig `paths`, resolved cross-package only — this repo is not a pnpm/npm workspace)")
    edges = analyze_internal_edges()
    if not edges:
        print("  none detected")
    for src, dst, alias, kind in edges:
        print(f"  {src} -> {dst}  [{kind}]  via {alias}")
    print()

    print("## Version drift (same dependency name, different version string across package.json files)")
    drift = analyze_version_drift(manifests)
    if not drift:
        print("  none detected")
    for dep_name, locs in drift:
        loc_str = ", ".join(f"{pkg}@{version}" for pkg, version in locs)
        print(f"  {dep_name}: {loc_str}")
    print()

    print("## Possibly-unused dependencies (declared in `dependencies`, no import found in that package's own source tree)")
    unused = analyze_unused(manifests, all_imports)
    if not unused:
        print("  none detected")
    for pkg, dep_name in unused:
        print(f"  {pkg}/package.json declares {dep_name} — no import found under {pkg}/{SRC_ROOT[pkg] or '(package root)'}")
    print()

    print("## Cross-package relative imports (anti-pattern: reaching into a sibling package's source by relative path instead of its public entry point / tsconfig alias)")
    cross = analyze_cross_package_relative_imports(all_imports)
    if not cross:
        print("  none detected")
    for pkg, file_path, imp in cross:
        print(f"  {file_path} imports \"{imp}\" (crosses into another package's source tree)")


if __name__ == "__main__":
    print_report()
