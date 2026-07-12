# Ollama Crawler Memory Safety Design

## Problem

`test/ollama.js` requests `https://ollama.com/search?page=N` as a normal browser request. Ollama now responds with `303 Location: /search`, and Axios follows the redirect. Every requested page therefore becomes the first page, which always contains model links. The crawler never reaches its existing empty-page exit condition and can run until Node exhausts its heap on a low-memory server.

## Compatibility

The generated `models.json` format remains unchanged:

```json
{
  "model-name": [
    {
      "name": "model-name:tag",
      "size": "1.2GB"
    }
  ]
}
```

## Design

- Send `HX-Request: true` on search-page requests so Ollama returns the requested pagination fragment instead of redirecting to `/search`.
- Fetch pages and model tag pages sequentially to keep peak memory and server load low.
- Stop pagination when a response contains no models, when a page adds no new models, or when a defensive 500-page ceiling is reached.
- Apply a 30-second request timeout and retry transient failures up to three times with bounded backoff.
- Allow an individual tag-page failure to be reported and retried by the existing repair pass without discarding the full crawl.
- Avoid logging complete model arrays and result objects. Log bounded progress information and periodic memory usage instead.
- Write JSON to a temporary file and rename it to `models.json` only after serialization succeeds, preventing a partial destination file.
- Set a nonzero process exit code when the crawl cannot complete or unresolved models remain.

## Test Strategy

Use Node's built-in test runner with an injected request function and temporary output directory. Cover:

- correct `HX-Request` pagination header;
- empty-page termination;
- repeated-page/no-new-model termination;
- maximum-page protection;
- timeout/transient retry behavior;
- unchanged output structure;
- atomic output replacement;
- failure exit behavior when unresolved models remain.

Run a live network smoke test through the supplied local proxy after deterministic tests pass. The smoke test must demonstrate that pagination advances and terminates, and that the generated JSON is parseable with the expected object/array structure.

## Non-Goals

- Increasing the Node heap limit as the primary fix.
- Parallel crawling or changing the generated JSON schema.
- Replacing the HTML crawler with a browser automation dependency.
