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
- Parse only tag rows whose displayed size is explicitly present between the row's bullet separators. Do not use a cross-element legacy regex, because CSS classes such as `mt-8 mb-4` can be misread as `8MB`.
- Treat a tag page whose listed rows are exclusively `:cloud` entries with no downloadable size as cloud-only. Exclude that model from `models.json` instead of fabricating a local size or treating it as an unresolved local model.
- Continue treating a non-cloud page with no parsed local tags as unresolved so markup regressions still fail visibly.
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
- CSS class text cannot be parsed as a model size;
- cloud-only models are excluded while local sized tags remain unchanged.

Run a live network smoke test through the supplied local proxy after deterministic tests pass. The smoke test must demonstrate that pagination advances and terminates, and that the generated JSON is parseable with the expected object/array structure.

## Non-Goals

- Increasing the Node heap limit as the primary fix.
- Parallel crawling or changing the generated JSON schema.
- Replacing the HTML crawler with a browser automation dependency.
