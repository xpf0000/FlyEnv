<template>
  <aside
    class="memory-browser"
    :style="{ '--active-color': category ? MEMORY_COLORS[category] : '#c9ad72' }"
    :data-mode="category ? 'category' : 'overview'"
    :aria-label="T(category ? 'categoryMemories' : 'networkOverview')"
  >
    <header class="browser-topline">
      <span>{{ category ? '02 / MEMORY CATEGORY' : '01 / NETWORK OVERVIEW' }}</span>
      <button v-if="category" type="button" @click="$emit('reset')">{{
        T('backToOverview')
      }}</button>
      <button
        type="button"
        class="browser-close"
        :aria-label="T('collapseBrowser')"
        @click="$emit('close')"
        >×</button
      >
    </header>
    <section v-if="!category" class="browser-overview">
      <div class="overview-title"
        ><span>NEURAL FIELD</span><h2>{{ T('networkOverview') }}</h2
        ><p>{{ scopeLabel }}</p></div
      >
      <dl class="metric-grid">
        <div
          ><dt>{{ T('memoryNodes') }}</dt
          ><dd>{{ memories.length }}</dd></div
        >
        <div
          ><dt>{{ T('categoryHubs') }}</dt
          ><dd>08</dd></div
        >
        <div
          ><dt>{{ T('semanticLinks') }}</dt
          ><dd>{{ relationCount }}</dd></div
        >
        <div
          ><dt>{{ T('pinnedMemories') }}</dt
          ><dd>{{ pinnedCount }}</dd></div
        >
      </dl>
      <div class="coverage-row"
        ><span>{{ T('categoryCoverage') }}</span
        ><strong>{{ coverage }} / 08</strong
        ><div class="coverage-track" aria-hidden="true"
          ><i :style="{ width: `${(coverage / 8) * 100}%` }"></i></div
      ></div>
      <div class="connection-legend">
        <h3
          >CONNECTION KEY <span>/ {{ T('connectionKey') }}</span></h3
        >
        <div
          ><i></i
          ><p
            >{{ T('semanticLinks') }}<small>{{ T('semanticHelp') }}</small></p
          ></div
        >
        <div
          ><i class="structure-key"></i
          ><p
            >{{ T('structuralFibers') }}<small>{{ T('structuralHelp') }}</small></p
          ></div
        >
      </div>
      <p class="browser-hint">{{ T('categoryHelp') }}</p>
    </section>
    <section v-else class="browser-category">
      <div class="category-view-heading"
        ><span class="category-code">{{ category.toUpperCase() }}</span
        ><h2>{{ T(category) }}</h2
        ><p>{{ scopeLabel }}</p></div
      >
      <div class="list-caption"
        ><span>MEMORIES</span><strong>{{ entries.length }} {{ T('memoriesCount') }}</strong></div
      >
      <div class="category-memory-list" :aria-label="T('categoryMemories')">
        <button
          v-for="([id, hit], index) in entries"
          :key="id"
          type="button"
          class="memory-item"
          :aria-pressed="selectedId === id"
          @click="$emit('select', hit)"
        >
          <span class="memory-item-index">{{ String(index + 1).padStart(2, '0') }}</span>
          <span class="memory-item-copy"
            ><span class="memory-item-title">{{ hit.title }}</span
            ><span class="memory-item-meta"
              >{{ displayDate(hit.updated_at) }} · REV {{ hit.revision }}</span
            ></span
          >
          <span class="memory-item-arrow" aria-hidden="true">↗</span>
        </button>
      </div>
      <p v-if="!entries.length" class="browser-hint">{{ T('emptyCategory') }}</p>
    </section>
  </aside>
</template>
<script setup lang="ts">
  import { computed } from 'vue'
  import type { MemoryType, SearchHit } from '../shared'
  import { MemoryT as T } from './lang'
  import { displayDate } from './presentation'
  import { MEMORY_COLORS } from './universe'
  const props = defineProps<{
    memories: SearchHit[]
    hitsByNodeId: Map<string, SearchHit>
    relationCount: number
    scopeLabel: string
    category?: MemoryType
    selectedId?: string
  }>()
  defineEmits<{ select: [hit: SearchHit]; reset: []; close: [] }>()
  const pinnedCount = computed(() => props.memories.filter((hit) => hit.pinned).length)
  const coverage = computed(() => new Set(props.memories.map((hit) => hit.type)).size)
  const entries = computed(() =>
    [...props.hitsByNodeId].filter(([, hit]) => hit.type === props.category)
  )
</script>

<style scoped>
  .memory-browser {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    --active-color: #c9ad72;
  }
  button {
    font: inherit;
    border: 0;
    background: transparent;
    cursor: pointer;
  }
  button:focus-visible {
    outline: 2px solid #e4c07e;
    outline-offset: -2px;
  }

  .browser-topline {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 20px;
    padding-bottom: 12px;
    border-bottom: 1px solid #bda36b1c;
  }
  .browser-topline > span {
    font:
      7px ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
    letter-spacing: 0.1em;
    color: #8b805f;
  }
  .browser-topline > button:not(.icon-button) {
    padding: 0;
    color: #a89b7e;
    font-size: 9px;
  }
  .browser-topline > button:hover {
    color: #dfc795;
  }
  .browser-close {
    display: none;
  }
  .browser-overview {
    overflow: auto;
    min-height: 0;
    scrollbar-width: thin;
    scrollbar-color: #494d40 transparent;
  }
  .overview-title {
    display: grid;
    gap: 5px;
    padding: 18px 0 19px;
  }
  .overview-title > span {
    color: #79795e;
    font:
      8px ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
    letter-spacing: 0.17em;
  }
  .overview-title h2 {
    color: #dbd0b8;
    font-size: 16px;
    font-weight: 400;
    letter-spacing: 0.1em;
    margin: 0;
  }
  .overview-title > p {
    font-size: 10px;
    color: #818775;
    margin: 4px 0 0;
  }
  .metric-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    margin: 0;
    border-top: 1px solid #c7ac7020;
    border-left: 1px solid #c7ac7020;
  }
  .metric-grid > div {
    padding: 12px 10px;
    border-right: 1px solid #c7ac7020;
    border-bottom: 1px solid #c7ac7020;
  }
  .metric-grid dt {
    font-size: 9px;
    color: #7e826d;
  }
  .metric-grid dd {
    font:
      18px ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
    color: #c9b78c;
    margin: 8px 0 0;
  }
  .coverage-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 9px;
    margin-top: 19px;
    font-size: 9px;
    color: #787f6b;
  }
  .coverage-row > strong {
    font:
      9px ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
    color: #b7ab80;
    font-weight: 400;
  }
  .coverage-track {
    grid-column: 1/-1;
    height: 2px;
    background: #b7a47113;
  }
  .coverage-track i {
    height: 100%;
    display: block;
    background: #b9a16b;
    box-shadow: 0 0 7px #c6ae6c35;
  }
  .connection-legend {
    border-top: 1px solid #bfa3671a;
    margin-top: 20px;
    padding-top: 16px;
  }
  .connection-legend h3 {
    font:
      7px ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
    font-weight: 400;
    color: #92896b;
    margin: 0 0 14px;
    letter-spacing: 0.08em;
  }
  .connection-legend h3 span {
    color: #636f5b;
    font-family: inherit;
    letter-spacing: 0;
  }
  .connection-legend > div {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 12px;
  }
  .connection-legend i {
    width: 27px;
    height: 1px;
    background: #c6b182;
  }
  .connection-legend i.structure-key {
    height: 0;
    background: transparent;
    border-top: 1px dashed #626952;
  }
  .connection-legend p {
    margin: 0;
    display: grid;
    gap: 4px;
    font-size: 10px;
    color: #ada48c;
  }
  .connection-legend small {
    font-size: 8px;
    color: #646f5a;
  }
  .browser-hint {
    font-size: 9px;
    line-height: 1.8;
    color: #6c7962;
    margin: 17px 0 0;
  }
  .browser-category {
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    padding-top: 18px;
  }
  .category-code {
    font:
      7px ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
    letter-spacing: 0.13em;
    color: var(--active-color);
    opacity: 0.8;
  }
  .category-view-heading {
    flex: 0 0 auto;
  }
  .category-view-heading h2 {
    font-size: 18px;
    font-weight: 400;
    color: var(--active-color);
    margin: 9px 0 0;
    line-height: 1.5;
  }
  .category-view-heading p {
    font-size: 10px;
    color: #929686;
    line-height: 1.8;
    margin: 9px 0 17px;
  }
  .list-caption {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    padding: 10px 0;
    border-top: 1px solid #bfa3671d;
    border-bottom: 1px solid #bfa3671d;
    color: #787c67;
    font:
      7px ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
    letter-spacing: 0.07em;
  }
  .list-caption strong {
    font-size: 9px;
    font-weight: 400;
    color: #ada184;
    letter-spacing: 0;
  }
  .category-memory-list {
    min-height: 0;
    overflow: auto;
    flex: 1;
    margin-right: -6px;
    padding-right: 6px;
    scrollbar-width: thin;
    scrollbar-color: #465140 transparent;
  }
  .memory-item {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) 10px;
    align-items: start;
    gap: 8px;
    width: 100%;
    padding: 13px 3px;
    text-align: left;
    border-bottom: 1px solid #aeb69a13;
    color: #a5aa98;
  }
  .memory-item-index {
    font:
      8px ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
    padding-top: 3px;
    color: #616e57;
  }
  .memory-item-copy {
    display: grid;
    min-width: 0;
    gap: 7px;
  }
  .memory-item-title {
    font-size: 11px;
    line-height: 1.6;
  }
  .memory-item-meta {
    font:
      8px ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
    color: #67765c;
  }
  .memory-item-arrow {
    font-size: 11px;
    padding-top: 2px;
    color: var(--active-color);
    opacity: 0.5;
  }
  .memory-item:hover,
  .memory-item[aria-pressed='true'] {
    background: color-mix(in srgb, var(--active-color) 7%, transparent);
    color: #ebe4d1;
  }
  .memory-item[aria-pressed='true'] .memory-item-title,
  .memory-item[aria-pressed='true'] .memory-item-index {
    color: var(--active-color);
  }
  .memory-item[aria-pressed='true'] .memory-item-arrow {
    opacity: 1;
  }

  .memory-item {
    overflow-wrap: anywhere;
  }
  .browser-close {
    color: #bdac85;
    font-size: 18px;
    padding: 0 5px;
  }
  @container memory-universe (max-width:1000px) {
    .browser-close {
      display: block;
    }
    .browser-topline > span {
      flex: 1;
    }
  }
</style>
