<template>
  <el-dialog
    v-model="show"
    :title="I18nT('base.edit')"
    width="600px"
    :destroy-on-close="true"
    class="host-edit new-project"
    @closed="closedFn"
  >
    <template #default>
      <el-form ref="formRef" label-position="top" :rules="rules" :model="form">
        <el-form-item :label="I18nT('ai.chatName')" prop="title" :required="true">
          <el-input v-model="form.title"></el-input>
        </el-form-item>
        <el-form-item :label="I18nT('ai.chatPrompt')" prop="prompt" :required="true">
          <el-input v-model="form.prompt" type="textarea" :rows="8"></el-input>
        </el-form-item>
        <el-form-item :label="I18nT('ai.Temperature')" prop="prompt" :required="true">
          <el-slider
            v-model="form.temperature"
            :show-input="true"
            :show-input-controls="true"
            :show-tooltip="true"
            :min="0"
            :max="2.0"
            :step="0.01"
            :marks="marks"
          />
        </el-form-item>
      </el-form>
    </template>
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="show = false">{{ I18nT('base.cancel') }}</el-button>
        <el-button type="primary" @click="doSave">{{ I18nT('base.confirm') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>
<script lang="ts" setup>
  import { computed, onBeforeUnmount, reactive, ref } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { I18nT } from '@lang/index'
  import type { FormInstance, FormRules } from 'element-plus'
  import { MessageError } from '@/util/Element'
  import type { AIOllama } from '@/components/AI/AIOllama'

  const { show, onClosed, onSubmit, closedFn, callback } = AsyncComponentSetup()

  const props = defineProps<{
    item: AIOllama
  }>()

  const marks = computed(() => {
    return {
      0.2: I18nT('ai.Meticulous'),
      0.8: I18nT('ai.Creative')
    }
  })

  const formRef = ref<FormInstance>()

  const form = ref({
    title: '',
    prompt: '',
    temperature: 0.7
  })

  Object.assign(form.value, props.item)

  const rules = reactive<FormRules<AIOllama>>({
    title: [{ required: true, message: I18nT('ai.NeedChatName'), trigger: 'blur' }],
    prompt: [
      {
        required: true,
        message: I18nT('ai.NeedChatPrompt'),
        trigger: 'blur'
      }
    ]
  })
  let submiting = false
  const doSave = async () => {
    if (!formRef.value || submiting) return
    if (!form.value.title.trim()) {
      MessageError(I18nT('ai.NeedChatName'))
      return
    }
    if (!form.value.prompt.trim()) {
      MessageError(I18nT('ai.NeedChatPrompt'))
      return
    }
    submiting = true
    await formRef.value.validate((valid) => {
      if (valid) {
        Object.assign(props.item, form.value)
        console.log('submit!')
        show.value = false
      } else {
        submiting = false
      }
    })
  }

  onBeforeUnmount(() => {
    callback(false)
  })

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
