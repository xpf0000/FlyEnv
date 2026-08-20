const statLabelKeys: Readonly<Record<string, string>> = {
  OVERVIEW: 'openCode.statsLabels.overview',
  SESSIONS: 'openCode.statsLabels.sessions',
  MESSAGES: 'openCode.statsLabels.messages',
  DAYS: 'openCode.statsLabels.days',
  'COST & TOKENS': 'openCode.statsLabels.costAndTokens',
  'TOOL USAGE': 'openCode.statsLabels.toolUsage',
  'AVG COST/DAY': 'openCode.statsLabels.avgCostPerDay',
  'AVG TOKENS/SESSION': 'openCode.statsLabels.avgTokensPerSession',
  'MEDIAN TOKENS/SESSION': 'openCode.statsLabels.medianTokensPerSession',
  SUMMARY: 'openCode.statsLabels.summary',
  MODELS: 'openCode.statsLabels.models',
  'MODEL USAGE': 'openCode.statsLabels.models',
  'TOTAL COST': 'openCode.statsLabels.totalCost',
  COST: 'openCode.statsLabels.cost',
  'TOTAL TOKENS': 'openCode.statsLabels.totalTokens',
  'INPUT TOKENS': 'openCode.statsLabels.inputTokens',
  INPUT: 'openCode.statsLabels.inputTokens',
  'OUTPUT TOKENS': 'openCode.statsLabels.outputTokens',
  OUTPUT: 'openCode.statsLabels.outputTokens',
  'REASONING TOKENS': 'openCode.statsLabels.reasoningTokens',
  REASONING: 'openCode.statsLabels.reasoningTokens',
  'CACHE READ TOKENS': 'openCode.statsLabels.cacheReadTokens',
  'CACHE READ': 'openCode.statsLabels.cacheReadTokens',
  'CACHE WRITE TOKENS': 'openCode.statsLabels.cacheWriteTokens',
  'CACHE WRITE': 'openCode.statsLabels.cacheWriteTokens',
  'TOTAL REQUESTS': 'openCode.statsLabels.totalRequests',
  'TOTAL SESSIONS': 'openCode.statsLabels.totalSessions'
}

export const statTranslationKey = (label: string): string | undefined => {
  const normalized = label.trim().replace(/\s+/g, ' ').toUpperCase()
  return statLabelKeys[normalized]
}
