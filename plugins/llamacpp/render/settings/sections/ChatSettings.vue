<template>
  <div
    ><OptionFields
      v-model:profile="profile"
      :backend="backend"
      :caps="caps"
      group="chat"
    /><el-form-item :label="t('templateSource')"
      ><el-select :model-value="profile.chat.template.kind" @change="changeTemplate"
        ><el-option value="model" :label="t('modelTemplate')" /><el-option
          value="builtin"
          :label="t('namedTemplate')" /><el-option
          value="file"
          :label="t('localTemplate')" /></el-select></el-form-item
    ><el-form-item v-if="profile.chat.template.kind === 'builtin'" :label="t('namedTemplate')"
      ><el-input v-model="profile.chat.template.name" placeholder="chatml" /></el-form-item
    ><el-form-item v-if="profile.chat.template.kind === 'file'" :label="t('localTemplate')"
      ><div class="flex w-full flex-col gap-2"
        ><span class="break-all text-xs">{{
          profile.chat.template.file.kind === 'external'
            ? profile.chat.template.file.path
            : profile.chat.template.file.fileKey
        }}</span
        ><el-button :loading="picking" @click="pick">{{ t('chooseFile') }}</el-button></div
      ></el-form-item
    ><el-form-item :label="t('templateParameters')"
      ><div class="flex w-full flex-col gap-1"
        ><el-input v-model="kwargs" type="textarea" :rows="4" placeholder="{}" /><span
          class="text-xs"
          >{{ t('templateHint') }}</span
        ><span v-if="invalid" class="text-xs text-red-500">{{ invalid }}</span></div
      ></el-form-item
    ></div
  >
</template>
<script lang="ts" setup>
  import { ref, watch, onUnmounted } from 'vue'
  import { LlamaCppManager as manager } from '../../controller'
  import { LlamaCppT as t } from '../../lang'
  import type { ModelProfile } from '../../../shared/settings'
  import type { RuntimeCapabilities } from '../../../shared/launchOptions'
  import OptionFields from './OptionFields.vue'
  const profile = defineModel<ModelProfile>('profile', { required: true })
  defineProps<{
    backend: string
    caps?: RuntimeCapabilities
  }>()
  const emit = defineEmits<{ invalid: [error: string] }>()
  const kwargs = ref(''),
    invalid = ref(''),
    picking = ref(false)
  let mounted = true
  watch(
    () => profile.value,
    (p) => {
      kwargs.value =
        p.chat.templateKwargs === undefined ? '' : JSON.stringify(p.chat.templateKwargs, null, 2)
    },
    { immediate: true }
  )
  watch(kwargs, (v) => {
    try {
      const value = v.trim() ? JSON.parse(v) : undefined
      if (value !== undefined && (!value || Array.isArray(value) || typeof value !== 'object'))
        throw Error(t('jsonObjectRequired'))
      profile.value.chat.templateKwargs = value
      invalid.value = ''
    } catch (e) {
      invalid.value = String(e)
    }
    emit('invalid', invalid.value)
  })
  const changeTemplate = (kind: string) => {
    profile.value.chat.template =
      kind === 'builtin'
        ? { kind: 'builtin', name: '' }
        : kind === 'file'
          ? { kind: 'file', file: { kind: 'external', path: '' } }
          : { kind: 'model' }
  }
  const pick = async () => {
    const owner = profile.value
    picking.value = true
    try {
      const file = await manager.pickReference('template')
      if (file && mounted && owner === profile.value) {
        profile.value.chat.template = { kind: 'file', file }
        profile.value.chat.jinja = true
      }
    } catch (e) {
      invalid.value = String(e)
      emit('invalid', invalid.value)
    } finally {
      picking.value = false
    }
  }
  onUnmounted(() => {
    mounted = false
  })
</script>
