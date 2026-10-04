#!/usr/bin/env python3
"""Pull artwork out of a Figma file without needing edit access.

Read (view) access is enough. The REST API authorises against whatever the
token's own account can already open, so a file shared with you read-only
works exactly like one you own -- you are not editing the document, only
asking Figma to hand back what is already in it.

Two different things get extracted, because Figma stores them differently:

  --images   Every bitmap FILL in the document, at the resolution it was
             originally uploaded. This is the one you usually want for
             placed artwork (scanned engravings, textures): it is the
             untouched original, not a re-render, so there is no
             resampling and no guessing at a scale factor.

  --nodes    Named layers/frames RENDERED to PNG or SVG at a scale you
             choose. Use this for things that are genuinely vector inside
             Figma (logos, flourishes, brushstrokes) or for a whole frame
             composed of several layers.

Usage
-----
    export FIGMA_TOKEN='figd_...'          # Settings > Security > personal access tokens

    # everything placed as a bitmap, at original resolution
    python3 tools/figma-extract.py --file <FILE_KEY> --images --out assets/salons

    # list what is in the file first, to find the layers worth rendering
    python3 tools/figma-extract.py --file <FILE_KEY> --list

    # render specific named layers as SVG
    python3 tools/figma-extract.py --file <FILE_KEY> \
        --nodes "Ornament,Airship,Brushstroke" --format svg --out assets/salons

The FILE_KEY is the string in the file URL between /design/ (or /file/) and
the file's name.

The token is read from the environment on purpose -- never pass it as an
argument, or it lands in your shell history and in `ps` output.
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.figma.com/v1"


def die(msg, code=1):
    print("error: " + msg, file=sys.stderr)
    sys.exit(code)


def api_get(path, token):
    req = urllib.request.Request(API + path, headers={"X-Figma-Token": token})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:400]
        if e.code == 403:
            die("403 from Figma. The token is valid but this account cannot open "
                "that file, or the token is missing the file_content scope.\n  " + body)
        if e.code == 404:
            die("404 -- check the FILE_KEY.\n  " + body)
        die("HTTP %s from %s\n  %s" % (e.code, path, body))


def slugify(name, fallback):
    s = re.sub(r"[^a-zA-Z0-9]+", "-", (name or "").strip()).strip("-").lower()
    return s or fallback


def download(url, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with urllib.request.urlopen(url, timeout=120) as r:
        data = r.read()
    with open(dest, "wb") as f:
        f.write(data)
    return len(data)


def walk(node, depth=0, out=None):
    out = [] if out is None else out
    out.append((depth, node.get("name", ""), node.get("type", ""), node.get("id", "")))
    for child in node.get("children", []) or []:
        walk(child, depth + 1, out)
    return out


def image_ref_names(node, acc=None):
    """Map each bitmap fill's imageRef -> the name of a layer using it.

    The /images endpoint returns fills keyed by an opaque hash, which on its
    own gives you a folder of files named after nothing. The document tree
    knows which layer each hash is painted onto, so this walks it once and
    builds the lookup -- the difference between "fill-03-a3f9c2.png" and
    "airship-illustration.png". First layer wins when a fill is reused.
    """
    acc = {} if acc is None else acc
    for fill in node.get("fills") or []:
        ref = fill.get("imageRef")
        if ref and ref not in acc and node.get("name"):
            acc[ref] = node["name"]
    for child in node.get("children", []) or []:
        image_ref_names(child, acc)
    return acc


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--file", required=True, metavar="FILE_KEY")
    ap.add_argument("--out", default="figma-export")
    ap.add_argument("--images", action="store_true",
                    help="download every bitmap fill at original resolution")
    ap.add_argument("--list", action="store_true",
                    help="print the layer tree and exit")
    ap.add_argument("--nodes", default="",
                    help="comma-separated layer NAMES to render")
    ap.add_argument("--ids", default="",
                    help="comma-separated node IDs (e.g. 2412:31) to render. "
                         "Skips the /files document fetch entirely -- that call "
                         "is by far the most rate-limit-expensive one, so use "
                         "this once --list has told you the IDs you want. "
                         "Optionally name each as ID=filename.")
    ap.add_argument("--format", default="png", choices=["png", "svg", "jpg", "pdf"])
    ap.add_argument("--scale", type=float, default=2.0,
                    help="render scale for png/jpg (default 2 = @2x)")
    args = ap.parse_args()

    token = os.environ.get("FIGMA_TOKEN", "").strip()
    if not token:
        die("FIGMA_TOKEN is not set.\n"
            "  export FIGMA_TOKEN='figd_...'   (Figma > Settings > Security)")

    if not (args.images or args.list or args.nodes or args.ids):
        die("nothing to do -- pass --images, --list, --nodes or --ids")

    doc = None
    if args.images or args.list or args.nodes:
        doc = api_get("/files/" + urllib.parse.quote(args.file), token)
        print("file: %s  (last modified %s)" % (doc.get("name"), doc.get("lastModified")))

    if args.list:
        for depth, name, typ, nid in walk(doc["document"]):
            if typ in ("DOCUMENT", "CANVAS") or depth > 6:
                continue
            print("  " * depth + "%-40s %-12s %s" % (name[:40], typ, nid))
        return

    total = 0

    if args.images:
        meta = api_get("/files/%s/images" % urllib.parse.quote(args.file), token)
        refs = (meta.get("meta") or {}).get("images") or {}
        names = image_ref_names(doc["document"])
        if not refs:
            print("no bitmap fills found in this file")
        used = set()
        for i, (ref, url) in enumerate(sorted(refs.items()), 1):
            if not url:
                continue
            ext = "png"
            m = re.search(r"\.(png|jpg|jpeg|gif|webp)(\?|$)", url, re.I)
            if m:
                ext = m.group(1).lower()
            base = slugify(names.get(ref, ""), "fill-%02d-%s" % (i, ref[:8]))
            if base in used:                      # two layers, same name
                base = "%s-%d" % (base, i)
            used.add(base)
            dest = os.path.join(args.out, "%s.%s" % (base, ext))
            n = download(url, dest)
            total += 1
            label = names.get(ref, "(unnamed layer)")
            print("  %-44s %7.1f KB   <- %s" % (dest, n / 1024, label))

    if args.nodes:
        wanted = [w.strip().lower() for w in args.nodes.split(",") if w.strip()]
        found = {}
        for _, name, typ, nid in walk(doc["document"]):
            if name and name.strip().lower() in wanted and nid not in found.values():
                found.setdefault(name.strip(), nid)
        missing = [w for w in wanted if not any(k.lower() == w for k in found)]
        if missing:
            print("  not found (check --list for exact names): " + ", ".join(missing))
        if found:
            q = "/images/%s?ids=%s&format=%s" % (
                urllib.parse.quote(args.file),
                urllib.parse.quote(",".join(found.values())),
                args.format)
            if args.format in ("png", "jpg"):
                q += "&scale=%g" % args.scale
            res = api_get(q, token)
            for name, nid in found.items():
                url = (res.get("images") or {}).get(nid)
                if not url:
                    print("  %-40s no render returned" % name)
                    continue
                dest = os.path.join(args.out, "%s.%s" % (slugify(name, nid), args.format))
                n = download(url, dest)
                total += 1
                print("  %-52s %7.1f KB" % (dest, n / 1024))

    if args.ids:
        pairs = []
        for chunk in args.ids.split(","):
            chunk = chunk.strip()
            if not chunk:
                continue
            if "=" in chunk:
                nid, fname = chunk.split("=", 1)
                pairs.append((nid.strip(), fname.strip()))
            else:
                pairs.append((chunk, slugify(chunk, chunk.replace(":", "-"))))
        q = "/images/%s?ids=%s&format=%s" % (
            urllib.parse.quote(args.file),
            urllib.parse.quote(",".join(n for n, _ in pairs)),
            args.format)
        if args.format in ("png", "jpg"):
            q += "&scale=%g" % args.scale
        res = api_get(q, token)
        for nid, fname in pairs:
            url = (res.get("images") or {}).get(nid)
            if not url:
                print("  %-40s no render returned" % nid)
                continue
            if not fname.lower().endswith("." + args.format):
                fname = "%s.%s" % (fname, args.format)
            dest = os.path.join(args.out, fname)
            n = download(url, dest)
            total += 1
            print("  %-52s %7.1f KB" % (dest, n / 1024))

    print("done -- %d file(s) into %s/" % (total, args.out))


if __name__ == "__main__":
    main()
