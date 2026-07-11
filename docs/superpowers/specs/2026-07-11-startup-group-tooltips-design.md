# Startup Group Tooltips Design

## Goal

Update the top-left group control tooltip so it describes the action that will actually run, and explain the effect of selecting a default startup group.

## Top-Left Group Control

- When Startup Groups is visible and a non-empty default startup group exists, show a tooltip containing the group name.
- Chinese meaning: `启动或停止默认启动组：{name}`.
- English meaning: `Start or stop the default startup group: {name}`.
- When no default startup group is active and the control uses legacy service grouping, show a generic start/stop description.
- Chinese meaning: `启动或停止所有已显示的服务`.
- English meaning: `Start or stop all displayed services`.
- The tooltip must describe both start and stop because the control toggles based on current running state.

## Default Startup Group Setting

- Wrap the default startup group checkbox/label in an Element Plus tooltip.
- Chinese meaning: `左上角一键启停和应用自动启动服务时，将使用此启动组。`
- English meaning: `The top-left one-click control and automatic service startup will use this startup group.`
- Keep the checkbox behavior and disabled rules unchanged.

## Internationalization

- Add dedicated keys under `common.startupGroup` for the default-group tooltip, legacy group-control tooltip, and default-group setting explanation.
- Add approved Chinese and English translations; other locales use the project's existing English fallback behavior, matching recent Startup Group additions.
- Stop using the legacy `aside.groupStart` text for this control because it describes starting only.
- Use interpolation for the default startup group name.

## Regression Coverage

- Verify the top-left tooltip selects the default-group message when a default group exists.
- Verify it selects the legacy start/stop message when no default group is active.
- Verify the default checkbox has an `el-tooltip` using the dedicated startup-group explanation key.
- Verify Chinese and English strings contain the approved meanings and interpolation placeholder.
