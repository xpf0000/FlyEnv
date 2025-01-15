<template>
  <el-dialog
    v-model="show"
    :title="item?.id ? I18nT('base.edit') : I18nT('base.add')"
    width="600px"
    :destroy-on-close="true"
    class="host-edit new-project"
    @closed="closedFn"
  >
    <template #default>
      <div class="main-wapper">
        <div class="main">
          <template v-if="typeFlag === 'composer'">
            <div class="park">
              <div class="title">
                <span>{{ I18nT('base.phpVersion') }}</span>
              </div>
              <el-select v-model="php" class="w-32" filterable :disabled="running">
                <el-option :value="undefined" :label="I18nT('service.useSysPHP')"></el-option>
                <template v-for="(v, _k) in phpVersions" :key="_k">
                  <el-option :value="v.bin" :label="`${v.version}-${v.bin}`"></el-option>
                </template>
              </el-select>
            </div>
          </template>
          <div class="path-choose mt-20 mb-20">
            <input
              v-model.trim="form.name"
              type="text"
              class="input"
              :readonly="running"
              :class="{ error: errs?.name }"
              :placeholder="I18nT('service.alias')"
            />
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="dialog-footer">
        <el-button :disabled="running" @click="show = false">{{ I18nT('base.cancel') }}</el-button>
        <el-button :loading="running" :disabled="running" type="primary" @click="doSave">{{
          I18nT('base.confirm')
        }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>
<script lang="ts" setup>
  import { computed, ref, watch } from 'vue'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { I18nT } from '@shared/lang'
  import { AppStore } from '@/store/app'
  import { BrewStore } from '@/store/brew'
  import type { AppServiceAliasItem, SoftInstalled } from '@shared/app.d.ts'
  import { AllAppModule } from '@/core/type'
  import { ServiceActionStore } from '@/components/ServiceManager/EXT/store'
  import { join } from 'path'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const props = defineProps<{
    service: SoftInstalled
    item: AppServiceAliasItem
    typeFlag: AllAppModule
  }>()

  const appStore = AppStore()
  const brewStore = BrewStore()
  const running = ref(false)
  const form = ref<AppServiceAliasItem>({
    name: '',
    id: ''
  })

  Object.assign(form.value, props.item)

  const phpVersions = computed(() => {
    return brewStore.module('php').installed.map((i) => {
      return {
        bin: i?.phpBin ?? join(i.path, 'bin/php'),
        version: i.version
      }
    })
  })

  const php = computed({
    get() {
      return form.value?.php?.bin
    },
    set(v: string | undefined) {
      if (!v) {
        delete form.value.php
        return
      }
      const find = phpVersions.value.find((p) => p.bin === v)!
      form.value.php = {
        bin: v,
        version: find.version as string
      }
    }
  })

  const errs = ref({
    name: false
  })

  const alias = computed(() => {
    return appStore.config.setup?.alias?.[props.service.bin] ?? []
  })

  watch(
    form,
    () => {
      let k: keyof typeof errs.value
      for (k in errs.value) {
        errs.value[k] = false
      }
    },
    {
      immediate: true,
      deep: true
    }
  )

  watch(
    () => form.value.name,
    () => {
      checkItem()
    }
  )

  const checkItem = () => {
    errs.value.name = form.value.name.length === 0
    const find = alias.value.find((a) => a.name === form.value.name && a.id !== form.value.id)
    if (find) {
      errs.value.name = true
    }

    let k: keyof typeof errs.value
    for (k in errs.value) {
      if (errs.value[k]) {
        return false
      }
    }
    return true
  }

  const doSave = () => {
    if (!checkItem() || running?.value) {
      return
    }
    running.value = true
    ServiceActionStore.setAlias(props.service, form.value, props.item)
      .then(() => {
        show.value = false
      })
      .catch()
      .finally(() => {
        running.value = false
      })
  }

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
