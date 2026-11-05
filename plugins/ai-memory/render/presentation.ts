export function displayDate(value: string | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
}

/** Date pickers emit local offsets; persisted timestamps use canonical UTC. */
export function editorTimestamp(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

export function recoverySummary(report: import('../shared').ProjectRecoveryReport) {
  return {
    unmappedCount: report.warnings.some(
      (warning) => warning.code === 'project_directories_unavailable'
    )
      ? undefined
      : report.unmappedProjectIds.length,
    restoreMissingIds: report.unmappedAfterPreviousRestore
  }
}
