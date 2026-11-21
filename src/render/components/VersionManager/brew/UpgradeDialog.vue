<template>
  <el-dialog
    v-model="visible"
    :title="I18nT('versionmanager.brewUpgradeConfirm')"
    width="min(600px, 90vw)"
    append-to-body
  >
    <template v-if="preview">
      <p class="mb-4">{{ I18nT('versionmanager.brewUpgradeWarning') }}</p>
      <p class="font-semibold break-all">{{ preview.snapshot.formula }}</p>
      <p class="my-2"
        >{{ preview.snapshot.installedVersions.join(', ') }} →
        {{ preview.snapshot.availableVersion }}</p
      >
      <p v-if="changesSeries" class="text-yellow-600 dark:text-yellow-400 my-2">{{
        I18nT('versionmanager.brewUpgradeSeriesChange')
      }}</p>
      <details v-if="otherFormulas.length" class="my-4">
        <summary class="cursor-pointer">
          {{ I18nT('versionmanager.brewUpgradeImpact') }} ({{ otherFormulas.length }})
        </summary>
        <p class="mt-2 max-h-28 overflow-y-auto break-words">{{ otherFormulas.join(', ') }}</p>
      </details>
      <p class="mt-4">{{ I18nT('versionmanager.brewUpgradeStops') }}</p>
      <ul class="mt-2 list-disc pl-5">
        <li
          v-for="target in preview.targets"
          :key="`${target.module}:${target.item.pid}`"
          class="break-all"
          >{{ target.module }} {{ target.item.version }} — {{ target.item.bin }}</li
        >
        <li v-if="!preview.targets.length">{{ I18nT('versionmanager.brewUpgradeNoServices') }}</li>
      </ul>
    </template>
    <template #footer>
      <el-button @click="visible = false">{{ I18nT('base.cancel') }}</el-button>
      <el-button type="primary" :disabled="busy" @click="confirm">{{
        I18nT('versionmanager.brewUpgradeConfirm')
      }}</el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { I18nT } from '@lang/index'
  import type { BrewUpgradePreview } from '@fork/module/Brew/UpgradeTypes'

  const props = defineProps<{
    preview?: BrewUpgradePreview
    busy: boolean
    warnPhpSeries?: boolean
  }>()
  const visible = defineModel<boolean>({ required: true })
  const emit = defineEmits<{ confirm: [preview: BrewUpgradePreview] }>()
  const otherFormulas = computed(() => {
    if (!props.preview) return []
    const { affectedRacks, formula } = props.preview.snapshot
    const selected = formula.split('/').at(-1)
    return affectedRacks.map((rack) => rack.split('/').at(-1)).filter((name) => name !== selected)
  })
  const changesSeries = computed(
    () =>
      props.warnPhpSeries &&
      props.preview?.snapshot.installedVersions.some(
        (version) =>
          version.split('.').slice(0, 2).join('.') !==
          props.preview?.snapshot.availableVersion.split('.').slice(0, 2).join('.')
      )
  )
  const confirm = () => {
    if (!props.preview) return
    visible.value = false
    emit('confirm', props.preview)
  }
</script>
