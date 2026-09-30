# Optional Azure DevOps MCP response-boundary patch

This patch targets Microsoft's Azure DevOps MCP **v2.10.0**, commit
`43a2b179b02d912399be612e0f7b5121a55eb692`. It is a separately built dependency
fix, not a plugin runtime adapter. The plugin installer does not apply it,
install dependencies, or change an MCP connection. Other server versions need
a new compatibility review; do not apply this patch blindly after an upgrade.

## Behavior

- `getItemText` returns an HTTP IncomingMessage even for a failed request. The
  patched file handler checks its status before wrapping content as source.
  Non-2xx responses become `isError: true` with the HTTP status, including plain
  text, HTML, JSON and empty error bodies. No automatic retry is added.
- Successful HTTP content is preserved literally, even if it contains text or
  JSON resembling an Azure error. The existing JSON-error fallback remains only
  for streams without HTTP status. This is not a natural-language blacklist.
- The PR handler rejects an absent object or missing/mismatched pullRequestId
  before fetching labels/changes. The SDK can resolve a 404 to null; the handler
  no longer turns it into a meaningful-looking empty changed-file summary.
  It cannot reconstruct a status the SDK discarded. Optional merge versions are
  neither required nor fabricated here; review readiness still requires them.

Tool schemas, arguments, authentication, permissions, pagination, normal
successful source content and the plugin's review/version gates remain unchanged.
This patch addresses two demonstrated response boundaries, not all MCP endpoints
or semantic source validity. Error bodies remain untrusted server data.

## Apply and verify

Use an isolated checkout and Node.js 22+. Replace the patch path below with its
absolute path in this repository. Review dependency lifecycle scripts before
building; the commands explicitly build the native keytar dependency used by the
upstream authentication tests.

```sh
git clone --branch v2.10.0 --depth 1 https://github.com/microsoft/azure-devops-mcp.git azure-devops-mcp-review-fix
cd azure-devops-mcp-review-fix
test "$(git rev-parse HEAD)" = 43a2b179b02d912399be612e0f7b5121a55eb692
git apply --check /absolute/path/to/opencode-azure-devops-pr-review/patches/azure-devops-mcp-2.10.0-response-errors.patch
git apply /absolute/path/to/opencode-azure-devops-pr-review/patches/azure-devops-mcp-2.10.0-response-errors.patch
npm ci --ignore-scripts --no-audit --no-fund
npm rebuild keytar
npm run build
npm test -- --runInBand
npm run validate-tools
```

The added repository HTTP tests use a loopback server and the real locked Azure
SDK. Only endpoint discovery is replaced. They require no Azure account,
credentials or model calls. They cover failed reads, unchanged successful source,
absent/mismatched PRs and legitimate PRs lacking optional merge versions.

After tests pass, stop host processes using the connection. In your existing
OpenCode MCP command, replace only the MCP script path with this checkout's
absolute `dist/index.js` path. Keep its Node executable, arguments, preload,
credentials and environment settings. Restart and validate with a known PR.
Do not print or commit your host configuration. Record the upstream commit, patch
hash, lockfile hash and built-file hashes privately: the package version remains
2.10.0 and alone does not identify this patched build. Do not edit the built files
as the source of truth. Keep the original installation for rollback by restoring
its script path and restarting the host.

The patch and included upstream context are distributed under the upstream
[MIT license](LICENSE.azure-devops-mcp.md). Source:
[Microsoft Azure DevOps MCP v2.10.0](https://github.com/microsoft/azure-devops-mcp/tree/v2.10.0).
