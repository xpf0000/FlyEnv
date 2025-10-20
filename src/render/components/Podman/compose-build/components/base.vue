<template>
  <el-form-item :label="I18nT('base.version')" prop="version">
    <el-select v-model="form.version" filterable>
      <el-option label="latest" value="latest" />
      <template v-for="(v, _v) in versions" :key="_v">
        <el-option :label="v" :value="v" />
      </template>
    </el-select>
  </el-form-item>
  <el-form-item :label="I18nT('podman.PortBind')">
    <div class="w-full flex flex-col gap-3">
      <template v-for="(p, _p) in form.ports" :key="_p">
        <div class="w-full flex items-center justify-between">
          <el-input
            v-model="p.in"
            readonly
            disabled
            :placeholder="I18nT('podman.ContainerPort')"
            class="flex-1"
          >
            <template #prefix>
              <span>{{ I18nT('podman.ContainerPort') }}</span>
            </template>
          </el-input>
          <span class="mx-3 flex-shrink-0">→</span>
          <el-input v-model="p.out" :placeholder="I18nT('podman.LocalPort')" class="flex-1">
            <template #prefix>
              <span>{{ I18nT('podman.LocalPort') }}</span>
            </template>
          </el-input>
        </div>
      </template>
    </div>
  </el-form-item>
</template>

<script lang="ts" setup>
  import { computed, onMounted, onUnmounted } from 'vue'
  import { ComposeBuildForm } from '@/components/Podman/compose-build/Form'
  import { I18nT } from '@lang/index'
  import { PodmanManager } from '../../class/Podman'

  const props = defineProps<{
    image: string
    formName: any
  }>()

  const versions = computed(() => {
    return PodmanManager.imageVersion?.[props.image] ?? []
  })

  const form = computed(() => {
    return ComposeBuildForm[props.formName]
  })

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
