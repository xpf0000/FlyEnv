<template>
  <el-dialog
    v-model="show"
    :title="I18nT('base.edit')"
    width="600px"
    :destroy-on-close="true"
    class="host-edit new-project overflow-hidden el-dialog-content-flex-1"
    @closed="closedFn"
  >
    <template #default>
      <el-scrollbar max-height="55vh">
        <el-form ref="formRef" class="pb-7" label-position="top" :rules="rules" :model="form">
          <el-form-item :label="I18nT('base.name')" prop="name" :required="true">
            <el-input v-model="form.name"></el-input>
          </el-form-item>
          <el-form-item :label="I18nT('host.comment')" prop="comment">
            <el-input v-model="form.comment" type="textarea" :rows="2" resize="none"></el-input>
          </el-form-item>
          <el-form-item
            v-if="!langType && !item?.fromType"
            :label="I18nT('tools.CodeLanguage')"
            prop="fromType"
            :required="true"
          >
            <el-select v-model="form.fromType">
              <template v-for="(l, _l) in langs" :key="_l">
                <el-option :label="l" :value="l"></el-option>
              </template>
            </el-select>
          </el-form-item>
          <el-form-item v-if="!groupID" :label="I18nT('tools.Group')" prop="groupID">
            <template #label>
              <div class="w-full flex items-center justify-between">
                <span>{{ I18nT('tools.Group') }}</span>
                <el-button
                  link
                  :icon="Plus"
                  :disabled="!form.fromType"
                  @click.stop="CodeLibrary.addGroup(form.fromType, undefined)"
                ></el-button>
              </div>
            </template>
            <el-select v-model="form.groupID">
              <el-option :label="I18nT('base.none')" :value="''"></el-option>
              <template v-for="(l, _l) in groups" :key="_l">
                <el-option :label="l.name" :value="l.id"></el-option>
              </template>
            </el-select>
          </el-form-item>
          <el-form-item :label="I18nT('tools.Code')" prop="value">
            <el-input v-model="form.value" type="textarea" :rows="6" resize="none"></el-input>
          </el-form-item>
          <el-form-item :label="I18nT('tools.CodeResult')" prop="value">
            <el-input v-model="form.toValue" type="textarea" :rows="4" resize="none"></el-input>
          </el-form-item>
        </el-form>
      </el-scrollbar>
    </template>
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="show = false">{{ I18nT('base.cancel') }}</el-button>
        <template v-if="isLock">
          <el-tooltip placement="right" :content="I18nT('host.licenseTips')">
            <el-button type="info" :icon="Lock"></el-button>
          </el-tooltip>
        </template>
        <template v-else>
          <el-button type="primary" @click="doSave">{{ I18nT('base.confirm') }}</el-button>
        </template>
      </div>
    </template>
  </el-dialog>
</template>
<script lang="ts" setup>
  import { computed, onBeforeUnmount, reactive, ref } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { I18nT } from '@lang/index'
  import type { FormInstance } from 'element-plus'
  import { MessageError } from '@/util/Element'
  import CodeLibrary, { CodeLibraryItemType } from '@/components/Tools/CodeLibrary/setup'
  import { languagesToCheck } from '../CodePlayground/languageDetector'
  import { uuid } from '@/util/Index'
  import { Plus, Lock } from '@element-plus/icons-vue'
  import { SetupStore } from '@/components/Setup/store'

  const { show, onClosed, onSubmit, closedFn, callback } = AsyncComponentSetup()

  const props = defineProps<{
    langType: string
    item?: CodeLibraryItemType
    groupID?: string
  }>()

  const langs = computed(() => {
    return languagesToCheck.sort()
  })

  const formRef = ref<FormInstance>()

  const form = ref<CodeLibraryItemType>({
    id: '',
    groupID: '',
    value: '',
    fromType: '',
    toValue: '',
    comment: '',
    name: ''
  })

  Object.assign(form.value, props.item)
  if (props.langType) {
    form.value.fromType = props.langType
  }
  if (props.groupID) {
    form.value.groupID = props.groupID
  }

  const setupStore = SetupStore()

  const isLock = computed(() => {
    return !setupStore.isActive && CodeLibrary.items.length > 2 && !props.item?.id
  })

  const groups = computed(() => {
    return CodeLibrary.group.filter((item) => item.type === form.value.fromType)
  })

  const rules = reactive({
    fromType: [{ required: true, message: I18nT('tools.CodeLanguageNeed'), trigger: 'blur' }],
    name: [
      {
        required: true,
        message: I18nT('tools.NameNeed'),
        trigger: 'blur'
      }
    ]
  })
  let submiting = false
  const doSave = async () => {
    if (!formRef.value || submiting) return
    if (!form.value.fromType.trim()) {
      MessageError(I18nT('tools.CodeLanguageNeed'))
      return
    }
    if (!form.value.name.trim()) {
      MessageError(I18nT('tools.NameNeed'))
      return
    }
    submiting = true
    await formRef.value.validate((valid) => {
      if (valid) {
        if (!form.value.id) {
          form.value.id = uuid()
          CodeLibrary.items.unshift({ ...form.value })
        } else {
          const find = CodeLibrary.items.find((item) => item.id === form.value.id)
          if (find) {
            Object.assign(find, form.value)
          }
        }
        CodeLibrary.groupID = form.value.groupID
        CodeLibrary.itemID = form.value.id
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
