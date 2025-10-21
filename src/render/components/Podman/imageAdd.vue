<template>
  <el-dialog
    v-model="visible"
    :title="I18nT('podman.Image') + I18nT('base.add')"
    width="600px"
    class="host-edit new-project"
    :class="{ installing: loading }"
    @closed="closedFn"
  >
    <el-form :model="form" label-width="110px" label-position="top" class="pt-2">
      <el-form-item :label="I18nT('podman.PresetModule')">
        <el-cascader
          v-model="form.name"
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
        <el-button type="primary" @click="onSubmit">{{ I18nT('base.confirm') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { ElMessage } from 'element-plus'
  import { PodmanManager } from '@/components/Podman/class/Podman'
  import { OfficialImages } from '@/components/Podman/officialImages'
  import { AllAppModule } from '@/core/type'
  import Base from './compose-build/Form/Base'

  const visible = ref(true)
  const mode = ref<'preset' | 'custom'>('preset')
  const form = ref({
    name: '',
    mirror: ''
  })

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
          const versions =
            PodmanManager.imageVersion?.[image]?.map?.((i: string) => {
              return {
                label: i,
                value: `${image}:${i}`
              }
            }) ?? []
          return {
            label: c,
            children: [
              {
                label: 'latest',
                value: `${image}:latest`
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

  const closedFn = () => {
    visible.value = false
  }

  const onCancel = () => {
    visible.value = false
  }

  const onSubmit = async () => {
    if (!form.value.name) {
      ElMessage.error(I18nT('podman.Image') + I18nT('podman.require'))
      return
    }
    try {
      await PodmanManager.pullImage(form.value.name, form.value.tag)
      ElMessage.success(I18nT('base.success'))
      visible.value = false
      PodmanManager.refresh()
    } catch (e: any) {
      ElMessage.error(e?.message ?? I18nT('base.fail'))
    }
  }
</script>
