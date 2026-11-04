# AI Memory effect experiment

Status: synthetic retrieval experiment only. Fixtures are constructed Atlas examples, not user history.

40 pre-labelled questions; 16 records. Gold labels are frozen before running.

| Split   | Method  | Recall@5           | No-answer false positives | Misses |
| ------- | ------- | ------------------ | ------------------------- | ------ |
| tune    | raw     | 0.9166666666666666 | 0/0                       | q01-0  |
| tune    | aliases | 1                  | 0/0                       | none   |
| heldout | raw     | 1                  | 0/8                       | none   |
| heldout | aliases | 1                  | 0/8                       | none   |

Aliases are hand-authored fixture expansions, **not measured Agent expansion**. Raw and alias results must remain separate.

Actual Codex/Kimi tool calls, Explicit receipts, short-task Automatic coverage and baseline answers are recorded separately in [client evidence](2026-11-03-flyenv-ai-memory-effect-clients.md). This synthetic table alone is not final product acceptance; long tasks and controlled token comparison remain for stage D.

## Production acceptance

Stage D reruns the frozen corpus through the production HTTP/plugin path and records separate Codex/Kimi MEMORY.md versus memory-tool answers in [final acceptance](2026-11-03-flyenv-ai-memory-acceptance.md). Hand-authored alias results remain distinct from observed client-generated queries. No token-saving claim follows from this experiment.
