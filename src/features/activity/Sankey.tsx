import { ScrollView, View } from 'react-native';
import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg';

import { AppText } from '@/components';
import type { FlowSnapshot } from '@/data/flow';
import { useTheme, type ThemeColors } from '@/theme';
import { formatCurrency } from '@/utils/format';

/** The web app's `FlowColorKey`, mapped onto this client's semantic tokens. */
const TONE: Record<string, keyof ThemeColors> = {
  source: 'positive',
  person: 'info',
  credit: 'positive',
  bank: 'accent',
  card: 'negative',
  loan: 'negative',
  category: 'negative',
  warning: 'warning',
  hub: 'textTertiary',
  stub: 'textTertiary',
};

const COLUMN_WIDTH = 190;
const NODE_WIDTH = 12;
const NODE_GAP = 10;
const HEIGHT = 520;
const PAD_TOP = 18;

interface Placed {
  id: string;
  label: string;
  kind: string;
  value: number;
  depth: number;
  x: number;
  y: number;
  height: number;
}

/**
 * Longest-path depth, so a node always sits to the right of everything feeding
 * it. Plain BFS relaxation over a graph this size (tens of nodes) — the cycle
 * guard is the iteration cap, because a card-payment loop is legal here.
 */
const depths = (nodes: FlowSnapshot['nodes'], links: FlowSnapshot['links']) => {
  const depth = new Map(nodes.map((n) => [n.id, 0]));
  for (let pass = 0; pass < nodes.length; pass += 1) {
    let moved = false;
    for (const link of links) {
      const next = (depth.get(link.source) ?? 0) + 1;
      if (next > (depth.get(link.target) ?? 0)) {
        depth.set(link.target, next);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return depth;
};

/**
 * A Sankey, drawn from the same `nodes` and `links` the web app's chart uses.
 *
 * Only GEOMETRY is computed here — column, height, ribbon curve. Every cents
 * figure arrives finished from `flowSnapshot`; nothing on this screen adds two
 * amounts together.
 *
 * Scrolls horizontally rather than squeezing every column into 390pt: a Sankey
 * whose ribbons overlap is a decoration, not a chart.
 */
export const Sankey = ({ data }: { data: FlowSnapshot }) => {
  const theme = useTheme();

  const depth = depths(data.nodes, data.links);
  const maxDepth = Math.max(...[...depth.values()], 0);

  // A node's size is the larger of what flows in and what flows out — the two
  // differ at a node that both receives and spends, and using either alone
  // makes ribbons wider than the box they leave.
  const inflow = new Map<string, number>();
  const outflow = new Map<string, number>();
  for (const link of data.links) {
    outflow.set(link.source, (outflow.get(link.source) ?? 0) + link.cents);
    inflow.set(link.target, (inflow.get(link.target) ?? 0) + link.cents);
  }
  const valueOf = (id: string) => Math.max(inflow.get(id) ?? 0, outflow.get(id) ?? 0);

  const columns = new Map<number, FlowSnapshot['nodes']>();
  for (const node of data.nodes) {
    const d = depth.get(node.id) ?? 0;
    columns.set(d, [...(columns.get(d) ?? []), node]);
  }

  const placed = new Map<string, Placed>();
  for (const [d, group] of columns) {
    const ordered = [...group].sort((a, b) => valueOf(b.id) - valueOf(a.id));
    const total = ordered.reduce((sum, n) => sum + valueOf(n.id), 0);
    const usable = HEIGHT - PAD_TOP * 2 - NODE_GAP * Math.max(ordered.length - 1, 0);
    let y = PAD_TOP;
    for (const node of ordered) {
      const value = valueOf(node.id);
      const height = total > 0 ? Math.max((value / total) * usable, 3) : 3;
      placed.set(node.id, {
        id: node.id,
        label: node.label,
        kind: node.kind,
        value,
        depth: d,
        x: d * COLUMN_WIDTH,
        y,
        height,
      });
      y += height + NODE_GAP;
    }
  }

  // Ribbons stack down each side of the node they touch, so two links leaving
  // the same source do not overlap.
  const usedOut = new Map<string, number>();
  const usedIn = new Map<string, number>();

  const ribbons = data.links
    .map((link) => {
      const from = placed.get(link.source);
      const to = placed.get(link.target);
      if (!from || !to) return null;

      const scaleFrom = from.height / Math.max(outflow.get(from.id) ?? 1, 1);
      const scaleTo = to.height / Math.max(inflow.get(to.id) ?? 1, 1);
      const thickFrom = Math.max(link.cents * scaleFrom, 1);
      const thickTo = Math.max(link.cents * scaleTo, 1);

      const y0 = from.y + (usedOut.get(from.id) ?? 0) + thickFrom / 2;
      const y1 = to.y + (usedIn.get(to.id) ?? 0) + thickTo / 2;
      usedOut.set(from.id, (usedOut.get(from.id) ?? 0) + thickFrom);
      usedIn.set(to.id, (usedIn.get(to.id) ?? 0) + thickTo);

      const x0 = from.x + NODE_WIDTH;
      const x1 = to.x;
      const mid = (x0 + x1) / 2;

      return {
        key: `${link.source}->${link.target}`,
        d: `M ${x0} ${y0} C ${mid} ${y0}, ${mid} ${y1}, ${x1} ${y1}`,
        width: Math.max((thickFrom + thickTo) / 2, 1),
        colour: theme.colors[TONE[from.kind] ?? 'textTertiary'],
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const width = (maxDepth + 1) * COLUMN_WIDTH + 40;

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ padding: 4 }}>
        <Svg width={width} height={HEIGHT}>
          {/* Ribbons first, so the node blocks sit on top of their own edges. */}
          {ribbons.map((r) => (
            <Path
              key={r.key}
              d={r.d}
              stroke={r.colour}
              strokeWidth={r.width}
              strokeOpacity={0.28}
              fill="none"
            />
          ))}

          {[...placed.values()].map((node) => (
            <Rect
              key={node.id}
              x={node.x}
              y={node.y}
              width={NODE_WIDTH}
              height={node.height}
              rx={3}
              fill={theme.colors[TONE[node.kind] ?? 'textTertiary']}
            />
          ))}

          {[...placed.values()].map((node) => (
            <SvgText
              key={`t-${node.id}`}
              // Terminal nodes label to the LEFT so the last column's text does
              // not run off the canvas.
              x={node.depth === maxDepth ? node.x - 6 : node.x + NODE_WIDTH + 6}
              y={node.y + node.height / 2 + 4}
              fontSize={11}
              fill={theme.colors.textSecondary}
              textAnchor={node.depth === maxDepth ? 'end' : 'start'}
            >
              {node.label.length > 22 ? `${node.label.slice(0, 21)}…` : node.label}
            </SvgText>
          ))}
        </Svg>
      </ScrollView>

      <AppText variant="caption" tone="textTertiary" align="center">
        Scroll sideways · in {formatCurrency(data.totals.sourcesCents)} · out{' '}
        {formatCurrency(data.totals.sinksCents)}
      </AppText>
    </View>
  );
};
