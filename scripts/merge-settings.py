#!/usr/bin/env python3
"""Migrate model roles and add missing defaults without exposing private values."""
import json
import math
import sys


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key; resolve it before installation.")
        result[key] = value
    return result


def reject_constant(value):
    raise ValueError("Non-standard JSON numeric constant.")


def finite_float(value):
    number = float(value)
    if not math.isfinite(number):
        raise ValueError("Non-finite JSON number.")
    return number


def load(path):
    with open(path, encoding="utf-8") as stream:
        raw = stream.read()
    value = json.loads(raw, object_pairs_hook=unique_object, parse_constant=reject_constant, parse_float=finite_float)
    if not isinstance(value, dict):
        raise ValueError("Settings must be a JSON object.")
    return raw, value


def merge(existing, defaults, prefix=""):
    added = []
    for key, value in defaults.items():
        path = prefix + key
        if key not in existing:
            existing[key] = value
            added.append(path)
        elif isinstance(existing[key], dict) and isinstance(value, dict):
            added.extend(merge(existing[key], value, path + "."))
    return added


def migrate(existing):
    """Translate old slots explicitly; never guess or select a new model."""
    models = existing.get("models", {})
    legacy_keys = isinstance(models, dict) and any(key in models for key in ("freeA", "freeB", "final"))
    legacy_deep = isinstance(models, dict) and isinstance(models.get("deep"), str)
    version = existing.get("version", 1 if legacy_keys or legacy_deep else 2)
    if type(version) is not int or version not in (1, 2):
        raise ValueError("Unsupported settings version.")
    if version == 2:
        if legacy_keys or legacy_deep:
            raise ValueError("Mixed legacy and current model settings.")
        return False
    if not isinstance(models, dict) or "review" in models or isinstance(models.get("deep"), dict):
        raise ValueError("Ambiguous legacy model settings.")
    review, deep = {}, {}
    for source, target in (("freeA", "functional"), ("freeB", "risk"), ("freeB", "verifier")):
        if source in models:
            review[target] = models[source]
    for source, target in (("freeA", "functional"), ("deep", "risk"), ("final", "verifier")):
        if source in models:
            deep[target] = models[source]
    existing["models"] = {key: value for key, value in models.items() if key not in ("freeA", "freeB", "deep", "final")}
    existing["models"].update({"review": review, "deep": deep})
    existing["version"] = 2
    return True


def main():
    defaults_path, source_path, destination = sys.argv[1:]
    try:
        _, defaults = load(defaults_path)
        raw, existing = load(source_path)
        migrated = migrate(existing)
        added = merge(existing, defaults)
        content = json.dumps(existing, ensure_ascii=False, indent=2, allow_nan=False) + "\n" if added or migrated else raw
        with open(destination, "x", encoding="utf-8") as stream:
            stream.write(content)
    except (ValueError, OSError, UnicodeError, RecursionError):
        # Parser exceptions can contain secrets from the profile. Never print them.
        print("ERROR: Settings must be readable, valid JSON objects with unique keys, finite numbers, and an unambiguous supported version/model layout. No installed files were replaced. Fix the selected settings file or choose --settings FILE.", file=sys.stderr)
        return 1
    if migrated:
        print("Settings migrated 1 -> 2: review=(freeA, freeB, freeB); deep=(freeA, deep, final), ordered functional/risk/verifier. Both modes now use two initial reviewers. No new model IDs were selected.")
    print("Settings defaults added: " + (", ".join(added) if added else "none (existing values preserved)."))
    return 0


if __name__ == "__main__":
    sys.exit(main())
