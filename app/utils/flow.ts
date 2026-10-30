import type { FlowNode } from "#shared/api"

const FLOW_LABELS: Record<string, string> = {
  "uncategorized-in": "otherMoneyIn", uncategorized: "uncategorized", "other-in": "otherSources",
  other: "everythingElse", savings: "fromSavings", kept: "kept",
}
export function localizeFlowNode(node: FlowNode): FlowNode {
  const key = node.categoryId === null ? FLOW_LABELS[node.id] : undefined
  return key ? { ...node, name: translate(key) } : node
}
