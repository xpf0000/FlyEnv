import { computed, reactive, toRef } from 'vue'
import type { ConnectClient } from './connect-controller'
const tabs = ['memories', 'connect', 'maintenance', 'calls'] as const
type MemoryTab = (typeof tabs)[number]
/** Share the host module tab registry; unmounting a page does not reset its selection. */
export function memoryNavigationTab(registry: Record<string, number>) {
  return computed<MemoryTab>({
    get: () => tabs[registry['ai-memory'] ?? 0] ?? 'memories',
    set: (value) => {
      registry['ai-memory'] = Math.max(0, tabs.indexOf(value))
    }
  })
}

// Explicitly retained view selection: user expects tab/module round trips to keep it.
// Async connection operations and snippet reads never write this state.
const connectionSelection = reactive<{ client: ConnectClient }>({ client: 'codex' })
export function memoryConnectionClient() {
  return toRef(connectionSelection, 'client')
}
