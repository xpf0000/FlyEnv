<template>
  <el-dialog
    v-model="show"
    :title="item?.id ? I18nT('tool.editTool') : I18nT('tool.addTool')"
    width="600px"
    :destroy-on-close="true"
    class="host-edit new-project"
    @closed="closedFn"
  >
    <template #default>
      <div class="main-wapper">
        <div class="main">
          <div class="path-choose mt-20 mb-20">
            <input
              v-model.trim="form.label"
              type="text"
              class="input"
              :class="{ error: errs?.label }"
              :placeholder="I18nT('tool.label')"
            />
          </div>
          <div class="path-choose mt-20 mb-20">
            <input
              v-model.trim="form.component"
              type="text"
              class="input"
              :class="{ error: errs?.component }"
              :placeholder="I18nT('tool.component')"
            />
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="dialog-footer">
        <el-button :disabled="running" @click="show = false">{{ I18nT('base.cancel') }}</el-button>
        <el-button :loading="running" :disabled="running" type="primary" @click="doSave">{{
          I18nT('base.confirm')
        }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>
<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { I18nT } from '@shared/lang'
  import { AppToolStore } from './store'
  import type { AppToolModuleItem } from '@web/core/type'

  const { show, onClosed, onSubmit, closedFn, callback } = AsyncComponentSetup()

  const props = defineProps<{
    item: AppToolModuleItem
  }>()

  const form = ref({
    label: '',
    component: ''
  })

  const errs = ref({
    label: false,
    component: false
  })

  Object.assign(form.value, props?.item)

  const running = computed(() => {
    return AppToolStore.adding
  })

  const checkItem = () => {
    if (!form.value.label.trim()) {
      errs.value.label = true
    }
    if (!form.value.component.trim()) {
      errs.value.component = true
    }

    let k: keyof typeof errs.value
    for (k in errs.value) {
      if (errs.value[k]) {
        return false
      }
    }
    return true
  }

  const doSave = () => {
    if (!checkItem() || running?.value) {
      return
    }
    AppToolStore.doAdd(form.value as any).then(() => {
      show.value = false
    })
  }

  defineExpose({
    show,
    onSubmit,
    onClosed,
    callback
  })
</script>
