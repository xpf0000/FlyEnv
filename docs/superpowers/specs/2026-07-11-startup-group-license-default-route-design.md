# Startup Group License Limit and Default Route Design

## Goal

Limit unlicensed users to one startup group and make Startup Groups the preferred initial page while preserving the existing first-visible-module fallback.

## License Limit

- Use the existing `SetupStore.isActive` license state used by Hosts, Cron, language projects, and custom modules.
- An active license allows unlimited startup groups.
- Without an active license, creating the first startup group is allowed.
- Without an active license, creating another group when one or more groups already exist is locked.
- Editing and deleting existing startup groups remain available.

## Locked Add Interaction

- The top-right Add Startup Group button shows the existing lock icon and warning styling when creation is locked.
- Its tooltip explains that an unlicensed user can create only one startup group.
- Clicking the locked button opens Settings and selects the Licenses tab, matching existing licensed-feature patterns.
- The create branch of `openEditor()` repeats the license check so other creation entry points cannot bypass the limit.
- Calling `openEditor(group)` for editing bypasses the creation limit.
- The empty-state Add button remains usable because the locked state is false when there are no groups.

## Default Route

- Change the root router redirect from `/hosts` to `/startup-group`.
- Change `AppStore.currentPage` initial state from `/hosts` to `/startup-group`.
- Do not add a new fallback implementation.
- The existing Aside route watcher already checks whether `currentPage` belongs to a visible module and redirects to the first visible sidebar module when it does not.
- Therefore Startup Groups opens first when visible; when hidden, the application continues to open the first visible module according to the existing sidebar ordering.

## Internationalization

- Add Chinese and English `common.startupGroup.licenseTips` text.
- Chinese meaning: `未获得许可证，只能创建一个启动组。`
- English meaning: `Without a license, only one startup group can be created.`
- Other locales use the configured English fallback.

## Regression Coverage

- Verify unlicensed users are locked when one group already exists.
- Verify licensed users and unlicensed users with zero groups can create.
- Verify locked creation navigates to Settings and selects Licenses.
- Verify edit calls are not blocked.
- Verify router redirect and initial `currentPage` use `/startup-group`.
- Verify the existing first-visible-module route watcher remains present and unchanged in responsibility.
