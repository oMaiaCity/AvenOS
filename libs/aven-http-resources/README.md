# `@avenos/http-resources`

This package is the first implementation slice of the artifact-first HTTP resource
pipeline. It keeps public request artifacts separate from credentials and gives a
trusted server host the bounded ports needed to acquire one web representation.

The implemented contracts currently provide:

- normalized `GET` and `HEAD` request values with no body or secret-bearing headers;
- exact customer, subject, session, placement, method, purpose, host, port, and path
  matching for Vault bindings;
- distinct set-only administration and session-use interfaces, including typed
  header, cookie, and query attachment rules;
- private response-index lookup before network I/O;
- ETag revalidation, with Last-Modified only as a fallback;
- manual redirect traversal which rematches credentials at every hop;
- bounded retained response metadata which excludes cookies and authentication
  challenges; and
- a host result which either selects an existing response, streams a new body, or
  reuses a previously committed body after `304 Not Modified`.

The package does not yet publish Artifact Store blobs, register the HTTP Actor factory
with Actor Runner, or persist Vault records. Those are the next integration slice. The
live session proof needed by the future Vault client is already ephemeral in Actor
Runner and is never written to a run record.

Run its contract and loopback-server tests from this directory:

```sh
bun run check
bun run test
```

The loopback test performs real HTTP exchanges and proves redirect credential
rematching, byte identity, ETag/`304` reuse, and secret-safe response metadata. The
full platform E2E must additionally prove facade admission, customer-database
isolation, set-only Vault routes, Actor Runner execution, Artifact Store publication,
materialization, and planner reuse before the feature is considered complete.
