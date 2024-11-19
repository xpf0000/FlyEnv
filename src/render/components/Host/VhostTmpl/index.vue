<template>
  <el-popover
    :visible="visible"
    placement="right-start"
    width="auto"
    popper-class="el-dropdown__popper"
  >
    <template #reference>
      <div class="w-full" @mouseenter.stop="visible = true" @click.stop="visible = true">{{
        $t('host.vhostEdit')
      }}</div>
    </template>
    <template #default>
      <el-dropdown-menu v-click-outside="onClickOut">
        <el-dropdown-item @click.stop="edit('apache')">{{
          $t('host.vhostApacheEdit')
        }}</el-dropdown-item>
        <el-dropdown-item @click.stop="edit('apacheSSL')">{{
          $t('host.vhostApacheSSLEdit')
        }}</el-dropdown-item>
        <el-dropdown-item @click.stop="edit('nginx')">{{
          $t('host.vhostNginxEdit')
        }}</el-dropdown-item>
        <el-dropdown-item @click.stop="edit('nginxSSL')">{{
          $t('host.vhostNginxSSLEdit')
        }}</el-dropdown-item>
        <el-dropdown-item @click.stop="edit('caddy')">{{
          $t('host.vhostCaddyEdit')
        }}</el-dropdown-item>
        <el-dropdown-item @click.stop="edit('caddySSL')">{{
          $t('host.vhostCaddySSLEdit')
        }}</el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-popover>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { ClickOutside as vClickOutside } from 'element-plus'
  import { AsyncComponentShow } from '@/util/AsyncComponent'

  const visible = ref(false)

  const onClickOut = () => {
    visible.value = false
  }

  let EditVM: any
  import('./edit.vue').then((res) => {
    EditVM = res.default
  })

  const edit = (flag: 'apache' | 'apacheSSL' | 'nginx' | 'nginxSSL' | 'caddy' | 'caddySSL') => {
    visible.value = false
    console.log('edit: ', flag)

    AsyncComponentShow(EditVM, {
      flag
    }).then()
  }
</script>
