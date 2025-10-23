<template>
  <el-dialog
    v-model="show"
    :title="I18nT('podman.Image') + I18nT('base.add')"
    width="600px"
    class="host-edit new-project"
    @closed="closedFn"
  >
    <el-form :model="form" label-width="110px" label-position="top" class="pt-2">
      <el-form-item :label="I18nT('podman.PresetModule')">
        <el-cascader
          v-model="form.version"
          filterable
          class="w-full"
          :show-all-levels="false"
          :options="presets"
        />
      </el-form-item>
      <el-form-item :label="I18nT('podman.DockerImageMirror')" prop="flag">
        <el-autocomplete v-model="form.mirror" :fetch-suggestions="querySearch" clearable />
      </el-form-item>
      <el-form-item :label="I18nT('podman.Image')" prop="name" required>
        <el-input v-model="form.name" :placeholder="I18nT('podman.NamePlaceholder')" />
      </el-form-item>
    </el-form>
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="onCancel">{{ I18nT('base.cancel') }}</el-button>
        <el-button type="primary" @click="doSubmit">{{ I18nT('base.confirm') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import { I18nT } from '@lang/index'
  import { ElMessage } from 'element-plus'
  import { PodmanManager } from '@/components/Podman/class/Podman'
  import { OfficialImages } from '@/components/Podman/officialImages'
  import { AllAppModule } from '@/core/type'
  import Base from '../compose-build/Form/Base'
  import { XTermExec, XTermExecCache } from '@/util/XTermExec'
  import { reactiveBind, uuid } from '@/util/Index'
  import { AsyncComponentSetup, AsyncComponentShow } from '@/util/AsyncComponent'
  import { Image } from '@/components/Podman/class/Image'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const form = ref({
    version: [],
    name: '',
    mirror: ''
  })

  watch(
    () => form.value.version,
    (val: string[]) => {
      const v = [...val].pop() ?? ''
      form.value.name = v
    }
  )

  const presets = computed(() => {
    const arrs: Array<{
      label: string
      children: AllAppModule[]
    }> = [
      {
        label: I18nT(`aside.webServer`),
        children: ['apache', 'caddy', 'consul', 'nginx', 'tomcat']
      },
      {
        label: I18nT(`aside.language`),
        children: [
          'bun',
          'deno',
          'erlang',
          'golang',
          'java',
          'node',
          'php',
          'python',
          'ruby',
          'rust'
        ]
      },
      {
        label: I18nT(`aside.dataBaseServer`),
        children: ['mariadb', 'mongodb', 'mysql', 'postgresql']
      },
      {
        label: I18nT(`aside.dataQueue`),
        children: ['etcd', 'memcached', 'rabbitmq', 'redis']
      },
      {
        label: I18nT(`aside.emailServer`),
        children: ['mailpit']
      },
      {
        label: I18nT(`aside.searchEngine`),
        children: ['elasticsearch', 'meilisearch']
      }
    ]
    console.log('PodmanManager.imageVersion: ', PodmanManager.imageVersion)
    return arrs.map((item) => {
      return {
        label: item.label,
        children: item.children.map((c) => {
          const image = OfficialImages?.[c]?.image ?? ''
          console.log('image: ', image, c, PodmanManager.imageVersion?.[image])
          let append = ''
          if (image === 'php') {
            append = '-fpm'
          }
          const versions =
            PodmanManager.imageVersion?.[image]?.map?.((i: string) => {
              return {
                label: i,
                value: `${image}:${i}${append}`
              }
            }) ?? []
          return {
            label: c,
            children: [
              {
                label: 'latest',
                value: `${image}:latest${append}`
              },
              ...versions
            ]
          }
        })
      }
    })
  })

  const mirrorsHistory = computed(() => {
    const list = Base.mirrors ?? []
    return list.map((l: string) => ({ value: l }))
  })

  const querySearch = (queryString: string, cb: any) => {
    const search = queryString.toLowerCase()
    const results = queryString
      ? mirrorsHistory.value.filter((f) => {
          const value = f.value.toLowerCase()
          return value.includes(search) || search.includes(value)
        })
      : mirrorsHistory.value
    cb(results)
  }

  const onCancel = () => {
    show.value = false
  }

  const machine = computed(() => {
    return PodmanManager.machine.find((m) => m.name === PodmanManager.tab)
  })

  const doSubmit = async () => {
    if (!form.value.name) {
      ElMessage.error(I18nT('podman.Image') + I18nT('podman.require'))
      return
    }
    show.value = false
    const id = uuid()
    const name = `${form.value.mirror}/${form.value.name}`
    machine.value?.images.unshift(
      reactiveBind(
        new Image({
          id,
          name,
          pulling: true
        })
      )
    )
    const command = `podman pull ${name}`
    const xtermExec = reactiveBind(new XTermExec())
    xtermExec.cammand = [command]
    xtermExec.wait().then(() => {
      delete XTermExecCache?.[id]
      const index = machine.value?.images?.findIndex?.((i) => i.id === id) ?? -1
      if (index >= 0) {
        machine.value?.images.splice(index, 1)
      }
      machine.value?.fetchImages?.()
    })
    xtermExec.whenCancel().then(() => {
      const index = machine.value?.images?.findIndex?.((i) => i.id === id) ?? -1
      if (index >= 0) {
        machine.value?.images.splice(index, 1)
      }
    })
    xtermExec.title = command
    XTermExecCache[id] = xtermExec
    import('@/components/XTermExecDialog/index.vue').then((res) => {
      AsyncComponentShow(res.default, {
        title: command,
        item: xtermExec
      }).then()
    })
  }

  defineExpose({
    show,
    onClosed,
    onSubmit,
    closedFn
  })
</script>
