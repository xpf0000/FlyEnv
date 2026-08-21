# Language Pack Differences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make every language pack match the checked namespace keys while removing only the five reported unused host keys.

**Architecture:** Use `src/lang/check.mjs` as the source of truth. Remove the reported unused keys from their existing `en`, `fa`, and `zh` files, then add translated values for the reported missing keys in the affected JSON files without deleting any language pack.

**Tech Stack:** JSON language packs, Node.js verification script.

---

### Task 1: Apply the reported language-pack corrections

**Files:**
- Modify: `src/lang/{en,fa,zh}/host.json` for the five reported unused keys.
- Modify: affected `base.json`, `common.json`, `feedback.json`, `host.json`, `opencode.json`, `php.json`, and `setup.json` files under `src/lang/*` for reported missing keys.

- [x] Remove only `host.tomcatAddContext`, `host.tomcatRewriteContent`, `host.tomcatContextPathInvalid`, `host.tomcatDocBaseRequired`, and `host.tomcatNameConflict` from the three reported files.
- [x] Add natural-language translations for every missing key reported by `check.mjs`, preserving placeholders and JSON structure.

### Task 2: Verify the result

**Files:**
- Test: `src/lang/check.mjs`

- [x] Run `node src/lang/check.mjs` and confirm there are no missing files, missing keys, or unused keys.
- [x] Inspect `git diff --check` and the final diff to confirm only the requested language-pack entries and this plan changed.
