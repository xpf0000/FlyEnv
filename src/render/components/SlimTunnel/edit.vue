<template>
  <el-dialog
    v-model="show"
    :title="'Slim Tunnel' + ' ' + I18nT('base.edit')"
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
          class="w-full"
          controls-position="right"
        />
      </el-form-item>

      <el-form-item :label="I18nT('host.slimTunnel.subdomain')">
        <div class="w-full flex items-center">
          <el-input v-model="form.subdomain" class="flex-1" />
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
      <el-button @click.stop="show = false">{{ I18nT('base.cancel') }}</el-button>
      <el-button type="primary" @click.stop="doSave">{{ I18nT('base.confirm') }}</el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { I18nT } from '@lang/index'
  import { AsyncComponentSetup } from '@/util/AsyncComponent'
  import SlimTunnelStore from '@/core/SlimTunnel/SlimTunnelStore'
  import type { SlimTunnel } from '@/core/SlimTunnel/SlimTunnel'

  const props = defineProps<{ item: SlimTunnel }>()
  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()
  const form = ref({ ...props.item })

  const doSave = () => {
    const find = SlimTunnelStore.items.find((i) => i.id === props.item.id)
    if (find) {
      Object.assign(find, form.value)
      SlimTunnelStore.save()
    }
    show.value = false
  }

  defineExpose({ show, onClosed, onSubmit, closedFn })
</script>
