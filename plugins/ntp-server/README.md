# NTP Server

In FlyEnv, open **NTP Server → Version Manager** and choose a version from GitHub Releases. The plugin lists stable releases with an uploaded ZIP and SHA-256 digest for the current Windows, macOS, or Linux x64/ARM64 runtime. It verifies the ZIP before extraction. Version listings use FlyEnv's standard one-hour cache.

1. Open **Configuration File**. Use FlyEnv's raw JSON editor or switch to **Quick Settings** to choose real time, a running offset, or a frozen date and time. The date picker uses the local time zone and stores UTC. **Reset to real time** changes the draft's clock mode.
2. Save with the editor's toolbar and start the server from **Service**. Saving while the service is running uses FlyEnv's standard restart behavior.
3. Click the green network button in **Service** for the client address and UDP port. The default listener is `0.0.0.0:12300`. Connect on this computer using `127.0.0.1:12300`, or from another device using the FlyEnv computer's LAN IP and UDP port `12300`. Clients that require the standard UDP port need the service on `123`.
4. Open **Log** for client requests and startup errors. Client request logging can be toggled in **Configuration File**.

Only clients pointed at this NTP server receive the simulated clock. The host clock is unaffected. Real-time mode without synchronization can return an unsynchronized response, which some NTP clients ignore.

The plugin keeps `config.json`, `ntp.log`, and `ntp-start-error.log` in `<FlyEnv data directory>/server/ntp-server`. It creates the configuration on first open or first start and keeps it across executable reinstalls.

## Development

- The host's Version Manager owns catalog loading and install progress. The fork uses FlyEnv's shared GitHub Releases client, coalesces overlapping catalog requests, and owns asset matching, checksum verification, staged extraction and the terminal install result. Separate versions can install independently, and duplicate requests for the same version are rejected. Installed versions are discovered locally and can start offline.
- The settings controller owns the configuration initialization and usage reads, each with a shared in-flight request and terminal listener cleanup. The fork exclusively creates the default file when absent. FlyEnv's configuration editor owns the JSON draft, save and restart. Quick edits update that draft. The usage dialog reads the saved listener and remains useful if the read fails.
- The host service controls own start, stop and restart requests. The fork uses the managed configuration and reported process PID, and startup diagnostics include the daemon's current startup output. The host maintains service state and prevents duplicate interactive start/stop requests.

Run `node --import tsx --test plugins/ntp-server/tests/config.test.ts` for clock configuration and release asset tests. Run `yarn plugin:test ntp-server` for the package and fork contract. For service acceptance, check a loopback UDP query in each clock mode, restart after a mode change, confirm that stopping releases the port, and check the diagnostic for an already occupied port.
