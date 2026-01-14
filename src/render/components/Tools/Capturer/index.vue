<script setup lang="ts">
  import { computed, ref, watch, nextTick } from 'vue'
  import { useEventListener } from '@vueuse/core'
  import { I18nT } from '@lang/index'
  import IPC from '@/util/IPC'
  import { Delete, FolderOpened, Lock, Plus } from '@element-plus/icons-vue'
  import { dialog } from '@/util/NodeFn'
  import Setup from '@/components/Tools/Capturer/setup'
  import { SetupStore } from '@/components/Setup/store'
  import { ElMessageBox } from 'element-plus'

  const name = ref()
  const keyInputAbled = ref(false)
  const form = ref<any>({
    key: [],
    dir: '',
    name: ''
  })

  form.value = JSON.parse(JSON.stringify(Setup))

  const event = ref<KeyboardEvent>()

  useEventListener(document, 'keydown', (e) => {
    if (!keyInputAbled.value) return
    event.value = e
    e?.stopPropagation?.()
    e?.preventDefault?.()
  })

  const inputKey = computed(() => {
    const arr: string[] = []
    if (event.value?.metaKey) {
      arr.push('Meta')
    }
    if (event.value?.shiftKey) {
      arr.push('Shift')
    }
    if (event.value?.ctrlKey) {
      arr.push('Control')
    }
    if (event.value?.altKey) {
      arr.push('Alt')
    }
    if (event.value?.key && !arr.includes(event.value?.key)) {
      arr.push(event.value?.key)
    }
    return arr
  })

  watch(
    inputKey,
    (v) => {
      if (v && v.length) {
        form.value.key = v
      }
    },
    {
      deep: true
    }
  )

  const doCapturer = async (hideWindow: boolean) => {
    if (!setupStore.isActive && Setup.trialStartTime === 0) {
      await ElMessageBox.alert(I18nT('ai.noLiencesTips'))
      Setup.trialStartTime = Math.round(new Date().getTime() / 1000)
      Setup.save(false)
    }

    IPC.send('Capturer:doCapturer', hideWindow).then((key: string) => {
      IPC.off(key)
    })
  }

  const doSaveConfig = () => {
    Setup.dir = form.value.dir
    Setup.name = form.value.name
    Setup.key = form.value.key
    Setup.save()
  }

  const chooseDir = () => {
    dialog
      .showOpenDialog({
        properties: ['openDirectory', 'showHiddenFiles', 'createDirectory']
      })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const [path] = filePaths
        form.value.dir = path
      })
  }

  /**
   * 向name中添加规则 加到输入框的光标处
   * @param rule
   */
  const addNameRule = (rule: string) => {
    if (!name?.value) {
      return
    }
    name.value?.focus()
    const input = name.value.$el.querySelector('input')
    if (!input) return

    const start = input.selectionStart
    const end = input.selectionEnd
    const currentValue = form.value.name

    // 在光标位置插入规则
    form.value.name = currentValue.substring(0, start) + rule + currentValue.substring(end)

    // 将光标移动到插入内容之后
    nextTick(() => {
      input.focus()
      const newPosition = start + rule.length
      input.setSelectionRange(newPosition, newPosition)
    })
  }

  const onMouseEnter = () => {
    keyInputAbled.value = true
  }

  const onMouseLeave = () => {
    keyInputAbled.value = false
  }

  const showKey = computed(() => {
    if (form.value.key.length) {
      return form.value.key.join(' + ')
    }
    return I18nT('base.none')
  })

  const setupStore = SetupStore()
  const isLocked = computed(() => {
    if (setupStore.isActive) {
      return false
    }
    if (Setup.trialStartTime === 0) {
      return false
    }

    const currentTime = Math.round(new Date().getTime() / 1000)
    if (Setup.trialStartTime + 3 * 24 * 60 * 60 < currentTime) {
      return true
    }

    return false
  })

  const cleanShortcut = () => {
    event.value = {} as any
    form.value.key = []
  }
</script>

<template>
  <div class="host-edit tools">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('tools.Capturer') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <div class="p-3 pb-0 overflow-hidden flex-1">
      <el-scrollbar>
        <el-form label-position="top" @submit.prevent>
          <el-form-item :label="I18nT('tools.CapturerShortcut')">
            <template #label>
              <div class="flex items-center gap-2">
                <span>{{ I18nT('tools.CapturerShortcut') }}</span>
                <el-button link :icon="Delete" @click.stop="cleanShortcut"></el-button>
              </div>
            </template>
            <el-card
              shadow="hover"
              class="mb-5 w-full hover:border-1 hover:border-solid hover:border-blue-500 group"
              @mouseleave.stop="onMouseLeave"
              @mouseenter.stop="onMouseEnter"
            >
              <div class="py-12 text-center">
                <div
                  class="mb-2 text-3xl flex items-center justify-center gap-2 group-hover:text-blue-500"
                >
                  <template v-if="isLocked">
                    <el-tooltip placement="top" :content="I18nT('fork.trialEnd')">
                      <Lock
                        class="w-[30px] h-[30px] text-yellow-500 select-none outline-none"
                      ></Lock>
                    </el-tooltip>
                  </template>
                  <span>{{ showKey }}</span>
                </div>
                <span class="lh-1 op-70">
                  {{ I18nT('tools.CapturerShortcutTips') }}
                </span>
              </div>
            </el-card>
          </el-form-item>
          <el-form-item :label="I18nT('tools.CapturerSaveDir')">
            <el-input v-model="form.dir">
              <template #append>
                <el-button :icon="FolderOpened" @click.stop="chooseDir"></el-button>
              </template>
            </el-input>
          </el-form-item>
          <el-form-item :label="I18nT('tools.CapturerNameRule')">
            <div class="w-full flex flex-col gap-2">
              <div class="w-full flex flex-wrap gap-2">
                <el-button
                  style="margin-left: 0"
                  :icon="Plus"
                  @click.stop="addNameRule('{index}')"
                  >{{ I18nT('tools.RuleIndex') }}</el-button
                >
                <el-button
                  style="margin-left: 0"
                  :icon="Plus"
                  @click.stop="addNameRule('{timestramp}')"
                  >{{ I18nT('tools.RuleTimestamp') }}</el-button
                >
                <el-button
                  style="margin-left: 0"
                  :icon="Plus"
                  @click.stop="addNameRule('{datetime}')"
                  >{{ I18nT('tools.RuleDateTime') }}</el-button
                >
                <el-button
                  style="margin-left: 0"
                  :icon="Plus"
                  @click.stop="addNameRule('{uuid}')"
                  >{{ I18nT('tools.RuleUUID') }}</el-button
                >
              </div>
              <el-input ref="name" v-model="form.name">
                <template #suffix>
                  <span>.png</span>
                </template>
              </el-input>
            </div>
          </el-form-item>
        </el-form>

        <el-button type="primary" @click.stop="doSaveConfig">保存</el-button>
        <template v-if="isLocked">
          <el-tooltip placement="top" :content="I18nT('fork.trialEnd')">
            <el-button type="warning" :icon="Lock">截图</el-button>
          </el-tooltip>
        </template>
        <template v-else>
          <el-button type="primary" @click.stop="doCapturer(false)">截图</el-button>
        </template>

        <template v-if="isLocked">
          <el-tooltip placement="top" :content="I18nT('fork.trialEnd')">
            <el-button type="warning" :icon="Lock">隐藏此窗口截图</el-button>
          </el-tooltip>
        </template>
        <template v-else>
          <el-button type="primary" @click.stop="doCapturer(true)">隐藏此窗口截图</el-button>
        </template>
      </el-scrollbar>
    </div>
  </div>
</template>
