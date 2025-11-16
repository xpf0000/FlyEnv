import { ComputedRef, ref } from 'vue'
import { dialog } from '@/util/NodeFn'
import YAML from 'yamljs'
import { I18nT } from '@lang/index'
import { MessageSuccess } from '@/util/Element'

type FormItemType = {
  wwwRoot?: string
  build: () => Promise<any>
}

export const ComposeBuildSetup = (form: ComputedRef<FormItemType>) => {
  // 对话框控制
  const dialogVisible = ref(false)
  const composeYaml = ref('')

  // 选择目录（浏览器环境下有限制）
  const selectDirectory = () => {
    dialog
      .showOpenDialog({
        properties: ['openDirectory', 'createDirectory', 'showHiddenFiles']
      })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const [path] = filePaths
        form.value.wwwRoot = path
      })
  }

  // 生成 Docker Compose
  const generateCompose = async () => {
    const services = await form.value.build()

    const compose = {
      services
    }

    composeYaml.value = YAML.stringify(compose, Infinity, 2)
    dialogVisible.value = true
  }

  // 复制到剪贴板
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(composeYaml.value)
      MessageSuccess(I18nT('base.copySuccess'))
    } catch (err) {
      console.error('Copy Fail:', err)
    }
  }

  return {
    dialogVisible,
    composeYaml,
    selectDirectory,
    generateCompose,
    copyToClipboard
  }
}
