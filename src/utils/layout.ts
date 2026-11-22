import { ChannelUsageResult } from '../types/usage';

/**
 * Estimates the rendered height (in px) of a channel card to balance two masonry columns.
 */
export function estimateCardHeight(result: ChannelUsageResult): number {
  const baseChrome = 88;
  if (result.status !== 'ok' || result.metrics.length === 0) {
    return baseChrome + 92;
  }

  const groupNames = new Set<string>();
  let metricsHeight = 0;

  for (const metric of result.metrics) {
    if (metric.groupName) {
      groupNames.add(metric.groupName);
    }
    metricsHeight += 42;
    if (metric.totalDisplay) metricsHeight += 18;
    if (metric.subLabel) metricsHeight += 22;
  }

  const groupsOverhead = groupNames.size * 34;
  return baseChrome + groupsOverhead + metricsHeight;
}

/**
 * Distributes ordered channel cards into two columns using greedy shortest-column packing,
 * preventing row-alignment whitespace when one card (e.g., Antigravity) is taller than others.
 */
export function distributeToTwoColumns(
  results: ChannelUsageResult[],
): [ChannelUsageResult[], ChannelUsageResult[]] {
  const left: ChannelUsageResult[] = [];
  const right: ChannelUsageResult[] = [];
  let leftHeight = 0;
  let rightHeight = 0;

  for (const item of results) {
    const h = estimateCardHeight(item);
    if (leftHeight <= rightHeight) {
      left.push(item);
      leftHeight += h;
    } else {
      right.push(item);
      rightHeight += h;
    }
  }

  return [left, right];
}
