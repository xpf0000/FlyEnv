<template>
  <el-dialog
    v-model="show"
    :title="'Cloudflare Tunnel' + ' ' + I18nT('base.edit')"
    class="el-dialog-content-flex-1 dark:bg-[#1d2033]"
    width="600px"
    @closed="closedFn"
  >
    <el-scrollbar class="px-2">
      <el-form ref="formRef" :model="form" label-position="top" class="pt-2" @submit.prevent>
        <el-form-item prop="apiToken" label="Cloudflare ApiToken" required :show-message="false">
          <el-input v-model="form.apiToken" readonly disabled> </el-input>
        </el-form-item>

        <el-form-item label="Cloudflared" required :error="cloudflaredError">
          <el-select v-model="form.cloudflaredBin" filterable>
            <template v-for="(item, _index) in cloudflared" :key="_index">
              <el-option :label="item.bin" :value="item.bin"></el-option>
            </template>
          </el-select>
        </el-form-item>
      </el-form>
    </el-scrollbar>
    <template #footer>
      <div class="dialog-footer">
        <el-button @click.stop="onCancel">{{ I18nT('base.cancel') }}</el-button>
        <el-button :disabled="!saveEnable" type="primary" @click.stop="doSubmit">{{
          I18nT('base.confirm')
        }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { CloudflareTunnel } from '@/core/CloudflareTunnel/CloudflareTunnel'
  import CloudflareTunnelStore from '@/core/CloudflareTunnel/CloudflareTunnelStore'
  import { BrewStore } from '@/store/brew'

  const props = defineProps<{
    item: CloudflareTunnel
  }>()

  const brewStore = BrewStore()

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const formRef = ref()

  const form = ref<Record<string, string>>({
    apiToken: '',
    cloudflaredBin: ''
  })

  const edit: any = props.item
  for (const key in form.value) {
    form.value[key] = edit?.[key] ?? ''
  }

  const cloudflared = computed(() => {
    return brewStore.module('cloudflared').installed
  })

  const cloudflaredError = computed(() => {
    if (cloudflared.value.length === 0) {
      return I18nT('host.CloudflareTunnel.CloudflaredNoFoundTips')
    }

    return ''
  })

  if (cloudflared.value.length) {
    form.value.cloudflaredBin = cloudflared.value[0].bin
  }

  const saveEnable = computed(() => {
    return !!form.value.cloudflaredBin
  })

  const onCancel = () => {
    show.value = false
  }

  const doSubmit = async () => {
    const find = CloudflareTunnelStore.items.find((i) => i.id === props.item.id)
    if (find) {
      Object.assign(find, form.value)
      CloudflareTunnelStore.save()
    }
    onCancel()
  }

  defineExpose({
    show,
    onClosed,
    onSubmit,
    closedFn
  })
</script>
