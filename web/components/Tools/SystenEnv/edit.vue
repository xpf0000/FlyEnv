<template>
  <el-drawer
    v-model="show"
    :title="null"
    :with-header="false"
    size="75%"
    :destroy-on-close="true"
    @closed="closedFn"
  >
    <template #default>
      <div class="host-edit">
        <div class="nav">
          <div class="left" @click="show = false">
            <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
            <span class="ml-15">{{ file }}</span>
          </div>
          <el-button
            type="primary"
            class="shrink0"
            :disabled="disabled || saving"
            :loading="saving"
            @click="doSubmit"
            >{{ $t('base.confirm') }}</el-button
          >
        </div>
        <div class="main-wapper">
          <div ref="input" class="block" style="width: 100%; height: 100%"></div>
        </div>
      </div>
    </template>
  </el-drawer>
</template>
<script lang="ts" setup>
  import { nextTick, onMounted, onUnmounted, ref } from 'vue'
  import { AsyncComponentSetup, EditorCreate, waitTime } from '@web/fn'
  import { I18nT } from '@shared/lang'
  import { editor, KeyCode, KeyMod } from 'monaco-editor/esm/vs/editor/editor.api.js'
  import { EditorConfigMake } from '@web/fn'
  import { MessageSuccess } from '@/util/Element'
  import { ElMessageBox } from 'element-plus'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  defineProps<{
    file: string
  }>()

  const disabled = ref(false)
  const content = ref('')
  const input = ref()
  const saving = ref(false)
  let monacoInstance: editor.IStandaloneCodeEditor | null

  const initEditor = () => {
    if (!monacoInstance) {
      if (!input?.value?.style) {
        return
      }
      monacoInstance = EditorCreate(input.value, EditorConfigMake(content.value, false, 'off'))
      monacoInstance.addAction({
        id: 'save',
        label: 'save',
        keybindings: [KeyMod.CtrlCmd | KeyCode.KeyS],
        run: () => {
          doSubmit()
        }
      })
    } else {
      monacoInstance.setValue(content.value)
    }
  }

  const fetchContent = async () => {
    content.value = `source ~/.bash_profile
export HOMEBREW_BOTTLE_DOMAIN=https://mirrors.ustc.edu.cn/homebrew-bottles
export HOMEBREW_API_DOMAIN=https://mirrors.tuna.tsinghua.edu.cn/homebrew-bottles/api
export HOMEBREW_PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple/

# fnm
export PATH="/Users/x/Library/Application Support/fnm:$PATH"
eval "\`fnm env\`"

#export NVM_DIR="$HOME/.nvm"
#[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"  # This loads nvm
#[ -s "$NVM_DIR/bash_completion" ] && \\. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
`
    initEditor()
  }

  fetchContent().then()

  const doSubmit = () => {
    if (disabled.value || saving.value) {
      return
    }
    ElMessageBox.confirm(I18nT('util.toolSaveConfim'), undefined, {
      confirmButtonText: I18nT('base.confirm'),
      cancelButtonText: I18nT('base.cancel'),
      closeOnClickModal: false,
      customClass: 'confirm-del',
      type: 'warning'
    }).then(() => {
      saving.value = true
      waitTime().then(() => {
        MessageSuccess(I18nT('base.success'))
        saving.value = false
      })
    })
  }

  onMounted(() => {
    nextTick().then(() => {
      initEditor()
    })
  })

  onUnmounted(() => {
    monacoInstance && monacoInstance.dispose()
    monacoInstance = null
  })

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
