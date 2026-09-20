<template>
  <li :class="{ active: currentPath === '/mailpit-plugin' }" @click="nav">
    <div class="left">
      <div class="icon-block">
        <yb-icon
          :svg="import('@/svg/mailpit.svg?raw')"
          style="padding: 5px"
          width="28"
          height="28"
        />
      </div>
      <span class="title">Mailpit Plugin</span>
    </div>
  </li>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { useRoute, useRouter } from 'vue-router'

  const route = useRoute()
  const router = useRouter()
  const currentPath = computed(() => route.path)

  const nav = () => {
    router.push('/mailpit-plugin').catch(() => {})
  }
</script>
