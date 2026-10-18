<template>
  <div class="mt-5"
    ><div class="flex flex-wrap items-center gap-2"
      ><el-button :loading="checking" @click="check">{{ t('check') }}</el-button
      ><el-tag v-if="dirty" type="warning">{{ t('draftLabel') }}</el-tag
      ><el-button
        v-if="manager.launch.state.kind === 'stopped' && manager.launch.state.lastSuccess"
        @click="restore"
        >{{ t('restoreLast') }}</el-button
      ></div
    >
    <el-collapse v-model="expanded" class="mt-3"
      ><el-collapse-item name="command" :title="t('preview')"
        ><el-radio-group v-model="show" size="small"
          ><el-radio-button value="next">{{ t('nextConfiguration') }}</el-radio-button
          ><el-radio-button value="active">{{
            t('activeConfiguration')
          }}</el-radio-button></el-radio-group
        ><template v-if="show === 'next'"
          ><p v-if="operation?.error" class="mt-3 break-all">{{ operation.error }}</p
          ><p v-for="(issue, i) in report?.issues" :key="i" class="mt-2 break-words text-sm">{{
            issue.message
          }}</p></template
        ><p v-if="show === 'active' && !active" class="mt-3">{{ t('launchRecordUnavailable') }}</p
        ><div v-if="show === 'active' && manager.launch.state.active" class="mt-3 text-sm"
          ><p
            >{{ t('modalities') }}:
            {{
              manager.launch.state.active.observation.modalities?.join(', ') || t('unverified')
            }}</p
          ><p v-if="manager.launch.state.active.observation.reason">{{
            manager.launch.state.active.observation.reason
          }}</p
          ><pre class="whitespace-pre-wrap break-all text-xs">{{
            JSON.stringify(manager.launch.state.active.observation.templateCaps, null, 2)
          }}</pre>
        </div>
        <template v-if="invocation"
          ><p class="mt-3 break-all text-xs">cwd: {{ invocation.cwd }} · {{ platform }}</p
          ><pre class="mt-3 overflow-auto whitespace-pre-wrap break-all text-xs">{{
            invocation.display
          }}</pre
          ><el-button class="mt-2" size="small" @click="copy">{{ t('copyCommand') }}</el-button
          ><pre
            v-if="Object.keys(invocation.environmentSources ?? {}).length"
            class="mt-3 whitespace-pre-wrap break-all text-xs"
            >{{ t('inheritedEnvironment') }}: {{
              JSON.stringify(invocation.environmentSources, null, 2)
            }}</pre
          ><details class="mt-3"
            ><summary>{{ t('arguments') }}</summary
            ><pre class="mt-2 overflow-auto whitespace-pre-wrap break-all text-xs">{{
              JSON.stringify(invocation.args, null, 2)
            }}</pre>
          </details></template
        ></el-collapse-item
      ></el-collapse
    >
  </div>
</template>
<script lang="ts" setup>
  import { computed, ref, watch, onUnmounted, h } from 'vue'
  import { ElMessageBox } from 'element-plus'
  import { BrewStore } from '@/store/brew'
  import { LlamaCppManager as manager } from '../controller'
  import { LlamaCppT as t } from '../lang'
  import { clone, type LaunchInput } from '../../shared/settings'
  import type { SoftInstalled } from '@shared/app'
  const props = defineProps<{ input: LaunchInput; runtime: SoftInstalled; dirty: boolean }>()
  const expanded = ref<string[]>([]),
    show = ref('next')
  const requestKey = computed(() => JSON.stringify([clone(props.input), clone(props.runtime)]))
  const operation = computed(() =>
    manager.launch.previewOperation?.requestKey === requestKey.value
      ? manager.launch.previewOperation
      : undefined
  )
  const report = computed(() => operation.value?.report),
    checking = computed(() => operation.value?.status === 'checking')
  const active = computed(() =>
    manager.launch.state.kind === 'running-known' ? manager.launch.state.active?.launch : undefined
  )
  const invocation = computed(() =>
    show.value === 'active' ? active.value : report.value?.prepared
  )
  const platform = computed(() => {
    try {
      return JSON.parse(invocation.value?.runtimeKey ?? '{}').platform === 'windows'
        ? 'PowerShell'
        : 'POSIX shell'
    } catch {
      return ''
    }
  })
  const check = () =>
    manager.launch
      .preview(props.input, props.runtime)
      .then((r) => {
        if (r.issues.length) expanded.value = ['command']
      })
      .catch(() => {
        expanded.value = ['command']
      })
  const copy = async () => {
    if (invocation.value) await navigator.clipboard.writeText(invocation.value.display)
  }
  const restore = async () => {
    try {
      const old = manager.launch.state.lastSuccess?.launch
      await ElMessageBox.confirm(
        h('div', [
          h('p', t('restoreConfirm')),
          h('pre', { class: 'whitespace-pre-wrap break-all text-xs' }, old?.display)
        ]),
        t('restoreLast')
      )
      const service = BrewStore().currentVersion('llama-cpp')
      if (service) await manager.launch.restoreLastSuccess(props.runtime, service)
    } catch {}
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  watch(
    requestKey,
    () => {
      clearTimeout(timer)
      timer = setTimeout(check, 300)
    },
    { immediate: true }
  )
  onUnmounted(() => clearTimeout(timer))
</script>
