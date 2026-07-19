# FlyEnv 4.17.0 Release Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an accurate English FlyEnv 4.17.0 entry to `RELEASE_NOTES.md` for Windows code signing, reduced memory usage, and the Windows scheduled-task fix.

**Architecture:** Prepend one self-contained release entry above version 4.16.2, following the established heading, separator, build-transparency, feedback, and closing conventions. Keep the copy user-focused and avoid unsupported implementation details, issue links, attribution, or performance measurements.

**Tech Stack:** Markdown, Node.js command-line assertions, Git

---

### Task 1: Add and verify the FlyEnv 4.17.0 release entry

**Files:**
- Modify: `RELEASE_NOTES.md:5`
- Reference: `docs/task/TASK-RELEASE.md`
- Reference: `docs/superpowers/specs/2026-07-19-release-notes-4.17.0-design.md`

- [x] **Step 1: Run the release-entry assertion before editing**

Run:

```bash
node -e "const s=require('fs').readFileSync('RELEASE_NOTES.md','utf8'); if(!s.includes('## [4.17.0] - 2026-07-19')) throw new Error('missing 4.17.0 release notes')"
```

Expected: command exits non-zero with `Error: missing 4.17.0 release notes`.

- [x] **Step 2: Insert the complete release entry above version 4.16.2**

Insert this Markdown immediately after the two-line document introduction:

```markdown
## [4.17.0] - 2026-07-19

# **FlyEnv v4.17.0 Update Release Notes**

## **🔐 Security & Trust**

### **1. Added Code Signing for Windows**

FlyEnv releases for Windows are now digitally signed, making it easier to verify the publisher and confirm that downloaded application files have not been altered after signing.

Special thanks to [SignPath](https://signpath.io/) for sponsoring open-source code signing for FlyEnv.

---

## **🛠️ Improvements & Bug Fixes**

### **2. Reduced Memory Usage**

FlyEnv now uses memory more efficiently during everyday operation, reducing its resource footprint and leaving more system memory available for your development services and tools.

---

### **3. Fixed Scheduled Task Execution on Windows**

Resolved an issue that could prevent scheduled tasks from executing correctly on Windows. Scheduled jobs created and managed through FlyEnv now run more reliably.

---

## **📦 Build & Transparency**

All FlyEnv installation packages are built using **[GitHub Actions](https://github.com/xpf0000/FlyEnv/actions)**. You can verify the build process and download the artifacts directly from the following links:

- **Global Build History:** [GitHub Actions](https://github.com/xpf0000/FlyEnv/actions)

---

We welcome your continued feedback and bug reports via [GitHub Issues](https://github.com/xpf0000/FlyEnv/issues)

**Enjoy the update!**

```

- [x] **Step 3: Run structural and content assertions**

Run:

```bash
node -e "const s=require('fs').readFileSync('RELEASE_NOTES.md','utf8'); const required=['## [4.17.0] - 2026-07-19','# **FlyEnv v4.17.0 Update Release Notes**','Added Code Signing for Windows','[SignPath](https://signpath.io/)','Reduced Memory Usage','Fixed Scheduled Task Execution on Windows','## **📦 Build & Transparency**']; for(const value of required){if(!s.includes(value)) throw new Error('missing: '+value)} if((s.match(/^## \[4\.17\.0\] - 2026-07-19$/gm)||[]).length!==1) throw new Error('4.17.0 entry must appear exactly once'); if(s.indexOf('## [4.17.0]')>s.indexOf('## [4.16.2]')) throw new Error('4.17.0 must precede 4.16.2'); console.log('release notes assertions passed')"
```

Expected: `release notes assertions passed`.

- [x] **Step 4: Check Markdown whitespace and inspect the scoped diff**

Run:

```bash
git diff --check -- RELEASE_NOTES.md
git diff -- RELEASE_NOTES.md
```

Expected: `git diff --check` exits zero, and the diff contains one 4.17.0 entry inserted above 4.16.2 without changes to existing release entries.

- [x] **Step 5: Commit only the implementation plan and release notes**

Run:

```bash
git add RELEASE_NOTES.md docs/superpowers/plans/2026-07-19-release-notes-4.17.0.md
git commit -m "docs: add 4.17.0 release notes"
```

Expected: one commit containing `RELEASE_NOTES.md` and this implementation plan; the pre-existing modification to `docs/task/TASK-RELEASE.md` remains uncommitted.
