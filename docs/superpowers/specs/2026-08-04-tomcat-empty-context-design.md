# Tomcat Empty Context Cleanup Design

## Goal

Prevent FlyEnv from generating an empty Tomcat context entry and repair previously generated entries that can shadow the intended site deployment and cause 404 responses.

## Scope

- Stop adding `<Context path="" docBase=""></Context>` when FlyEnv creates a Tomcat `Host`.
- On every FlyEnv `server.xml` regeneration, remove pre-existing empty Context entries from FlyEnv-managed Hosts.
- Preserve all Context entries that carry a non-empty path or docBase, or any additional configuration.
- Apply the behavior to both global and custom Tomcat configurations through their shared `makeTomcatServerXML` path.

## Design

`makeTomcatServerXML` already parses the current `server.xml`, updates FlyEnv Hosts, and writes the resulting XML for both startup paths. The fix will operate on the parsed Host objects in that function:

1. Remove the hard-coded empty Context from both Host XML templates so new Hosts are generated without it.
2. Add a focused cleanup step for Hosts identified by `appFlag="FlyEnv"`.
3. The cleanup removes only a Context whose attributes are exactly `path=""` and `docBase=""` and which has no nested configuration or other attributes. A single parsed Context becomes absent; an array retains only its valid members.
4. Run cleanup after virtual-host updates so both newly created and historical FlyEnv Hosts have the same result before XML serialization.

## Error Handling and Compatibility

- Non-FlyEnv Hosts are not modified.
- Any Context with a non-empty `path` or `docBase`, or additional settings such as a `Resource`, remains unchanged.
- The parser/builder remains the sole mechanism for modifying XML; no text regular expression rewriting is used.

## Verification

- Add a focused `tsx` regression script for `makeTomcatServerXML`.
- Verify that a generated Host has no empty Context.
- Verify that a pre-existing empty Context is removed.
- Verify that a valid Context is retained.
- Run the existing focused service-web-panel and ClickHouse regression scripts, plus whitespace checks.
