<script setup lang="ts">
  import { onBeforeUnmount, ref, watch, watchEffect } from 'vue'
  import Store from './store'
  import { I18nT } from '@shared/lang'
  import type { ShadowRootExpose } from 'vue-shadow-dom'
  import { ShadowRoot } from 'vue-shadow-dom'
  import { render } from '@regexper/render'

  watch(
    () =>
      JSON.stringify({
        regex: Store.regex,
        text: Store.text,
        global: Store.global,
        ignoreCase: Store.ignoreCase,
        multiline: Store.multiline,
        dotAll: Store.dotAll,
        unicode: Store.unicode,
        unicodeSets: Store.unicodeSets
      }),
    () => {
      Store.computedResult()
    }
  )

  watch(
    () => Store.regex,
    () => {
      Store.regexValidation()
      Store.computedSample()
    }
  )

  const visualizerSVG = ref<ShadowRootExpose>()
  watchEffect(async () => {
    const regexValue = Store.regex
    const visualizer = visualizerSVG.value?.shadow_root
    console.log('visualizer: ', visualizer)
    if (visualizer) {
      while (visualizer.lastChild) {
        visualizer.removeChild(visualizer.lastChild)
      }
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      try {
        await render(regexValue, svg)
      } catch (_) {}
      if (visualizerSVG?.value?.shadow_root) {
        visualizer.appendChild(svg)
      }
    }
  })

  onBeforeUnmount(() => {
    const visualizer = visualizerSVG.value?.shadow_root
    if (visualizer) {
      while (visualizer.lastChild) {
        visualizer.removeChild(visualizer.lastChild)
      }
    }
  })
</script>

<template>
  <div class="host-edit tools">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('regex-tester.title') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <div class="p-3 pb-0 overflow-hidden flex-1">
      <el-scrollbar>
        <el-card header="Regex" class="mb-1">
          <el-form-item
            label="Regex to test:"
            label-position="top"
            :error="Store.regexError ? `Invalid regex: ${Store.regexError}` : null"
          >
            <el-input
              v-model="Store.regex"
              placeholder="Put the regex to test"
              type="textarea"
              rows="3"
            />
          </el-form-item>

          <el-form-item label-position="top">
            <el-tooltip content="Global search">
              <el-checkbox v-model="Store.global"> Global search. (g) </el-checkbox>
            </el-tooltip>
            <el-tooltip content="Case-insensitive search">
              <el-checkbox v-model="Store.ignoreCase"> Case-insensitive search. (i) </el-checkbox>
            </el-tooltip>
            <el-tooltip content="Allows ^ and $ to match next to newline characters.">
              <el-checkbox v-model="Store.multiline"> Multiline(m) </el-checkbox>
            </el-tooltip>
            <el-tooltip content="Allows . to match newline characters.">
              <el-checkbox v-model="Store.dotAll"> Singleline(s) </el-checkbox>
            </el-tooltip>
            <el-tooltip content="Unicode; treat a pattern as a sequence of Unicode code points.">
              <el-checkbox v-model="Store.unicode"> Unicode(u) </el-checkbox>
            </el-tooltip>
            <el-tooltip content="An upgrade to the u mode with more Unicode features.">
              <el-checkbox v-model="Store.unicodeSets"> Unicode Sets (v) </el-checkbox>
            </el-tooltip>
          </el-form-item>

          <el-form-item label-position="top" label="Text to match:">
            <el-input
              v-model="Store.text"
              placeholder="Put the text to match"
              type="textarea"
              rows="5"
            />
          </el-form-item>
        </el-card>

        <el-card header="Matches" class="mb-1 mt-3">
          <el-table v-if="Store.results?.length > 0" :data="Store.results">
            <el-table-column label="Index in text" prop="index"></el-table-column>
            <el-table-column label="Value" prop="value"></el-table-column>
            <el-table-column label="Captures">
              <template #default="scope">
                <ul>
                  <li v-for="capture in scope.row.captures" :key="capture.name">
                    "{{ capture.name }}" = {{ capture.value }} [{{ capture.start }} -
                    {{ capture.end }}]
                  </li>
                </ul>
              </template>
            </el-table-column>
            <el-table-column label="Groups">
              <template #default="scope">
                <ul>
                  <li v-for="group in scope.row.groups" :key="group.name">
                    "{{ group.name }}" = {{ group.value }} [{{ group.start }} - {{ group.end }}]
                  </li>
                </ul>
              </template>
            </el-table-column>
          </el-table>
          <el-alert v-else title="No match" type="warning" show-icon :closable="false" />
        </el-card>

        <el-card header="Sample matching text" class="mt-3">
          <pre style="white-space: pre-wrap; word-break: break-all">{{ Store.sample }}</pre>
        </el-card>

        <el-card header="Regex Diagram" style="overflow-x: scroll" class="mt-3">
          <shadow-root ref="visualizerSVG"></shadow-root>
        </el-card>
      </el-scrollbar>
    </div>
  </div>
</template>
