# AI Memory capacity experiment

Measured 2026-11-03T16:24:33.870Z on darwin/arm64, Node 22.14.0.

All records are constructed fixtures, not user history. Cold means an empty plugin metadata cache; OS filesystem caches were not flushed. The stage-A corpus retains its text but is grouped into one scope for this capacity-only measurement; retrieval quality is evaluated separately by the original labelled queries. No Markdown body is read.

| Workload | Records | JSON MiB | Current MiB | History MiB | Metadata cache MiB | Cold ms | Hot search ms (20 mean) | Max file KiB | Read concurrency | Observed peak RSS MiB | Observed peak heap MiB |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| current-only | 1000 | 0.94 | 0.90 | 0.00 | 0.54 | 118.4 | 14.17 | 0.97 | 4 | 90.09 | 11.33 |
| five-history | 1000 | 5.51 | 0.91 | 4.55 | 0.54 | 168.6 | 13.56 | 5.64 | 4 | 113.42 | 19.13 |
| thirty-history | 1000 | 28.36 | 0.91 | 27.41 | 0.54 | 445.6 | 13.25 | 29.04 | 4 | 130.83 | 26.02 |
| stage-A-constructed-corpus | 16 | 0.01 | 0.01 | 0.00 | 0.01 | 3.5 | 0.33 | 0.93 | 4 | 134.22 | 19.89 |

Memory samples are observed after bounded file reads in one Node process; they include runtime/fixture allocation and are not an isolated heap maximum or a memory guarantee. Cache bytes mean serialized current metadata plus warnings, not precise heap usage. Stress measurements use a 128 MiB scope read budget and 16 MiB metadata cache so history-heavy cases can be observed; these are not preview defaults.

## Preview defaults

- Per record JSON: 256 KiB; one larger record is skipped with a controlled reason, and growth is rejected before writing its body/JSON.
- Per scope JSON reads: 8 MiB; exceeding it fails the load instead of returning an apparently complete subset. The five-history workload fits while the thirty-history workload is intentionally refused at this setting.
- All cached current metadata: 4 MiB; idle scopes are evicted in insertion order, and busy scopes retain their queues.
- Concurrent JSON reads: 4. Search response: 8 KiB by default, hard maximum 32 KiB, including the full result envelope and cursor.

History dominates the thirty-revision workload and has a visible cold-load cost, so V1 keeps a conservative read ceiling rather than increasing it silently or dropping history/receipts. There is no new history index/layout in this preview. Direct-ID deletion and streaming pending cleanup remain available above the search budget. These limits are preview choices for measured local workloads; Windows/Linux/Electron memory behavior is not established by this Node experiment.

## Acceptance linkage

The preview uses these measured budgets unchanged. Exact/above-limit record and scope cases, bounded concurrent reads, cache eviction during activity, history growth rejection, cursor invalidation, and direct-ID cleanup above the search budget pass the final related suite. See [acceptance](2026-11-03-flyenv-ai-memory-acceptance.md). The production HTTP/client fixtures are small constructed corpora; they do not establish thousand-record Electron peak memory or real long-term user-library performance.
