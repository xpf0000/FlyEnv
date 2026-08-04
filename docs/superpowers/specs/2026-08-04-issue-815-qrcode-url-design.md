# Issue 815: Host QR Code URL Design

## Goal

Make every QR code shown beside a Hosts site encode the same complete URL that FlyEnv opens when the site link is clicked, so mobile scanners recognize it as a navigable web address.

## Scope

- Standard Hosts QR codes use the existing `siteName()` result, which already selects `http` or `https` and the active server's configured port.
- Tomcat Hosts QR codes use `http://` plus the existing `siteName()` result, preserving the configured Tomcat port when the service is running.
- The QR component continues to encode the string it receives; its generic behavior and other callers remain unchanged.

## Design

Both Hosts list tables already centralize browser-opening behavior in `openSite` and use `siteName()` for the displayed address. Their QR code call sites currently bypass that logic by passing the bare host name.

The fix changes only those two call sites:

1. `Host/ListTable.vue` passes `siteName(scope.row)` to `QrcodePopper`. This supplies the existing `http://`/`https://` URL, including a non-default port.
2. `Host/Tomcat/ListTable.vue` passes `` `http://${siteName(scope.row)}` ``. `siteName()` supplies the Tomcat host and configured port; `http://` matches that table's existing `openSite` behavior.

## Compatibility

- SSL-enabled standard Hosts keep their existing `https://` QR URL.
- Standard and Tomcat sites on non-default ports retain those ports in QR data.
- QR codes used by HTTP Serve or other tools are unchanged.

## Verification

- Add a focused source-level regression script checking that both Host lists pass complete URL expressions to `QrcodePopper` and no longer pass `scope.row.name` directly.
- Run the new script, the existing Tomcat server.xml test, and the service web-panel regression test.
