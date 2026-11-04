# MySQL Cluster 0.1.11 form corrections

## Scope and ownership

Create/edit uses one real Element Plus Form with model, rules and per-member property paths. Invalid inputs show their own reasons; submission returns before controller mutation when validation fails. Cluster name and instance name have distinct labels and duplicate reasons. Checks include required values, normalized name collisions, supported replication versions, node counts, SQL/GR port range/collisions, platform Socket/pipe syntax, absolute data directories and directory overlap. Fork's existing canonical-path, filesystem and availability checks remain authoritative.

Form values, validation refs and the native directory chooser are mounted view input state. Directory selection opens the existing public dialog with openDirectory/createDirectory/showHiddenFiles, fills only the current member, preserves the value on cancel, and ignores a result after closure, member replacement or directory locking. Picker re-entry and form submission are disabled while choosing. It does not persist data, start a process or own a background operation. Save/create and all notices continue through the existing singleton controller. Existing initialized directories remain read-only. No host, Fork, storage or lifecycle changes.

Review identified a false rejection when manually corrected GR communication ports were valid despite an overflowing original generated range. Removed the redundant derived-range block; final per-member values are validated. Regression failed before the fix and passed afterward. No other Important model/ref/picker/editing/Windows findings.

## Verification

- Eight new field-validation tests: required/error paths, separate cluster/member duplicates, self-edit exemption, SQL/GR conflicts, corrected custom GR ports, path/Socket conflicts and clearing, minimum version and Windows messages. Initial missing behavior reproduced before implementation.
- Full plugin suite: 165 total, 164 passed, one default native skip, zero failures (`/tmp/mc-form-tests.log`). Existing SFC compilation and lifecycle suites pass.
- Real Vue/Element Plus browser preview: initial submission shows cluster duplicate, root-required and instance duplicate separately with zero mutation; correction clears corresponding errors; port and directory conflicts show on their own fields; successful request contains selected directory and custom port; picker cancellation preserves the directory; ready-edit picker is disabled, prepared-edit picker works; unchanged self-edit saves without a new password; English/Windows GR renders three independent directory buttons and selecting the second changes only that row. Only host manager/native dialog transports were isolated; no real databases/filesystem dialogs were operated. Screenshot: `/tmp/mysql-cluster-form-validation.png`.
- ESLint zero errors, three existing copied-help v-html warnings; renderer operation boundary check passed; vue-tsc output byte-identical to the existing 53-diagnostic baseline (`/tmp/mc-form-{lint,boundaries,types}.log`).
- Build and 7z archive/manifest/registry checksum checks passed. Package `dist/plugins/mysql-cluster/mysql-cluster-0.1.11.flyenv-plugin`: 1,645,442 bytes, SHA-256 `f4a810b4654df2646e75067787900456501776875d75c65ec5829e172590b2f9`.
- Host src/scripts remain unchanged versus 619d7c8d. Fork did not change, so the 0.1.10 native 9.6 acceptance was not rerun for this view-only correction. No activation, release, upload or push.
