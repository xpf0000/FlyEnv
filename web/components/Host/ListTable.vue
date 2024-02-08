<template>
  <div class="host-list">
    <el-table :data="hosts" row-key="id" default-expand-all>
      <el-table-column :label="$t('host.name')">
        <template #header>
          <div class="w-p100 name-cell">
            <span>{{ $t('host.name') }}</span>
            <el-input v-model.trim="search" placeholder="search" clearable></el-input>
          </div>
        </template>
        <template #default="scope">
          <QrcodePopper :url="scope.row.name">
            <div class="link" @click.stop="openSite(scope.row)">
              <yb-icon :svg="import('@/svg/link.svg?raw')" width="18" height="18" />
              <span>
                {{ scope.row.name }}
              </span>
            </div>
          </QrcodePopper>
        </template>
      </el-table-column>
      <el-table-column align="center" width="120px" :label="$t('host.phpVersion')">
        <template #default="scope">
          <span>
            {{ versionText(scope.row.phpVersion) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column :label="$t('host.mark')">
        <template #default="scope">
          <el-tooltip :content="scope.row.mark" :show-after="800">
            <span style="display: inline-block; max-width: 100%">
              {{ scope.row.mark }}
            </span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column align="center" :label="$t('host.setup')" width="100px">
        <template #default="scope">
          <el-popover
            effect="dark"
            popper-class="host-list-poper"
            placement="bottom-end"
            width="auto"
            :show-arrow="false"
          >
            <ul class="host-list-menu">
              <li @click.stop="action(scope.row, scope.$index, 'open')">
                <yb-icon :svg="import('@/svg/folder.svg?raw')" width="13" height="13" />
                <span class="ml-15">{{ $t('base.open') }}</span>
              </li>
              <li @click.stop="action(scope.row, scope.$index, 'edit')">
                <yb-icon :svg="import('@/svg/edit.svg?raw')" width="13" height="13" />
                <span class="ml-15">{{ $t('base.edit') }}</span>
              </li>
              <li @click.stop="action(scope.row, scope.$index, 'link')">
                <yb-icon :svg="import('@/svg/link.svg?raw')" width="13" height="13" />
                <span class="ml-15">{{ $t('base.link') }}</span>
              </li>
              <li>
                <yb-icon :svg="import('@/svg/config.svg?raw')" width="13" height="13" />
                <el-dropdown @command="showConfig">
                  <span class="ml-15"> {{ $t('base.configFile') }} </span>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item :command="{ flag: 'nginx', item: scope.row }"
                        >Nginx</el-dropdown-item
                      >
                      <el-dropdown-item :command="{ flag: 'apache', item: scope.row }"
                        >Apache</el-dropdown-item
                      >
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </li>
              <li @click.stop="action(scope.row, scope.$index, 'log')">
                <yb-icon :svg="import('@/svg/log.svg?raw')" width="13" height="13" />
                <span class="ml-15">{{ $t('base.log') }}</span>
              </li>
              <li @click.stop="action(scope.row, scope.$index, 'del')">
                <yb-icon :svg="import('@/svg/trash.svg?raw')" width="13" height="13" />
                <span class="ml-15">{{ $t('base.del') }}</span>
              </li>
            </ul>

            <template #reference>
              <div class="right">
                <yb-icon :svg="import('@/svg/more1.svg?raw')" width="22" height="22" />
              </div>
            </template>
          </el-popover>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script lang="ts" setup>
  import { ref, computed } from 'vue'
  import { AppStore } from '../../store/app'
  import QrcodePopper from './Qrcode/Index.vue'
  import { I18nT } from '@shared/lang'
  import { AsyncComponentShow } from '../../fn'
  import { ElMessageBox } from 'element-plus'

  const appStore = AppStore()
  const task_index = ref(0)
  const search = ref('')

  const hosts = computed(() => {
    let hosts: Array<any> = JSON.parse(JSON.stringify(appStore.hosts))
    if (search.value) {
      hosts = hosts.filter((h) => {
        const name = h?.name ?? ''
        const mark = h?.mark ?? ''
        return name.includes(search.value) || `${mark}`.includes(search.value)
      })
    }
    const arr: Array<any> = []
    const findChild = (item: any) => {
      const sub = hosts.filter((h) => {
        let name: any = h.name.split('.')
        let has = false
        while (!has && name.length > 0) {
          name.shift()
          const str = name.join('.').trim()
          has = item.name.trim() === str
        }
        return has
      })
      sub.forEach((s) => {
        s.pid = item.id
      })
      item.children = sub
    }
    hosts.forEach((h) => {
      findChild(h)
    })
    hosts.forEach((h) => {
      if (!h.pid) {
        arr.push(h)
      }
    })
    return arr
  })

  const versionText = (v?: number) => {
    if (typeof v === 'number') {
      return `${(v / 10.0).toFixed(1)}`
    }
    return ''
  }

  const openSite = () => {}

  let EditVM: any
  import('./Edit.vue').then((res) => {
    EditVM = res.default
  })
  let LogVM: any
  import('./Logs.vue').then((res) => {
    LogVM = res.default
  })
  let ConfigVM: any
  import('./Vhost.vue').then((res) => {
    ConfigVM = res.default
  })
  let LinkVM: any
  import('./Link.vue').then((res) => {
    LinkVM = res.default
  })

  const action = (item: any, index: number, flag: string) => {
    console.log('item: ', item)
    item = appStore.hosts.find((h) => h.id === item.id)
    task_index.value = index
    switch (flag) {
      case 'open':
        break
      case 'edit':
        AsyncComponentShow(EditVM, {
          edit: item,
          isEdit: true
        }).then()
        break
      case 'log':
        AsyncComponentShow(LogVM, {
          name: item.name
        }).then()
        break
      case 'del':
        ElMessageBox.confirm(I18nT('base.delAlertContent'), undefined, {
          confirmButtonText: I18nT('base.confirm'),
          cancelButtonText: I18nT('base.cancel'),
          closeOnClickModal: false,
          customClass: 'confirm-del',
          type: 'warning'
        }).then(() => {
          appStore.hosts.splice(index, 1)
        })
        break
      case 'link':
        console.log('item: ', item)
        AsyncComponentShow(LinkVM, {
          host: item
        }).then()
        break
    }
  }

  const showConfig = (item: any) => {
    AsyncComponentShow(ConfigVM, {
      item
    }).then()
  }
</script>
