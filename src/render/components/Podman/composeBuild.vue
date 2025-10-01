<template>
  <el-dialog
    v-model="show"
    :title="I18nT('podman.Build') + ' Compose'"
    :destroy-on-close="true"
    class="el-dialog-content-flex-1 h-[75%] w-[75%] dark:bg-[#1d2033]"
    @closed="closedFn"
  >
    <template #default>
      <div class="flex gap-2 h-full overflow-hidden">
        <el-card
          style="--el-card-padding: 0 12px"
          shadow="never"
          class="w-[280px] flex-shrink-0 app-base-el-card"
        >
          <el-scrollbar>
            <el-checkbox-group v-model="module">
              <el-collapse v-model="cate" style="border-top: none">
                <template v-for="(item, _index) in cates" :key="_index">
                  <el-collapse-item :title="I18nT(`aside.${item.cate}`)" :name="item.cate">
                    <div class="w-full flex flex-col">
                      <template v-for="(sub, _j) in item.sub" :key="_j">
                        <el-checkbox :value="sub" :label="sub"></el-checkbox>
                      </template>
                    </div>
                  </el-collapse-item>
                </template>
              </el-collapse>
            </el-checkbox-group>
          </el-scrollbar>
        </el-card>
        <div class="right flex-1">
          <template v-if="!module.length">
            <div class="w-full pt-8 flex justify-center">
              <el-empty :description="I18nT('podman.ModuleEmpty')"></el-empty>
            </div>
          </template>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="dialog-footer">
        <el-button @click.stop="onCancel">{{ I18nT('base.cancel') }}</el-button>
        <el-button type="primary" @click.stop="doSubmit">{{ I18nT('base.confirm') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
  import { PodmanManager } from '@/components/Podman/class/Podman'
  import { FolderOpened, Plus, Delete } from '@element-plus/icons-vue'
  import { dialog } from '@/util/NodeFn'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { uuid } from '@/util/Index'
  import { AllAppModule, AllAppModuleType } from '@/core/type'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    item?: any
  }>()

  type FormItem = {
    id: string
    name: string
    flag: string
    comment: string
    paths: Array<{ path: string; id: string }>
  }

  const form = ref<FormItem>({
    id: uuid(),
    name: '',
    flag: '',
    comment: '',
    paths: [
      {
        id: uuid(),
        path: ''
      }
    ]
  })

  if (props?.item?.id) {
    Object.assign(form.value, props?.item)
    form.value.paths = props.item.paths.map((p: string) => ({ path: p }))
  }

  type CateType = {
    cate: AllAppModuleType
    sub: string[]
  }

  const module = ref<string[]>([])

  const cates = ref<CateType[]>([
    {
      cate: 'webServer',
      sub: ['Apache HTTP Server', 'Caddy', 'Consul', 'Nginx', 'Apache Tomcat']
    },
    {
      cate: 'language',
      sub: [
        'Bun',
        'Deno',
        'Erlang',
        'Go (Golang)',
        'Gradle',
        'Java',
        'Node.js',
        'Perl',
        'PHP',
        'Python',
        'Ruby',
        'Rust'
      ]
    },
    {
      cate: 'dataBaseServer',
      sub: ['MariaDB', 'MongoDB', 'MySQL', 'PostgreSQL']
    },
    {
      cate: 'dataQueue',
      sub: ['etcd', 'Memcached', 'RabbitMQ', 'Redis']
    },
    {
      cate: 'emailServer',
      sub: ['Mailpit']
    },
    {
      cate: 'searchEngine',
      sub: ['Elasticsearch', 'Meilisearch']
    },
    {
      cate: 'objectStorage',
      sub: ['MinIO']
    }
  ])

  const cate = ref([])

  // 添加表单引用
  const formRef = ref<FormInstance>()

  // 定义表单验证规则
  const rules = ref<FormRules>({
    name: [
      { required: true, message: I18nT('base.name') + I18nT('podman.require'), trigger: 'blur' }
    ],
    paths: [
      {
        validator: (rule: any, value: Array<{ path: string }>, callback: any) => {
          const isEmptyPath = value.every((item) => !item.path.trim())
          if (isEmptyPath) {
            callback(new Error(I18nT('podman.ComposeFileRequire')))
            return
          }
          callback()
        },
        trigger: 'blur'
      }
    ]
  })

  const onCancel = () => {
    show.value = false
  }

  const addFile = () => {
    form.value.paths.push({
      id: uuid(),
      path: ''
    })
  }

  const delPath = (index: number) => {
    form.value.paths.splice(index, 1)
  }

  // 文件选择器（Electron/Node环境下可用）
  const selectFile = async (index: number) => {
    dialog
      .showOpenDialog({
        properties: ['openFile', 'showHiddenFiles'],
        filters: [{ name: 'YAML', extensions: ['yml', 'yaml'] }]
      })
      .then(({ canceled, filePaths }: any) => {
        if (canceled || filePaths.length === 0) {
          return
        }
        const [path] = filePaths
        form.value.paths[index].path = path
      })
  }

  const doSubmit = async () => {
    if (!form.value.name) {
      ElMessage.error(I18nT('base.name') + I18nT('podman.require'))
      return
    }

    try {
      // 验证表单
      await formRef.value?.validate()
    } catch {
      return
    }

    const paths = form.value.paths.map((p) => p.path).filter((p) => !!p.trim())
    if (!paths.length) {
      ElMessage.error(I18nT('podman.ComposeFileRequire'))
      return
    }

    if (!props?.item?.id) {
      const data = {
        ...form.value,
        paths
      }
      PodmanManager.addCompose(data)
    } else {
      const find = PodmanManager.compose.find((f) => f.id === form.value.id)
      if (find) {
        if (find.run) {
          find.stop()
        }
        find.name = form.value.name
        find.comment = form.value.comment
        find.flag = form.value.flag
        find.paths = paths
        PodmanManager.saveComposeList().catch()
      }
    }
    ElMessage.success(I18nT('base.success'))
    show.value = false
  }

  defineExpose({
    show,
    onClosed,
    onSubmit,
    closedFn
  })
</script>
