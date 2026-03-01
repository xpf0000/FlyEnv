## Configuration

Set the global config

```shell
git config --global user.name "[name]"
git config --global user.email "[email]"
```

## Get started

Create a git repository

```shell
git init
```

Clone an existing git repository

```shell
git clone [url]
```

## Branching

Manage development lines.

- **List branches**:
  ```shell
  git branch
  ```
- **Create new branch**:
  ```shell
  git branch [branch-name]
  ```
- **Switch branch**:
  ```shell
  git checkout [branch-name]
  # Or with 'switch' (Git 2.23+):
  git switch [branch-name]
  ```
- **Create and switch to new branch**:
  ```shell
  git checkout -b [branch-name]
  # Or with 'switch':
  git switch -c [branch-name]
  ```
- **Merge branch** (to current branch):
  ```shell
  git merge [branch-name]
  ```
- **Delete branch**:
  ```shell
  git branch -d [branch-name]
  ```

## Inspect & Compare

Check status and history.

- **Check status**:
  ```shell
  git status
  ```
- **View commit history**:
  ```shell
  git log --oneline --graph --decorate --all
  ```
- **Show changes**:
  ```shell
  git diff
  ```

## Stash

Temporarily store uncommitted changes.

- **Save changes to stash**:
  ```shell
  git stash push -m "message"
  ```
- **List stashes**:
  ```shell
  git stash list
  ```
- **Apply stash and keep it**:
  ```shell
  git stash apply stash@{n}
  ```
- **Apply stash and delete it**:
  ```shell
  git stash pop
  ```
- **Delete specific stash**:
  ```shell
  git stash drop stash@{n}
  ```

## Commit

Commit all tracked changes

```shell
git commit -am "[commit message]"
```

Add new modifications to the last commit

```shell
git commit --amend --no-edit
```

## I’ve made a mistake

Change last commit message

```shell
git commit --amend
```

Undo most recent commit and keep changes

```shell
git reset HEAD~1
```

Undo the `N` most recent commit and keep changes

```shell
git reset HEAD~N
```

Undo most recent commit and get rid of changes

```shell
git reset HEAD~1 --hard
```

Reset branch to remote state

```shell
git fetch origin
git reset --hard origin/[branch-name]
```

## Miscellaneous

Renaming the local master branch to main

```shell
git branch -m master main
```

## Git Flow

Git Flow is a branching model designed to organize software development, release management, and emergency bug fixing.

### Core Branches

- **`master` (or `main`)**: Stores the official release history. It must always be stable and production-ready.
- **`develop`**: The primary integration branch. It contains the latest development changes for the next release.

### Supporting Branches

- **`feature/*`** (from `develop`): Used for developing new features. Once finished, they are merged back into `develop`.
- **`release/*`** (from `develop`): Used to prepare for a new production release. It allows for minor bug fixes and metadata preparation. Merged into both `master` and `develop` when finished.
- **`hotfix/*`** (from `master`): Used for critical production bug fixes. Merged into both `master` and `develop` immediately after the fix.

### Key Commands

- **New Feature**: `git checkout -b feature/feature-name develop`
- **New Release**: `git checkout -b release/v1.0.0 develop`
- **New Hotfix**: `git checkout -b hotfix/fix-name master`
- **Commit Message Format**: `<type>: <subject>` (e.g., `feat: add login`, `fix: header overlap`).
  - _Types_: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.

### Collaboration & Best Practices

- **Git Fetch vs. Pull**: Use `git fetch` to see remote changes without affecting your local code. Use `git pull` to fetch and merge into your current branch.
- **Integration Workflow**: Before pushing a feature, merge `develop` into your feature branch to resolve conflicts locally:

```shell
git checkout feature/your-feature
git merge develop
```

- **Safe Force Pushing**: Avoid `git push --force`. Use `git push --force-with-lease` to ensure you don't accidentally overwrite others' work.

### Line Endings (CRLF/LF)

Handle cross-platform line ending issues between Windows (CRLF) and Linux/macOS (LF).

#### 1. Global Configuration

- **Windows users**:
  ```shell
  git config --global core.autocrlf true
  ```
- **macOS/Linux users**:
  ```shell
  git config --global core.autocrlf input
  ```

#### 2. Using `.gitattributes` (Best Practice)

Create a `.gitattributes` file in the project root to enforce consistent line endings for everyone:

```text
# Handle line endings automatically for text files
* text=auto

# Explicitly set to LF for specific files
*.sh text eol=lf
*.js text eol=lf
```

#### 3. Refreshing/Renormalizing line endings

If you already have files with wrong line endings in your repo:

```shell
# 1. Save your work! (commit or stash)
# 2. Remove every file from Git's index
git rm --cached -r .
# 3. Rewrite the index to pick up all the new line ending configurations
git reset --hard
```

Alternative for Git 2.16+:

```shell
git add --renormalize .
```

### Git Submodules

Submodules allow you to keep another Git repository as a subdirectory of your repository.

- **Add a submodule**:
  ```shell
  git submodule add [url] [path]
  ```
- **Initialize submodules** (after cloning parent):
  ```shell
  git submodule init
  git submodule update
  ```
- **Clone with all submodules**:
  ```shell
  git clone --recursive [url]
  ```
- **Update all submodules to latest**:
  ```shell
  git submodule update --remote --merge
  ```

## Remote Management

Manage connections to other repositories.

- **Add a remote**:
  ```shell
  git remote add [name] [url]
  ```
- **List remotes**:
  ```shell
  git remote -v
  ```
- **Change remote URL**:
  ```shell
  git remote set-url [name] [url]
  ```
- **Fetch changes from remote** (no merge):
  ```shell
  git fetch [remote]
  ```
- **Pull changes and rebase local commits**:
  ```shell
  git pull --rebase [remote] [branch]
  ```
- **Delete remote branch**:
  ```shell
  git push [remote] --delete [branch]
  ```

## Advanced Stash

Precise control over temporary storage.

- **Stash specific parts of changes (interactive)**:
  ```shell
  git stash -p
  ```
- **Stash including untracked files**:
  ```shell
  git stash -u
  ```
- **Stash tracked files but keep them in index**:
  ```shell
  git stash --keep-index
  ```
- **Create a branch from a stash**:
  ```shell
  git stash branch [branch-name] stash@{n}
  ```

## Advanced Rebase

Rewrite history for a clean linear log.

- **Interactive rebase (last N commits)**:
  ```shell
  git rebase -i HEAD~N
  ```
  _Actions: `pick` (keep), `reword` (edit msg), `edit` (edit code), `squash` (merge up), `fixup` (merge up & discard msg)._
- **Auto-squash commits marked as fixups**:
  ```shell
  git rebase -i --autosquash [base-branch]
  ```
- **Continue rebase after conflict resolution**:
  ```shell
  git rebase --continue
  ```
- **Abort rebase**:
  ```shell
  git rebase --abort
  ```

## Advanced Merging

Handle complex integrations and conflicts.

- **Merge with specific strategy**:
  ```shell
  git merge -s [strategy] [branch]
  # Strategies: recursive (default), resolve, octopus, ours, subtree
  ```
- **Merge but don't commit (examine results)**:
  ```shell
  git merge --no-commit [branch]
  ```
- **Find merge base (common ancestor)**:
  ```shell
  git merge-base [branch1] [branch2]
  ```
- **Conflict Resolution**:
  1. Open files with markers `<<<<<<<`, `=======`, `>>>>>>>`.
  2. Edit to keep desired code.
  3. `git add [file]` and `git commit`.

## Tags

Mark specific points in history (usually releases).

- **List tags**:
  ```shell
  git tag
  ```
- **Lightweight tag**:
  ```shell
  git tag [tag-name]
  ```
- **Annotated tag (recommended)**:
  ```shell
  git tag -a [tag-name] -m "[message]"
  ```
- **Verify a signed tag**:
  ```shell
  git tag -v [tag-name]
  ```
- **Push tags to remote**:
  ```shell
  git push origin --tags
  ```

## Debugging & Inspection

Find bugs and examine objects.

- **Show commit/object details**:
  ```shell
  git show [commit-hash]
  ```
- **See who changed each line (blame)**:
  ```shell
  git blame [file]
  ```
- **Search text in tracked files**:
  ```shell
  git grep "[text]"
  ```
- **Binary search for bug (bisect)**:
  ```shell
  git bisect start
  git bisect bad                 # Current version is broken
  git bisect good [commit-hash]  # This old version was working
  # Git will checkout midpoints. Test and tell Git 'good' or 'bad'.
  git bisect reset               # Finish debugging
  ```
- **Verify objects in a pack file**:
  ```shell
  git verify-pack -v .git/objects/pack/pack-*.idx
  ```

## Internal Tools & Workflows

Advanced repository management.

- **View reference history (reflog)**:
  ```shell
  git reflog
  # Useful for recovering 'lost' commits after a reset.
  ```
- **Manage multiple working trees**:
  ```shell
  git worktree add [path] [branch]
  # Allows working on two branches at once in different folders.
  ```
- **Run command on all submodules**:
  ```shell
  git submodule foreach '[command]'
  ```
- **Synchronize submodule URLs**:
  ```shell
  git submodule sync
  ```

## Maintenance & Cleanup

Keep the repository healthy and small.

- **Garbage collection & optimization**:
  ```shell
  git gc --prune=now --aggressive
  ```
- **Check for corrupted objects**:
  ```shell
  git fsck
  ```
- **Remove unreachable objects**:
  ```shell
  git prune -v
  ```
- **Repack objects into efficient packfiles**:
  ```shell
  git repack -a -d
  ```

## Security & Patch Workflow

- **GPG Signing (Sign commit)**:
  ```shell
  git commit -S -m "[message]"
  ```
- **Format commits as email patches**:
  ```shell
  git format-patch [branch]
  ```
- **Apply mail patches**:
  ```shell
  git am < [patch-file]
  ```
- **Credential Storage (Permanent)**:
  ```shell
  git config --global credential.helper store
  ```
- **Credential caching (Temporary)**:
  ```shell
  git config --global credential.helper 'cache --timeout=3600'
  ```

## Useful Shortcuts & Configs

- **Enable Reuse Recorded Resolution (rerere)**:
  ```shell
  git config --global rerere.enabled true
  ```
- **Help Autocorrect (0.1s delay)**:
  ```shell
  git config --global help.autocorrect 1
  ```
- **Useful Alias**:
  ```shell
  git config --global alias.lg "log --color --graph --pretty=format:'%Cred%h%Creset -%C(yellow)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset' --abbrev-commit"
  ```

## Best Practices in Teams

- **Atomic Commits**: Each commit should represent one logical change.
- **Pull before Push**: Always sync with remote to avoid unnecessary conflicts.
- **Write descriptive messages**: Use the imperative mood (e.g., "Fix" not "Fixed").
- **Never rebase public history**: Only rebase branches that haven't been pushed yet.
- **Use meaningful branch names**: `feat/description` or `fix/bug-id`.
