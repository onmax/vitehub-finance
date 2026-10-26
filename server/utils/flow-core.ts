// A month's money flow: what came in by source and where it went by category, so a sankey can draw it. Pure, so the
// rules are tested on their own; server/utils/flow.ts reads the totals.
import type { FlowNode } from "#shared/api"

export interface CategoryTotals {
  categoryId: string | null
  /** Money in and out of this category this month, both positive, in the household's currency. */
  inMinor: number
  outMinor: number
}

export interface CategoryInfo {
  name: string
  kind: "expense" | "income" | "transfer"
  icon: string
  color: string
}

/** Past this many, the smallest uses fold into one "Everything else" node, so labels stay readable. */
export const MAX_USES = 8
export const MAX_SOURCES = 5

function fold(nodes: FlowNode[], max: number, other: Omit<FlowNode, "amountMinor">) {
  const sorted = nodes.sort((a, b) => b.amountMinor - a.amountMinor)
  if (sorted.length <= max) return sorted
  const kept = sorted.slice(0, max - 1)
  const rest = sorted.slice(max - 1).reduce((sum, node) => sum + node.amountMinor, 0)
  return [...kept, { ...other, amountMinor: rest }]
}

/**
 * Income categories are sources, at what came in minus what went out of them. Spending categories are uses, net of
 * refunds; one where refunds passed spending becomes a source. Uncategorized money counts on both sides as it moved.
 * When spending passed income the gap comes "From savings"; when income passed spending the rest is "Kept".
 */
export function buildFlow(totals: CategoryTotals[], categories: Map<string, CategoryInfo>) {
  const sources: FlowNode[] = []
  const uses: FlowNode[] = []
  for (const row of totals) {
    const info = row.categoryId ? categories.get(row.categoryId) : undefined
    if (info?.kind === "transfer") continue
    if (!info) {
      if (row.inMinor > 0)
        sources.push({ id: "uncategorized-in", name: "Other money in", categoryId: null, color: "neutral", icon: "i-lucide-circle-help", amountMinor: row.inMinor, kind: "income" })
      if (row.outMinor > 0)
        uses.push({ id: "uncategorized", name: "Uncategorized", categoryId: null, color: "neutral", icon: "i-lucide-circle-help", amountMinor: row.outMinor, kind: "expense" })
      continue
    }
    const node = { id: row.categoryId!, name: info.name, categoryId: row.categoryId, color: info.color, icon: info.icon }
    const net = info.kind === "income" ? row.inMinor - row.outMinor : row.outMinor - row.inMinor
    if (net > 0) (info.kind === "income" ? sources : uses).push({ ...node, amountMinor: net, kind: info.kind })
    else if (net < 0 && info.kind === "expense") sources.push({ ...node, name: `${info.name} refunds`, amountMinor: -net, kind: "income" })
  }
  const inMinor = sources.reduce((sum, node) => sum + node.amountMinor, 0)
  const outMinor = uses.reduce((sum, node) => sum + node.amountMinor, 0)
  const folded = {
    sources: fold(sources, MAX_SOURCES, { id: "other-in", name: "Other sources", categoryId: null, color: "zinc", icon: "i-lucide-ellipsis", kind: "other" }),
    uses: fold(uses, MAX_USES, { id: "other", name: "Everything else", categoryId: null, color: "zinc", icon: "i-lucide-ellipsis", kind: "other" }),
  }
  if (outMinor > inMinor)
    folded.sources.push({ id: "savings", name: "From savings", categoryId: null, color: "amber", icon: "i-lucide-piggy-bank", amountMinor: outMinor - inMinor, kind: "savings" })
  else if (inMinor > outMinor)
    folded.uses.push({ id: "kept", name: "Kept", categoryId: null, color: "emerald", icon: "i-lucide-piggy-bank", amountMinor: inMinor - outMinor, kind: "kept" })
  return { inMinor, outMinor, ...folded }
}
