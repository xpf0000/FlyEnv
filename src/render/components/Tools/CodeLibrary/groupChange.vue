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
      <el-form ref="formRef" class="pb-7" label-position="top" :model="form">
        <el-form-item :label="I18nT('tools.Group')" prop="groupID">
          <template #label>
            <div class="w-full flex items-center justify-between">
              <span>{{ I18nT('tools.Group') }}</span>
              <el-button
                link
                :icon="Plus"
                @click.stop="CodeLibrary.addGroup(langType, undefined)"
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
  import { computed, onBeforeUnmount, ref } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { I18nT } from '@lang/index'
  import type { FormInstance } from 'element-plus'
  import CodeLibrary, { CodeLibraryItemType } from '@/components/Tools/CodeLibrary/setup'
  import { Plus } from '@element-plus/icons-vue'

  const { show, onClosed, onSubmit, closedFn, callback } = AsyncComponentSetup()

  const props = defineProps<{
    langType: string
    item?: CodeLibraryItemType
  }>()

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

  const groups = computed(() => {
    return CodeLibrary.group.filter((item) => item.type === form.value.fromType)
  })

  let submiting = false
  const doSave = async () => {
    if (!formRef.value || submiting) return
    submiting = true
    if (form.value.id) {
      const find = CodeLibrary.items.find((item) => item.id === form.value.id)
      if (find) {
        find.groupID = form.value.groupID
      }
    } else {
      callback(form.value.groupID)
    }
    show.value = false
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
