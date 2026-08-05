<template>
  <el-dialog
    v-model="show"
    title="pgAdmin 4"
    width="440px"
    :close-on-click-modal="false"
    :destroy-on-close="true"
    @closed="clearPassword"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="top"
      @submit.prevent="submit"
    >
      <el-form-item :label="I18nT('feedback.email')" prop="email">
        <el-input v-model="form.email" autocomplete="email" />
      </el-form-item>
      <el-form-item :label="I18nT('common.label.password')" prop="password">
        <el-input
          v-model="form.password"
          type="password"
          show-password
          autocomplete="new-password"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="cancel">{{ I18nT('base.cancel') }}</el-button>
        <el-button type="primary" @click="submit">{{ I18nT('base.confirm') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import type { FormInstance, FormRules } from 'element-plus'
  import { computed, reactive, ref, watch } from 'vue'
  import { I18nT } from '@lang/index'

  interface PgAdminCredentials {
    email: string
    password: string
  }

  const props = defineProps<{ modelValue: boolean }>()
  const emit = defineEmits<{
    'update:modelValue': [value: boolean]
    submit: [credentials: PgAdminCredentials]
  }>()

  const formRef = ref<FormInstance>()
  const form = reactive<PgAdminCredentials>({ email: '', password: '' })
  const rules: FormRules = {
    email: [{ required: true, type: 'email', message: I18nT('feedback.email'), trigger: 'blur' }],
    password: [{ required: true, min: 8, message: I18nT('common.label.password'), trigger: 'blur' }]
  }

  const clearPassword = () => {
    form.password = ''
  }

  const show = computed({
    get: () => props.modelValue,
    set: (value: boolean) => {
      if (!value) {
        clearPassword()
      }
      emit('update:modelValue', value)
    }
  })

  watch(
    () => props.modelValue,
    (value) => {
      if (!value) {
        clearPassword()
      }
    }
  )

  const cancel = () => {
    clearPassword()
    show.value = false
  }

  const submit = async () => {
    const valid = await formRef.value?.validate().catch(() => false)
    if (!valid) {
      return
    }
    const credentials = { email: form.email.trim(), password: form.password }
    clearPassword()
    show.value = false
    emit('submit', credentials)
  }
</script>
