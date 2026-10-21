#!/usr/bin/env python3
"""Verify migration Git blobs and optionally an exact checkout, using only stdlib
and read-only Git commands. No package installation, hooks, project code, network,
or Git ref/index/worktree changes. Review this file and its provenance first.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import threading
import unicodedata

MANIFEST = "MANIFIESTO-MIGRACION.json"
MAX_FILE = 100 * 1024 * 1024
MAX_MANIFEST = 16 * 1024 * 1024
LFS = b"version https://git-lfs.github.com/spec/v1"
CHUNK = 1024 * 1024
OID = re.compile(r"[0-9a-f]{40}(?:[0-9a-f]{24})?\Z")
SHA = re.compile(r"[0-9a-f]{64}\Z")
BAD = frozenset('<>:"\\|?*')
DEVICES = {"con", "prn", "aux", "nul", "clock$", "conin$", "conout$"}
DEVICES.update(p + n for p in ("com", "lpt") for n in "123456789\u00b9\u00b2\u00b3")

class VerificationError(Exception):
    pass

def require(condition, message):
    if not condition:
        raise VerificationError(message)

def safe_path(path):
    require(isinstance(path, str) and path, "Invalid relative path.")
    require(unicodedata.normalize("NFC", path) == path, "Non-normalized Unicode path.")
    require(not path.startswith("/") and "\\" not in path, "Absolute or non-portable path.")
    for part in path.split("/"):
        require(part not in ("", ".", ".."), "Unsafe path component.")
        require(not part.endswith((".", " ")), "Ambiguous Windows path component.")
        require(not any(c in BAD or ord(c) < 32 or ord(c) == 127 for c in part),
                "Invalid Windows path character.")
        folded = part.casefold()
        require(folded != ".git", "Git metadata cannot be a manifest path.")
        require(folded.split(".", 1)[0].rstrip(" ") not in DEVICES,
                "Reserved Windows device path.")
    return path

def check_paths(paths):
    require(len(paths) == len(set(paths)), "Duplicate path.")
    spellings = {}
    files = {p.casefold() for p in paths}
    for path in paths:
        safe_path(path)
        parts = path.split("/")
        for count in range(1, len(parts) + 1):
            prefix = "/".join(parts[:count])
            folded = prefix.casefold()
            old = spellings.setdefault(folded, prefix)
            require(old == prefix, "Case-colliding file or directory paths.")
            if count < len(parts):
                require(folded not in files, "File/directory path collision.")

def git_args(repo, *args):
    return ["git", "-C", str(repo), "--no-pager", "-c", "core.fsmonitor=false",
            "-c", "gc.auto=0", "-c", "maintenance.auto=false", *args]

def git_env():
    env = os.environ.copy()
    env.update(GIT_OPTIONAL_LOCKS="0", GIT_TERMINAL_PROMPT="0",
               GIT_NO_REPLACE_OBJECTS="1", GIT_PAGER="cat")
    return env

def read_git(repo, *args):
    result = subprocess.run(git_args(repo, *args), env=git_env(),
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    require(result.returncode == 0, "Git read failed; no project code was executed.")
    return result.stdout

def tree_inventory(repo, ref):
    raw_oid = read_git(repo, "rev-parse", "--verify", "--end-of-options", ref + "^{tree}")
    try:
        tree = raw_oid.decode("ascii").strip()
    except UnicodeError:
        raise VerificationError("Invalid resolved tree identifier.") from None
    require(OID.fullmatch(tree), "Invalid resolved tree identifier.")
    inventory = {}
    for item in read_git(repo, "ls-tree", "-r", "-l", "-z", tree).split(b"\0"):
        if not item:
            continue
        try:
            metadata, raw_path = item.split(b"\t", 1)
            mode, kind, oid, raw_size = metadata.decode("ascii").split()
            path = safe_path(raw_path.decode("utf-8", errors="strict"))
            size = int(raw_size)
        except (ValueError, UnicodeError):
            raise VerificationError("Invalid Git tree entry.") from None
        require(mode in ("100644", "100755") and kind == "blob",
                "Symlink, submodule, or non-regular Git entry.")
        require(OID.fullmatch(oid), "Invalid blob identifier.")
        require(0 <= size <= MAX_FILE, "File exceeds the accepted migration size.")
        require(path not in inventory, "Duplicate Git tree path.")
        inventory[path] = {"mode": mode, "oid": oid, "size": size}
    check_paths(list(inventory))
    require(MANIFEST in inventory, "Migration manifest is absent.")
    require(inventory[MANIFEST]["size"] <= MAX_MANIFEST, "Manifest is too large.")
    return inventory

def unique_object(pairs):
    obj = {}
    for key, value in pairs:
        require(key not in obj, "Duplicate JSON object key.")
        obj[key] = value
    return obj

def parse_manifest(raw, inventory):
    try:
        doc = json.loads(raw.decode("utf-8"), object_pairs_hook=unique_object)
    except (UnicodeError, json.JSONDecodeError):
        raise VerificationError("Manifest is not valid UTF-8 JSON.") from None
    require(isinstance(doc, dict), "Invalid manifest structure.")
    require(doc.get("algorithm") == "SHA-256", "Unsupported manifest algorithm.")
    require(isinstance(doc.get("files"), list), "Manifest files must be a list.")
    listed = {}
    for entry in doc["files"]:
        require(isinstance(entry, dict), "Invalid manifest file entry.")
        require(set(entry) == {"path", "size", "sha256", "mode"}, "Unexpected manifest file fields.")
        path = safe_path(entry["path"])
        require(path != MANIFEST and path not in listed, "Duplicate or self-listed manifest path.")
        size = entry["size"]
        require(type(size) is int and 0 <= size <= MAX_FILE, "Invalid manifest file size.")
        require(entry["mode"] in ("100644", "100755"), "Invalid manifest file mode.")
        digest = entry["sha256"]
        require(isinstance(digest, str) and SHA.fullmatch(digest), "Invalid SHA-256 digest.")
        listed[path] = entry
    check_paths(list(listed))
    require(set(listed) == set(inventory) - {MANIFEST}, "Manifest and Git tree inventories differ.")
    for path, entry in listed.items():
        require(entry["size"] == inventory[path]["size"], "Manifest/Git size mismatch.")
        require(entry["mode"] == inventory[path]["mode"], "Manifest/Git mode mismatch.")
    return listed

def exact(stream, size):
    data = stream.read(size)
    require(len(data) == size, "Truncated Git object stream.")
    return data

def hash_blobs(repo, inventory):
    objects = {}
    for entry in inventory.values():
        oid, size = entry["oid"], entry["size"]
        require(oid not in objects or objects[oid] == size, "Inconsistent Git object size.")
        objects[oid] = size
    process = subprocess.Popen(git_args(repo, "cat-file", "--batch"), env=git_env(),
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    feed_errors = []
    def feed():
        try:
            for oid in objects:
                process.stdin.write((oid + "\n").encode("ascii"))
            process.stdin.close()
        except (OSError, ValueError):
            feed_errors.append(True)
    feeder = threading.Thread(target=feed, daemon=True)
    feeder.start()
    hashes = {}
    try:
        for oid, expected_size in objects.items():
            header = process.stdout.readline(512)
            require(header.endswith(b"\n"), "Invalid Git object header.")
            try:
                returned_oid, kind, raw_size = header.decode("ascii").strip().split()
                size = int(raw_size)
            except (ValueError, UnicodeError):
                raise VerificationError("Invalid Git object header.") from None
            require(returned_oid == oid and kind == "blob" and size == expected_size,
                    "Git object identity/type/size mismatch.")
            digest, remaining, prefix = hashlib.sha256(), size, b""
            while remaining:
                chunk = exact(process.stdout, min(CHUNK, remaining))
                prefix += chunk[:max(0, len(LFS) - len(prefix))]
                digest.update(chunk)
                remaining -= len(chunk)
            require(exact(process.stdout, 1) == b"\n", "Invalid Git object separator.")
            require(not prefix.startswith(LFS), "Unresolved Git LFS pointer.")
            hashes[oid] = digest.hexdigest()
        feeder.join(timeout=30)
        require(not feeder.is_alive() and not feed_errors, "Git object request stream failed.")
        require(process.stdout.read(1) == b"", "Unexpected extra Git object output.")
        require(process.wait(timeout=30) == 0, "Git object read failed.")
        return hashes
    finally:
        if process.poll() is None:
            process.kill()
        process.wait(timeout=30)
        feeder.join(timeout=5)
        for stream in (process.stdin, process.stdout, process.stderr):
            if stream and not stream.closed:
                stream.close()

def redirected(info):
    return stat.S_ISLNK(info.st_mode) or bool(getattr(info, "st_file_attributes", 0) & 0x400)

def hash_file(path):
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and not redirected(info),
            "Checkout contains a non-regular or redirected file.")
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while True:
            chunk = stream.read(CHUNK)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()

def verify_checkout(repo, inventory, hashes):
    raw_root = read_git(repo, "rev-parse", "--show-toplevel")
    root = Path(os.fsdecode(raw_root).rstrip("\r\n")).resolve(strict=True)
    require(root.is_dir(), "Checkout root is absent.")
    found = []
    def walk_error(_error):
        raise VerificationError("Cannot enumerate the complete checkout.")
    for directory, dirs, files in os.walk(root, followlinks=False, onerror=walk_error):
        folder = Path(directory)
        if folder == root and ".git" in dirs:
            dirs.remove(".git")
        for name in dirs:
            sub = folder / name
            safe_path(sub.relative_to(root).as_posix())
            require(not redirected(sub.lstat()), "Redirected checkout directory.")
        for name in files:
            if folder == root and name == ".git":
                continue
            file = folder / name
            relative = safe_path(file.relative_to(root).as_posix())
            info = file.lstat()
            require(stat.S_ISREG(info.st_mode) and not redirected(info),
                    "Checkout contains a non-regular or redirected file.")
            found.append(relative)
    check_paths(found)
    require(set(found) == set(inventory), "Checkout has missing or extra files, including ignored files.")
    for path, entry in inventory.items():
        file = root.joinpath(*path.split("/"))
        require(file.lstat().st_size == entry["size"], "Checkout/Git file size mismatch.")
        require(hash_file(file) == hashes[entry["oid"]], "Checkout/Git SHA-256 mismatch.")
        if os.name != "nt":
            executable = bool(file.lstat().st_mode & 0o111)
            require(executable == (entry["mode"] == "100755"), "Checkout executable mode mismatch.")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path("."), help="Git repository (default: current).")
    parser.add_argument("--ref", default="HEAD", help="Reviewed commit, tree or ref to verify.")
    parser.add_argument("--working-tree", action="store_true", help="Also require an exact checkout.")
    args = parser.parse_args()
    try:
        repo = args.repo.resolve(strict=True)
        inventory = tree_inventory(repo, args.ref)
        raw_manifest = read_git(repo, "cat-file", "blob", inventory[MANIFEST]["oid"])
        require(len(raw_manifest) == inventory[MANIFEST]["size"], "Manifest blob size mismatch.")
        listed = parse_manifest(raw_manifest, inventory)
        hashes = hash_blobs(repo, inventory)
        for path, entry in listed.items():
            require(hashes[inventory[path]["oid"]] == entry["sha256"], "Manifest/Git SHA-256 mismatch.")
        if args.working_tree:
            verify_checkout(repo, inventory, hashes)
        total = sum(entry["size"] for entry in inventory.values())
        scope = "Git blobs and exact checkout" if args.working_tree else "Git blobs"
        print(f"VERIFIED: {len(inventory)} files ({len(listed)} manifest entries), {total} bytes; {scope}.")
        return 0
    except (VerificationError, OSError, subprocess.SubprocessError) as error:
        message = str(error) if isinstance(error, VerificationError) else "Local read failed."
        print("FAILED: " + message, file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
