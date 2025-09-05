<template>
  <el-dialog
    v-model="visible"
    :title="I18nT('podman.Image') + I18nT('base.add')"
    width="600px"
    class="host-edit new-project"
    :class="{ installing: loading }"
    @closed="closedFn"
  >
    <el-radio-group v-model="mode" class="mb-3">
      <el-radio label="preset">预设模块</el-radio>
      <el-radio label="custom">自定义输入</el-radio>
    </el-radio-group>
    <div v-if="mode === 'preset'" class="mb-3">
      <el-select
        v-model="preset"
        placeholder="选择预设模块"
        style="width: 100%"
        @change="onPresetChange"
      >
        <el-option v-for="item in presets" :key="item.name" :label="item.label" :value="item" />
      </el-select>
    </div>
    <el-form :model="form" label-width="110px" class="pt-2">
      <el-form-item :label="I18nT('podman.Image')" prop="name" required>
        <el-input v-model="form.name" :disabled="mode === 'preset'" placeholder="e.g. nginx" />
      </el-form-item>
      <el-form-item :label="I18nT('podman.Tag')" prop="tag">
        <el-input v-model="form.tag" placeholder="latest 或版本号，如 8.2, 5.7, 16-alpine" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="onSubmit">{{ I18nT('base.confirm') }}</el-button>
        <el-button @click="onCancel">{{ I18nT('base.cancel') }}</el-button>
      </el-form-item>
    </el-form>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { ElMessage } from 'element-plus'
  import { PodmanManager } from '@/components/Podman/class/Podman'

  const visible = ref(true)
  const mode = ref<'preset' | 'custom'>('preset')
  const form = ref({
    name: '',
    tag: 'latest'
  })

  const presets = [
    { label: 'Nginx', name: 'nginx', tag: 'latest' },
    { label: 'Apache', name: 'httpd', tag: 'latest' },
    { label: 'Caddy', name: 'caddy', tag: 'latest' },
    { label: 'Tomcat', name: 'tomcat', tag: 'latest' },
    { label: 'Consul', name: 'consul', tag: 'latest' },
    { label: 'MySQL', name: 'mysql', tag: 'latest' },
    { label: 'MariaDB', name: 'mariadb', tag: 'latest' },
    { label: 'PostgreSQL', name: 'postgres', tag: 'latest' },
    { label: 'MongoDB', name: 'mongo', tag: 'latest' },
    { label: 'Mailpit', name: 'axllent/mailpit', tag: 'latest' },
    { label: 'PHP', name: 'php', tag: 'latest' },
    { label: 'NodeJS', name: 'node', tag: 'latest' },
    { label: 'Python', name: 'python', tag: 'latest' },
    { label: 'Go', name: 'golang', tag: 'latest' },
    { label: 'Erlang', name: 'erlang', tag: 'latest' },
    { label: 'Ruby', name: 'ruby', tag: 'latest' },
    { label: 'Rust', name: 'rust', tag: 'latest' },
    { label: 'Bun', name: 'oven/bun', tag: 'latest' },
    { label: 'Deno', name: 'denoland/deno', tag: 'latest' },
    { label: 'Gradle', name: 'gradle', tag: 'latest' },
    { label: 'Redis', name: 'redis', tag: 'latest' },
    { label: 'Memcached', name: 'memcached', tag: 'latest' },
    { label: 'RabbitMQ', name: 'rabbitmq', tag: 'latest' },
    { label: 'etcd', name: 'quay.io/coreos/etcd', tag: 'latest' },
    { label: 'Elasticsearch', name: 'elasticsearch', tag: 'latest' },
    { label: 'Meilisearch', name: 'getmeili/meilisearch', tag: 'latest' },
    { label: 'Typesense', name: 'typesense/typesense', tag: 'latest' },
    { label: 'Minio', name: 'minio/minio', tag: 'latest' }
  ]

  const preset = ref()

  const onPresetChange = (item: any) => {
    form.value.name = item.name
    form.value.tag = item.tag
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
