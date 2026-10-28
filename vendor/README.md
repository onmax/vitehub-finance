# Vendored packages

## okmcp-0.2.1-main.2239349.tgz

[okmcp](https://mcp.h3.dev) (h3js/okmcp, formerly `h3-mcp`) serves `/mcp`. The last npm release is `h3-mcp@0.2.0`; the
APIs the app uses came after it (`okmcp/oauth` with `protectedResourceMetadata`, validators that return an identity,
`auth.optional`), and npm's `okmcp` is still an empty `0.0.0` placeholder. So this tarball is h3js/okmcp at
[`2239349`](https://github.com/h3js/okmcp/commit/223934913eb929051df6116e0b58a4b67072d106), built and packed unchanged
except for its version, which names the commit. `patches/okmcp@0.2.1-main.2239349.patch` applies on top, as for any
npm package.

To rebuild it (run it outside this checkout: obuild picks up the app's root tsconfig.json and fails):

```sh
git clone https://github.com/h3js/okmcp && cd okmcp && git checkout <sha>
pnpm install --filter okmcp --frozen-lockfile --ignore-scripts
npm pkg set version=0.2.1-main.<short-sha>
pnpm pack --pack-destination <this repo>/vendor
```

Then point `okmcp` in package.json, the patch's file name, and its `patchedDependencies` key in pnpm-workspace.yaml at
the new version, and run `pnpm install`.

Once okmcp is published, depend on the npm release instead (`"okmcp": "<version>"`), delete this directory and the
`COPY vendor` line in the Dockerfile, and rebase the patch onto the release or drop it if upstream does what it does.
