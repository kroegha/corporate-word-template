#!/usr/bin/env python3
"""Remove orphaned relationships and media parts from a .docx.

A Word package can keep an image long after the picture that drew it was
deleted: the media part and its relationship stay, invisible on the page but
extractable by anyone who unzips the file. That is how another client's
architecture diagram travelled inside every Bios document generated from the
house template. Run this over any generated .docx before it is returned.

    python strip_orphans.py <file.docx> [more.docx ...]      rewrite in place
    python strip_orphans.py --dry-run <file.docx>            report only

Only parts nothing references are removed, so the rendered document cannot
change. Geometry, styles, numbering, content controls, headers and footers are
untouched.
"""
import argparse, os, re, shutil, sys, tempfile, zipfile
from pathlib import Path

IMAGE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
RID_REF = re.compile(r'r:(?:embed|id|link)="([^"]+)"')
REL_TAG = re.compile(r'<Relationship\b[^>]*/>|<Relationship\b[^>]*>.*?</Relationship>', re.S)


def _owner(rels_part: str) -> str:
    """word/_rels/document.xml.rels -> word/document.xml"""
    p = Path(rels_part)
    parent = str(p.parent.parent).replace("\\", "/")
    base = p.name[:-5]
    return f"{parent}/{base}" if parent != "." else base


def survey(names, read):
    """Return (orphan_rel_ids_by_part, orphan_media, kept_media)."""
    used_by_part = {}
    for n in names:
        if n.endswith(".xml") and not n.endswith(".rels"):
            used_by_part[n] = set(RID_REF.findall(read(n).decode("utf-8", "replace")))

    orphan_rels, referenced_media = {}, set()
    for n in names:
        if not n.endswith(".rels"):
            continue
        xml = read(n).decode("utf-8", "replace")
        owner, used = _owner(n), used_by_part.get(_owner(n), set())
        for tag in REL_TAG.findall(xml):
            typ = re.search(r'Type="([^"]+)"', tag)
            rid = re.search(r'Id="([^"]+)"', tag)
            tgt = re.search(r'Target="([^"]+)"', tag)
            if not (typ and rid and tgt) or typ.group(1) != IMAGE_REL:
                continue
            if re.search(r'TargetMode="External"', tag):
                continue
            if rid.group(1) in used:
                referenced_media.add(_resolve(owner, tgt.group(1)))
            else:
                orphan_rels.setdefault(n, set()).add(rid.group(1))

    media = {n for n in names if n.startswith("word/media/") and not n.endswith("/")}
    return orphan_rels, sorted(media - referenced_media), referenced_media


def _resolve(owner_part: str, target: str) -> str:
    base = Path(owner_part).parent
    return str((base / target).as_posix()).replace("//", "/")


def strip(path: Path, dry_run=False):
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        data = {n: z.read(n) for n in names}
        infos = {n: z.getinfo(n) for n in names}
    orphan_rels, orphan_media, _ = survey(names, lambda n: data[n])

    n_rels = sum(len(v) for v in orphan_rels.values())
    if dry_run or (not n_rels and not orphan_media):
        return n_rels, orphan_media

    for part, rids in orphan_rels.items():
        xml = data[part].decode("utf-8", "replace")
        def drop(m):
            rid = re.search(r'Id="([^"]+)"', m.group(0))
            return "" if rid and rid.group(1) in rids else m.group(0)
        data[part] = REL_TAG.sub(drop, xml).encode("utf-8")

    keep = [n for n in names if n not in set(orphan_media)]
    fd, tmp_name = tempfile.mkstemp(suffix=".docx", dir=str(path.parent))
    os.close(fd)                      # Windows will not rename over an open handle
    tmp = Path(tmp_name)
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as out:
        for n in keep:
            zi = zipfile.ZipInfo(n, date_time=infos[n].date_time)
            zi.compress_type = infos[n].compress_type
            zi.external_attr = infos[n].external_attr
            out.writestr(zi, data[n])
    shutil.move(str(tmp), str(path))
    return n_rels, orphan_media


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+", type=Path)
    ap.add_argument("--dry-run", action="store_true", help="report without rewriting")
    a = ap.parse_args(argv)
    total = 0
    for f in a.files:
        rels, media = strip(f, a.dry_run)
        total += rels + len(media)
        verb = "would remove" if a.dry_run else "removed"
        if rels or media:
            print(f"{f}: {verb} {rels} orphaned relationship(s), {len(media)} media part(s)")
            for m in media:
                print(f"    {m}")
        else:
            print(f"{f}: clean")
    return 0


if __name__ == "__main__":
    sys.exit(main())
