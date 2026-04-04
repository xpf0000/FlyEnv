<template>
  <el-dialog
    v-model="show"
    :title="'Slim Tunnel' + ' ' + I18nT('base.add')"
    class="dark:bg-[#1d2033]"
    width="500px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    @closed="closedFn"
  >
    <el-form :model="form" label-position="top" class="pt-2" @submit.prevent>
      <el-form-item :label="I18nT('host.slimTunnel.port')" required>
        <el-input-number
          v-model="form.port"
          :min="1"
          :max="65535"
          :placeholder="I18nT('host.slimTunnel.portPlaceholder')"
          class="w-full"
          controls-position="right"
        />
      </el-form-item>

      <el-form-item :label="I18nT('host.slimTunnel.subdomain')">
        <div class="w-full flex items-center">
          <el-input
            v-model="form.subdomain"
            :placeholder="I18nT('host.slimTunnel.subdomainPlaceholder')"
            class="flex-1"
          />
          <span class="px-2 flex-shrink-0 text-gray-400 text-sm">.slim.show</span>
        </div>
      </el-form-item>

      <el-form-item :label="I18nT('host.slimTunnel.password')">
        <el-input v-model="form.password" show-password />
      </el-form-item>

      <el-form-item :label="I18nT('host.slimTunnel.ttl')">
        <el-input v-model="form.ttl" placeholder="30m" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button :disabled="loading" @click.stop="show = false">
        {{ I18nT('base.cancel') }}
      </el-button>
      <el-button :loading="loading" :disabled="!saveEnable" type="primary" @click.stop="doSubmit">
        {{ I18nT('base.confirm') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import { SlimTunnel } from '@/core/SlimTunnel/SlimTunnel'
  import SlimTunnelStore from '@/core/SlimTunnel/SlimTunnelStore'
  import { reactiveBind, uuid } from '@/util/Index'

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()
  const loading = ref(false)

  const form = ref({
    port: 3000,
    subdomain: '',
    password: '',
    ttl: ''
  })

  const saveEnable = computed(() => form.value.port > 0)

  const doSubmit = () => {
    if (loading.value) return
    loading.value = true
    const item = reactiveBind(new SlimTunnel({ ...form.value, id: uuid() }))
    SlimTunnelStore.items.unshift(item)
    SlimTunnelStore.save()
    loading.value = false
    show.value = false
  }

  defineExpose({ show, onClosed, onSubmit, closedFn })
</script>
