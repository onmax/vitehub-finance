<script setup lang="ts">
// A sankey of one month: sources of money on the left flow into the month's total, which splits into where the money
// went. d3-sankey places the nodes, the same layout comark-charts' sankey uses, and the drawing follows its rules: thin
// nodes, flows at a low opacity, and each flow in the color of the side that names it (a source's into the total, a
// category's out of it). Hover or focus a node to trace its flow; a category opens its transactions.
import { sankey, sankeyJustify, sankeyLinkHorizontal, type SankeyLink, type SankeyNode } from "d3-sankey"
import type { FlowNode, MoneyFlow } from "#shared/api"

const props = defineProps<{ flow: MoneyFlow }>()
const emit = defineEmits<{ open: [node: FlowNode] }>()
const { format } = useMoney()

const box = useTemplateRef<HTMLElement>("box")
const { width } = useElementSize(box)

const NODE = 10
// A label is a name over an amount: nodes in a column keep that much apart, so a small flow's label never overlaps.
const GAP = 30
const TOP = 26

type Side = "source" | "hub" | "use"
interface Datum {
  key: string
  side: Side
  node: FlowNode | null
}

const narrow = computed(() => width.value < 560)
// Labels sit outside the outer columns, so the flows get the middle.
const gutter = computed(() => Math.min(168, Math.max(92, width.value * 0.24)))
const rows = computed(() => Math.max(props.flow.sources.length, props.flow.uses.length, 1))
const height = computed(() => Math.max(240, TOP + rows.value * (GAP + 16)))

const hubTotal = computed(() => Math.max(props.flow.inMinor, props.flow.outMinor))
const hubLabel = computed(() => (props.flow.uses.some((node) => node.kind === "kept") || !props.flow.outMinor ? translate('moneyIn') : translate('moneyOut')))

const layout = computed(() => {
  if (!width.value || !hubTotal.value) return null
  const nodes: Datum[] = [
    ...props.flow.sources.map((node) => ({ key: `in:${node.id}`, side: "source" as const, node })),
    { key: "hub", side: "hub", node: null },
    ...props.flow.uses.map((node) => ({ key: `out:${node.id}`, side: "use" as const, node })),
  ]
  const links = [
    ...props.flow.sources.map((node) => ({ source: `in:${node.id}`, target: "hub", value: node.amountMinor })),
    ...props.flow.uses.map((node) => ({ source: "hub", target: `out:${node.id}`, value: node.amountMinor })),
  ]
  const generator = sankey<Datum, object>()
    .nodeId((node) => node.key)
    .nodeAlign(sankeyJustify)
    .nodeSort(null)
    .nodeWidth(NODE)
    .nodePadding(GAP)
    .extent([
      [gutter.value, TOP],
      [width.value - gutter.value, height.value - 4],
    ])
  return generator({ nodes: nodes.map((node) => ({ ...node })), links })
})

type LaidNode = SankeyNode<Datum, object>
type LaidLink = SankeyLink<Datum, object>
const path = sankeyLinkHorizontal()

// The node a pointer or keyboard is on: its flows stand out, the rest step back.
const active = ref<string | null>(null)
const ends = (link: LaidLink) => [(link.source as LaidNode).key, (link.target as LaidNode).key]
const lit = (link: LaidLink) => !active.value || active.value === "hub" || ends(link).includes(active.value)

/** A flow takes the color of its outer end: the source it comes from, or the category it goes to. */
const linkColor = (link: LaidLink) => {
  const source = link.source as LaidNode
  const target = link.target as LaidNode
  return categoryColor((source.side === "source" ? source.node : target.node)?.color).stroke
}
const nodeColor = (node: LaidNode) => (node.side === "hub" ? "fill-(--ui-text-dimmed)" : categoryColor(node.node?.color).fill)

// SVG text doesn't wrap or ellipsize, so names are cut to what the gutter holds at about 6.5px a character.
const fit = (text: string) => {
  const room = Math.floor((gutter.value - 14) / (narrow.value ? 6.2 : 6.6))
  return text.length > room ? `${text.slice(0, Math.max(1, room - 1))}…` : text
}
const share = (minor: number) => formatPercent(minor / Math.max(1, hubTotal.value))
const opens = (node: LaidNode) => node.node !== null && node.node.kind !== "savings" && node.node.kind !== "kept"

const detail = computed(() => {
  const node = layout.value?.nodes.find((entry) => entry.key === active.value)
  if (!node?.node) return null
  const side = node.side === "source" ? translate('ofMoneyIn') : translate('ofMoneyOut')
  return translate('flowDetail', { name: node.node.name, amount: format(node.node.amountMinor, props.flow.currency), share: share(node.node.amountMinor), side })
})

const summary = computed(() => {
  const top = props.flow.uses
    .filter((node) => node.kind === "expense")
    .slice(0, 3)
    .map((node) => translate('namedAmount', { name: node.name, amount: format(node.amountMinor, props.flow.currency) }))
  return translate('moneyFlowInOutLargest', { value1: format(props.flow.inMinor, props.flow.currency), value2: format(props.flow.outMinor, props.flow.currency), value3: top.join(", ") || translate('noFlow') })
})

function open(node: LaidNode) {
  if (node.node && opens(node)) emit("open", node.node)
}
</script>

<template>
  <div ref="box" class="relative w-full">
    <p class="flex h-5 items-center text-xs text-muted tabular-nums" aria-hidden="true">
      <span v-if="detail" class="truncate">{{ detail }}</span>
      <span v-else class="truncate">
        <span class="hidden [@media(hover:hover)]:inline">{{ $t('hoverAFlowToTraceItClickACategoryTo') }}</span>
        <span class="[@media(hover:hover)]:hidden">{{ $t('tapACategoryToSeeItsTransactions') }}</span>
      </span>
    </p>
    <svg v-if="layout" :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`" role="img" :aria-label="summary" class="block overflow-visible">
      <g fill="none">
        <path
          v-for="(link, index) in layout.links"
          :key="index"
          :d="path(link) ?? ''"
          :stroke-width="Math.max(1.5, link.width ?? 0)"
          :class="linkColor(link)"
          :style="{ strokeOpacity: lit(link) ? 0.38 : 0.08 }"
          class="transition-[stroke-opacity] duration-150 ease-out"
        />
      </g>
      <g
        v-for="node in layout.nodes"
        :key="node.key"
        :tabindex="opens(node) ? 0 : -1"
        :role="opens(node) ? 'link' : undefined"
        :aria-label="node.node ? $t('flowNodeLabel', { name: node.node.name, amount: format(node.node.amountMinor, flow.currency), action: opens(node) ? $t('showTransactions') : '' }) : undefined"
        class="outline-none"
        :class="opens(node) && 'cursor-pointer'"
        @pointerenter="active = node.key"
        @pointerleave="active = null"
        @focus="active = node.key"
        @blur="active = null"
        @click="open(node)"
        @keydown.enter.prevent="open(node)"
      >
        <!-- A wide, invisible target, so a thin node is easy to hover and tap. -->
        <rect :x="(node.x0 ?? 0) - 8" :y="(node.y0 ?? 0) - 6" :width="NODE + 16" :height="Math.max(12, (node.y1 ?? 0) - (node.y0 ?? 0)) + 12" fill="transparent" />
        <rect
          :x="node.x0"
          :y="node.y0"
          :width="NODE"
          :height="Math.max(2, (node.y1 ?? 0) - (node.y0 ?? 0))"
          rx="2"
          :class="[nodeColor(node), active && active !== node.key && active !== 'hub' && node.side !== 'hub' ? 'opacity-50' : 'opacity-100']"
          class="transition-opacity duration-150 ease-out"
        />
        <rect
          v-if="active === node.key && opens(node)"
          :x="(node.x0 ?? 0) - 3"
          :y="(node.y0 ?? 0) - 3"
          :width="NODE + 6"
          :height="Math.max(2, (node.y1 ?? 0) - (node.y0 ?? 0)) + 6"
          rx="4"
          class="fill-none stroke-(--ui-primary) [stroke-width:1.5]"
        />
        <template v-if="node.side === 'hub'">
          <text :x="((node.x0 ?? 0) + (node.x1 ?? 0)) / 2" :y="(node.y0 ?? 0) - 10" text-anchor="middle" class="fill-(--ui-text-muted) text-[11px] font-medium">
            {{ hubLabel }} · <tspan class="fill-(--ui-text-highlighted) tabular-nums">{{ format(hubTotal, flow.currency) }}</tspan>
          </text>
        </template>
        <template v-else-if="node.node">
          <text
            :x="node.side === 'source' ? (node.x0 ?? 0) - 8 : (node.x1 ?? 0) + 8"
            :y="((node.y0 ?? 0) + (node.y1 ?? 0)) / 2"
            :text-anchor="node.side === 'source' ? 'end' : 'start'"
            :class="narrow ? 'text-[11px]' : 'text-xs'"
          >
            <tspan dy="-0.2em" class="fill-(--ui-text) font-medium">{{ fit(node.node.name) }}</tspan>
            <tspan :x="node.side === 'source' ? (node.x0 ?? 0) - 8 : (node.x1 ?? 0) + 8" dy="1.25em" class="fill-(--ui-text-muted) tabular-nums">
              {{ format(node.node.amountMinor, flow.currency) }}
            </tspan>
          </text>
        </template>
      </g>
    </svg>
    <div v-else :style="{ height: `${height}px` }" />
  </div>
</template>
