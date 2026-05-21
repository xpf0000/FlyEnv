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
- every contract method is present in the Go dispatch switch in `src/helper-go/main.go`;
- every Go dispatch method is represented in the contract.

When adding or removing helper methods, update this file first, then wire the TS call sites and Go dispatch until the contract check passes.
