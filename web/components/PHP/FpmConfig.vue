<template>
  <el-drawer
    v-model="show"
    size="75%"
    :destroy-on-close="true"
    :with-header="false"
    @closed="closedFn"
  >
    <div class="host-vhost">
      <div class="nav">
        <div class="left" @click="show = false">
          <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
          <span class="ml-15 title">{{ item.version }} - {{ item.path }} - php-fpm.conf</span>
        </div>
      </div>

      <Conf ref="conf" :type-flag="'php'" :conf="content" :file-ext="'ini'" :show-commond="false">
      </Conf>
    </div>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { AsyncComponentSetup } from '@web/fn'
  import { SoftInstalled } from '@web/store/brew'
  import Conf from '@web/components/Conf/drawer.vue'

  defineProps<{
    item: SoftInstalled
  }>()

  const { show, onClosed, onSubmit, closedFn } = AsyncComponentSetup()

  const content = ref('')

  import('@web/config/php-fpm.conf.txt?raw').then((res) => {
    content.value = res.default
  })

  const conf = ref()

  defineExpose({
    show,
    onSubmit,
    onClosed
  })
</script>
