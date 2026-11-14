import { glob } from "vite-hub/source"

/**
 * The Markdown in docs/. With literal options the build bundles the files into the server, so a Worker, which has no
 * file system, reads the same pages as Node. Keys keep their number prefixes (`1.guides/0.setup.md`).
 */
export const docs = glob({ cwd: "docs", include: "**/*.md" })
