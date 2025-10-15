<template>
  <el-dialog
    v-model="show"
    :title="I18nT('podman.Build') + ' Compose'"
    width="750px"
    :destroy-on-close="true"
    class="el-dialog-content-flex-1 h-[75%] dark:bg-[#1d2033]"
    :close-on-click-modal="false"
    @closed="closedFn"
  >
    <template #default>
      <div class="flex gap-2 h-full overflow-hidden">
        <el-card
          style="--el-card-padding: 0 0"
          shadow="never"
          class="w-[240px] flex-shrink-0 app-base-el-card"
        >
          <el-scrollbar class="px-[12px]">
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
          <template v-else>
            <el-card style="--el-card-padding: 0 0" shadow="never" class="flex-1 app-base-el-card">
              <el-scrollbar class="px-[12px]">
                <BaseVM />
                <el-collapse v-model="moduleRight">
                  <template v-for="(m, _m) in module" :key="_m">
                    <el-collapse-item :title="m" :name="m">
                      <template v-if="m === 'Apache HTTP Server'">
                        <ApacheVM />
                      </template>
                      <template v-else-if="m === 'PHP'">
                        <PHPVM />
                      </template>
                      <template v-else-if="m === 'MySQL'">
                        <MySQLVM />
                      </template>
                      <template v-else-if="m === 'MariaDB'">
                        <MariaDBVM />
                      </template>
                      <template v-else-if="m === 'Nginx'">
                        <Nginx />
                      </template>
                      <template v-else-if="m === 'Caddy'">
                        <Caddy />
                      </template>
                    </el-collapse-item>
                  </template>
                </el-collapse>
              </el-scrollbar>
            </el-card>
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
  import { ref, watch } from 'vue'
  import { I18nT } from '@lang/index'
  import { ElMessage } from 'element-plus'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { uuid } from '@/util/Index'
  import type { AllAppModuleType } from '@/core/type'
  import ApacheVM from './compose-build/Apache.vue'
  import BaseVM from './compose-build/Base.vue'
  import { ComposeBuildForm } from '@/components/Podman/compose-build/Form'
  import { MessageError } from '@/util/Element'
  import YAML from 'yamljs'
  import { fs, shell } from '@/util/NodeFn'
  import PHPVM from './compose-build/PHP.vue'
  import MySQLVM from './compose-build/MySQL.vue'
  import MariaDBVM from './compose-build/MariaDB.vue'
  import Nginx from './compose-build/Nginx.vue'
  import Caddy from './compose-build/Caddy.vue'

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

  const moduleRight = ref<string[]>([])

  watch(
    module,
    () => {
      moduleRight.value = [...module.value]
    },
    {
      deep: true
    }
  )

  const onCancel = () => {
    show.value = false
  }

  const doSubmit = async () => {
    const BuildForm: any = ComposeBuildForm
    const keys = ['base', ...moduleRight.value]
    for (const key of keys) {
      const item = BuildForm?.[key]
      const error = item?.check?.()
      if (error) {
        MessageError(error)
        return
      }
    }

    const services: any = {}
    for (const key of moduleRight.value) {
      const item = BuildForm?.[key]
      const obj = await item?.build?.()
      Object.assign(services, obj)
    }

    console.log('services: ', services)

    const compose = {
      services,
      networks: {
        'flyenv-network': {
          driver: 'bridge'
        }
      }
    }

    const content = YAML.stringify(compose, Infinity, 2)
    const base = ComposeBuildForm.base
    base.saveMirrors()
    await fs.writeFile(base.dir, content)
    ElMessage.success(I18nT('base.success'))
    shell.showItemInFolder(base.dir).catch()
    // show.value = false
  }

  defineExpose({
    show,
    onClosed,
    onSubmit,
    closedFn
  })
</script>
