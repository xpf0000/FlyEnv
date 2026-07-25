# Temporal CLI website button

## Goal

Make the website button on the Temporal CLI service tab consistent with the
other services that expose a local web UI.

## Behavior

- Determine the Temporal CLI running state from the `run` flag of its
  installed versions in `BrewStore`.
- Render the website button only while at least one Temporal CLI version is
  running.
- Use the shared green `http.svg` icon instead of Element Plus's generic
  `Link` icon.
- Leave the existing configured `ui-port` lookup and browser-opening behavior
  unchanged.

## Verification

The focused Temporal CLI module check statically asserts the conditional
rendering, running-state source, shared HTTP icon, and removal of the old
`Link` import. Formatting, linting, and diff whitespace checks cover the
changed files.
