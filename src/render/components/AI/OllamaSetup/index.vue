<template>
  <el-dialog
    v-model="show"
    :title="I18nT('base.setup')"
    width="600px"
    :destroy-on-close="true"
    class="host-edit new-project"
    @closed="closedFn"
  >
    <template #default>
      <el-form ref="formRef" label-position="top" :rules="rules" :model="form">
        <el-form-item :label="I18nT('ai.apiUrl')" prop="url" :required="true">
          <el-input v-model="form.url">
            <template #append>
              <el-button @click.stop="doReset">{{ I18nT('ai.reset') }}</el-button>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item :error="modelsError" :label="I18nT('ai.model')">
          <el-select v-model="form.model" class="w-full" filterable>
            <template v-for="model in models" :key="model">
              <el-option :value="model" :label="model"></el-option>
            </template>
          </el-select>
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
  import { onBeforeUnmount, reactive, ref, watch } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { I18nT } from '@lang/index'
  import type { FormInstance, FormRules } from 'element-plus'
  import { MessageError } from '@/util/Element'
  import { AISetup, type OllamaServerSetup } from '@/components/AI/setup'
  import IPC from '@/util/IPC'

  const { show, onClosed, onSubmit, closedFn, callback } = AsyncComponentSetup()

  const formRef = ref<FormInstance>()
  const modelsError = ref('')
  const models = ref<string[]>([])

  const form = ref({
    url: 'http://127.0.0.1:11434',
    model: ''
  })

  if (AISetup.ollamaServer.url) {
    form.value.url = AISetup.ollamaServer.url
  }
  if (AISetup.ollamaServer.model) {
    form.value.model = AISetup.ollamaServer.model
  }

  const rules = reactive<FormRules<OllamaServerSetup>>({
    url: [{ required: true, message: I18nT('ai.NeedApiUrl'), trigger: 'blur' }]
  })

  const doReset = () => {
    form.value.url = 'http://127.0.0.1:11434'
  }

  const fetchModels = () => {
    models.value.splice(0)
    form.value.model = ''
    const data = {
      url: `${form.value.url}/api/tags`,
      headers: {
        'Content-Type': 'application/json'
      },
      method: 'get'
    }
    IPC.send('app-fork:ollama', 'models', data).then((key: string, res: any) => {
      IPC.off(key)
      if (res?.code === 0) {
        const list: any = res?.data?.models ?? []
        models.value = list.map((l: any) => l.name)
        form.value.model = models.value?.[0] ?? ''
      } else if (res?.code === 1) {
        IPC.off(key)
        modelsError.value = res?.msg ?? ''
      }
    })
  }

  watch(
    () => form.value.url,
    () => {
      fetchModels()
    },
    {
      immediate: true
    }
  )

  let submiting = false
  const doSave = async () => {
    if (!formRef.value || submiting) return
    if (!form.value.url.trim()) {
      MessageError(I18nT('ai.NeedApiUrl'))
      return
    }
    submiting = true
    await formRef.value.validate((valid) => {
      if (valid) {
        AISetup.ollamaServer.url = form.value.url
        if (form.value.model) {
          AISetup.ollamaServer.model = form.value.model
        }
        AISetup.save()
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
