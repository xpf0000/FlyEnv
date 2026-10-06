# FlyEnv Helper Contract

`helper-contract.json` is the machine-readable contract for the Go helper API.

The contract is validated by:

```bash
yarn run test:helper:contract
```

The check verifies:

- every `Helper.send(...)` call in `src/main`, `src/fork`, `src/shared`, and `src/render` exists in the contract;
- argument counts match the contract, including optional trailing arguments;
- literal argument types match the contract where static analysis can prove them;
- every contract method is present in `src/fork/Helper.ts` module/function unions;
- every contract method is present in the platform Go dispatch switches in `main.go`, `linux.go`, `darwin.go`, and shared `unix_dispatch.go`;
- every Go dispatch method is represented in the contract.

When adding or removing helper methods, update this file first, then wire the TS call sites and Go dispatch until the contract check passes.

Darwin root dispatch is closed: only helper version/health, fixed hosts/approved CA/DNS/PID and the fixed FTP launchd lifecycle are accepted. Methods marked `legacy-disabled` remain documented for migration/source checking but are not callable by macOS; `windows` methods cannot enter the Darwin dispatcher. Linux-only low-port launching remains separate.

Darwin helper builds require `CGO_ENABLED=1` for native UID ACL verification and hosts ACL preservation; non-cgo builds fail closed. Policy/key/CA live in `/Library/Application Support/FlyEnv/Helper/`, with a root protected socket parent at `/private/var/run/flyenv-helper/`. Native launchd, Keychain, ACL and release installer validation must be performed on supported macOS systems in addition to Go tests.
