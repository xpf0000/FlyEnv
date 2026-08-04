# Tomcat HTTPS Site URL Design

## Goal

Make the Tomcat Hosts list display, open, and encode the correct complete URL for both HTTP and HTTPS sites.

## Root Cause

Tomcat configuration supports SSL: when a site has `useSSL`, a certificate, and a key, FlyEnv writes an HTTPS connector on `tomcat_ssl`. The Tomcat list ignores that state: its `siteName()` only derives the HTTP port and `openSite()` hard-codes `http://`. The Issue 815 QR change inherited that incorrect HTTP-only URL.

## Design

Change the Tomcat `siteName()` helper to return the complete URL, matching the standard Hosts list pattern:

- SSL sites with a certificate and key return `https://<name>` and append `:<tomcat_ssl>` unless the port is `443`.
- Other sites return `http://<name>` and append `:<tomcat>` unless the port is `80`.
- If Tomcat is not running, the helper still uses the configured site port as its fallback.

Then use `siteName()` directly for both `openSite()` and `QrcodePopper`, so all three UI surfaces use one source of truth.

## Compatibility

- HTTP Tomcat URLs retain their existing address and non-default port behavior.
- HTTPS Tomcat URLs use the existing certificate eligibility rule used by standard Hosts.
- No server configuration or generic QR component behavior changes.

## Verification

- Extend the host QR source-level regression script to require direct `siteName(scope.row)` use in the Tomcat QR code and SSL URL construction in the Tomcat list.
- Run the QR, Tomcat configuration, service web-panel, and ClickHouse regressions.
