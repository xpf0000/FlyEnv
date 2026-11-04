<template>
  <el-dialog
    v-model="show"
    :title="DamengT('chooseInstallDirectory')"
    width="600px"
    :close-on-click-modal="!submitting"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
  >
    <p class="mb-5 text-sm leading-6">{{ DamengT('installDirectoryRule') }}</p>
    <el-form label-position="top" @submit.prevent="submit">
      <el-form-item :label="DamengT('installDirectory')">
        <el-input v-model="directory" :disabled="submitting || browsing" :placeholder="examplePath">
          <template #append>
            <el-button :loading="browsing" :disabled="submitting" @click="browse">
              {{ DamengT('browseDirectory') }}
            </el-button>
          </template>
        </el-input>
      </el-form-item>
      <p v-if="error" class="text-sm text-red-500" role="alert">{{ error }}</p>
    </el-form>
    <template #footer>
      <el-button :disabled="submitting" @click="show = false">{{ I18nT('base.cancel') }}</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="browsing || !directory"
        @click="submit"
      >
        {{ DamengT('confirmDownload') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { onBeforeUnmount, ref, watch } from 'vue'
  import { I18nT } from '@lang/index'
  import type { DamengVersionItem } from '../shared'
  import { DamengManager } from './store'
  import { DamengT } from './lang'

  const show = ref(false)
  const directory = ref('')
  const browsing = ref(false)
  const submitting = ref(false)
  const error = ref('')
  const target = ref<DamengVersionItem>()
  const examplePath = window.Server.isWindows ? 'C:\\DM8' : '/opt/dm8'
  let generation = 0
  watch(show, () => generation++, { flush: 'sync' })
  onBeforeUnmount(() => generation++)

  const open = (item: DamengVersionItem) => {
    if (submitting.value || item.downing || item.installed || item.disabled) return
    generation++
    target.value = item
    directory.value = ''
    error.value = ''
    browsing.value = false
    show.value = true
  }
  const browse = async () => {
    if (browsing.value || submitting.value) return
    const token = generation
    browsing.value = true
    try {
      const selected = await DamengManager.chooseInstallDirectory(directory.value)
      if (token === generation && selected) {
        directory.value = selected
        error.value = ''
      }
    } finally {
      if (token === generation) browsing.value = false
    }
  }
  const submit = async () => {
    const item = target.value
    if (!item || submitting.value || browsing.value || !directory.value) return
    const token = generation
    submitting.value = true
    error.value = ''
    try {
      await DamengManager.install(item, directory.value, () => {
        if (token === generation) {
          submitting.value = false
          show.value = false
        }
      })
      if (token === generation) error.value = DamengManager.state(item)?.error ?? ''
    } finally {
      if (token === generation) submitting.value = false
    }
  }
  defineExpose({ open })
</script>
