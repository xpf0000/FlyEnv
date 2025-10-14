<template>
  <el-form :model="form" label-position="top">
    <el-form-item label="MariaDB 版本" prop="version">
      <el-select v-model="form.version" filterable placeholder="请选择版本">
        <el-option label="latest" value="latest" />
        <template v-for="(v, _v) in versions" :key="_v">
          <el-option :label="v" :value="v" />
        </template>
      </el-select>
    </el-form-item>

    <el-form-item label="端口映射">
      <div class="w-full flex flex-col gap-3">
        <template v-for="(p, _p) in form.ports" :key="_p">
          <div class="w-full flex items-center justify-between">
            <el-input v-model="p.in" placeholder="容器端口" class="flex-1">
              <template #prefix>
                <span>容器端口</span>
              </template>
            </el-input>
            <span class="mx-3 flex-shrink-0">→</span>
            <el-input v-model="p.out" placeholder="本地端口" class="flex-1">
              <template #prefix>
                <span>本地端口</span>
              </template>
            </el-input>
          </div>
        </template>
      </div>
    </el-form-item>

    <el-form-item :label="I18nT('podman.Persistence')" prop="persistence">
      <el-switch v-model="form.persistence"></el-switch>
    </el-form-item>

    <el-form-item :label="I18nT('podman.MYSQL_ROOT_PASSWORD')">
      <el-input
        v-model="form.environment.MYSQL_ROOT_PASSWORD"
        placeholder="MYSQL_ROOT_PASSWORD"
      ></el-input>
    </el-form-item>

    <el-form-item :label="I18nT('podman.MYSQL_DATABASE')">
      <el-input v-model="form.environment.MYSQL_DATABASE" placeholder="MYSQL_DATABASE"></el-input>
    </el-form-item>

    <el-form-item :label="I18nT('podman.MYSQL_USER')">
      <el-input v-model="form.environment.MYSQL_USER" placeholder="MYSQL_USER"></el-input>
    </el-form-item>

    <el-form-item :label="I18nT('podman.MYSQL_PASSWORD')">
      <el-input v-model="form.environment.MYSQL_PASSWORD" placeholder="MYSQL_PASSWORD"></el-input>
    </el-form-item>

    <el-form-item>
      <el-button type="primary" @click="generateCompose">Docker Compose 预览</el-button>
    </el-form-item>

    <el-dialog
      v-model="dialogVisible"
      class="el-dialog-content-flex-1 h-[75vh]"
      title="Docker Compose 配置"
      width="750px"
    >
      <el-scrollbar class="h-full overflow-hidden">
        <pre>{{ composeYaml }}</pre>
      </el-scrollbar>
      <template #footer>
        <el-button @click="dialogVisible = false">关闭</el-button>
        <el-button type="primary" @click="copyToClipboard">复制到剪贴板</el-button>
      </template>
    </el-dialog>
  </el-form>
</template>

<script lang="ts" setup>
  import { computed, ref, onMounted, onUnmounted } from 'vue'
  import { ElMessage } from 'element-plus'
  import YAML from 'yamljs'
  import { ComposeBuildForm } from '@/components/Podman/compose-build/Form'
  import { I18nT } from '@lang/index'
  import { PodmanManager } from '../class/Podman'
  import { OfficialImages } from '@/components/Podman/officialImages'

  const image = OfficialImages.mariadb?.image ?? ''

  const versions = computed(() => {
    return PodmanManager.imageVersion?.[image] ?? []
  })

  const form = computed(() => {
    return ComposeBuildForm.MariaDB
  })

  // 对话框控制
  const dialogVisible = ref(false)
  const composeYaml = ref('')

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
      ElMessage.success('已复制到剪贴板！')
    } catch (err) {
      ElMessage.error('复制失败')
      console.error('复制失败:', err)
    }
  }

  onMounted(() => {
    form.value.enable = true
  })

  onUnmounted(() => {
    form.value.enable = false
  })
</script>

<style scoped>
  pre {
    background: #f5f7fa;
    padding: 16px;
    border-radius: 4px;
    overflow: auto;
  }
</style>
