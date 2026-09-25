#!/usr/bin/env python3
"""Fail the build when a Word package carries material that does not belong.

Three rules, each of which has caught a real problem:

1. Orphaned relationships and media. A part that nothing draws is invisible on
   the page and extractable by anyone who unzips the file. That is how an image
   left over from one document travelled inside every document generated from
   the same template afterwards.
2. Text inside embedded images, by OCR. Images that belong to this organisation
   are allowlisted by SHA-256, so they pass even when they contain a token;
   anything else carrying one is a finding. Replacing an allowlisted image
   means updating the policy deliberately, which is the point of the rule.
3. Known-bad images by SHA-256, so a specific image cannot return even if it is
   renamed, resized or re-encoded.

The tokens, allowlist and blocklist live in a policy file rather than in this
script, because the names involved are usually the confidential part. Put
`package-hygiene.json` next to this script, or pass `--policy`. With no policy
only rule 1 runs, which is still worth having.

    python check_package_hygiene.py <file.docx> [more ...]
    python check_package_hygiene.py --policy team-policy.json <file.docx>
    python check_package_hygiene.py --no-ocr <file.docx>

Exit 0 if every file passes, 1 if any rule fires.
"""
import argparse, hashlib, json, shutil, subprocess, sys, tempfile, zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from strip_orphans import survey                                    # noqa: E402

DEFAULT_POLICY = Path(__file__).resolve().parent / "package-hygiene.json"
TESSERACT = next((p for p in (
    shutil.which("tesseract"),
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    "/usr/bin/tesseract") if p and Path(p).exists()), None)


def load_policy(path: Path | None):
    p = path or DEFAULT_POLICY
    if not p.exists():
        return {"tokens": [], "allow_sha256": {}, "block_sha256": {}, "block_sizes": {}}
    d = json.loads(p.read_text(encoding="utf-8"))
    return {
        "tokens": [t.upper() for t in d.get("tokens", [])],
        "allow_sha256": d.get("allow_sha256", {}),
        "block_sha256": d.get("block_sha256", {}),
        "block_sizes": {int(k): v for k, v in d.get("block_sizes", {}).items()},
    }


def ocr(blob: bytes, suffix: str) -> str:
    if not TESSERACT:
        return ""
    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / f"img{suffix}"
        f.write_bytes(blob)
        try:
            r = subprocess.run([TESSERACT, str(f), "stdout"], capture_output=True, timeout=120)
            return r.stdout.decode("utf-8", "replace").upper()
        except Exception:
            return ""


def check(path: Path, policy, use_ocr=True):
    findings = []
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        data = {n: z.read(n) for n in names}

    orphan_rels, orphan_media, _ = survey(names, lambda n: data[n])
    for part, rids in orphan_rels.items():
        for rid in sorted(rids):
            findings.append(("orphaned relationship", f"{part} {rid}"))
    for m in orphan_media:
        findings.append(("orphaned media part", m))

    for n in sorted(x for x in names if x.startswith("word/media/")):
        blob = data[n]
        if not blob:
            continue
        digest = hashlib.sha256(blob).hexdigest()
        if digest in policy["block_sha256"]:
            findings.append(("blocked image", f"{n}: {policy['block_sha256'][digest]}"))
            continue
        if len(blob) in policy["block_sizes"]:
            findings.append(("blocked media size", f"{n}: {len(blob):,} bytes, {policy['block_sizes'][len(blob)]}"))
        if use_ocr and policy["tokens"] and digest not in policy["allow_sha256"]:
            hit = [t for t in policy["tokens"] if t in ocr(blob, Path(n).suffix or ".png")]
            if hit:
                findings.append(("unexpected text in image (OCR)", f"{n}: found {', '.join(hit)}"))
    return findings


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+", type=Path)
    ap.add_argument("--policy", type=Path, help="JSON policy file (default: package-hygiene.json beside this script)")
    ap.add_argument("--no-ocr", action="store_true")
    a = ap.parse_args(argv)
    policy = load_policy(a.policy)
    if not a.no_ocr and policy["tokens"] and not TESSERACT:
        print("WARNING: tesseract not found; the OCR rule cannot run", file=sys.stderr)
    failed = 0
    for f in a.files:
        findings = check(f, policy, use_ocr=not a.no_ocr)
        if findings:
            failed += 1
            print(f"FAIL  {f}")
            for kind, detail in findings:
                print(f"        {kind}: {detail}")
        else:
            print(f"PASS  {f}")
    print(f"\n{len(a.files) - failed}/{len(a.files)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
