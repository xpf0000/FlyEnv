# llama.cpp session caches and model selection

## Scope and state ownership

- Runtime variants and Hugging Face catalog pages/files live only in the module-local `LlamaCppController` singleton for the renderer process lifetime. First page visit fetches; repeat visits reuse memory; explicit refresh refetches. Delete the two legacy persisted cache keys during initialization.
- Downloaded models, selected model, and launch profile remain module-owned persistent data via `StorageGetAsync`/`StorageSetAsync`. UI tab, search, and popover state belong to mounted views. No new Pinia store or `config.setup` data; no new-module exception.
- The Models view defaults to Local, retains automatic catalog fetch on first visit, and follows Ollama's table icon conventions. The Service popover owns selection. The first completed download selects a model when none is selected; deleting the selected model moves selection to the next local model or clears it.

## Operation contract

| Operation | Owner and lifetime | Intermediate / terminal events | Duplicate behavior | Service interaction and verification |
|---|---|---|---|---|
| Catalog fetch | Module controller, renderer process | In-flight promise; fetched list or error | Coalesce same key; explicit refresh refetches | No service change; test first fetch, cache hit, refresh, fresh controller and legacy key removal |
| Model download | Module controller and Fork, survives page unmount | Starting/running/progress/cancelling; success/failure/cancel | Reject simultaneous downloads | On success persist local list and auto-select if empty; test selection, progress, duplicate guard and persistence |
| Model delete | Module controller and Fork, survives page unmount | IPC completion or error | Fork blocks active process model | Allow deleting a selected model when service is stopped; on success update local list and current model; test fallback and active process rejection |

## Implementation and validation

1. Update contract tests for memory-only caches, legacy cleanup, first-download selection, and deletion fallback; run red tests.
2. Update storage bridge/controller, then Models and Service views using existing FlyEnv/Ollama components.
3. Run contract tests, type/build checks, inspect UI behavior, review diff, and merge this branch to local `master`.
