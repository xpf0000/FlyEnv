<template>
  <el-card class="version-manager">
    <template #header>
      <div class="card-header">
        <div class="left">
          <span> {{ title }} </span>
          <el-button
            class="custom-folder-add-btn opacity-0 cursor-auto"
            :icon="FolderAdd"
            link
          ></el-button>
        </div>
        <el-button class="button opacity-0 cursor-auto" link>
          <yb-icon :svg="import('@/svg/icon_refresh.svg?raw')" class="refresh-icon"></yb-icon>
        </el-button>
      </div>
    </template>
    <el-table class="service-table" :data="moduleExecItems">
      <el-table-column prop="name" width="140px">
        <template #header>
          <span style="padding: 2px 12px 2px 24px; display: block">{{
            I18nT('setup.module.name')
          }}</span>
        </template>
        <template #default="scope">
          <span style="padding: 2px 12px 2px 24px; display: block">{{ scope.row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('setup.module.comment')" prop="comment"> </el-table-column>
      <el-table-column :label="I18nT('base.service')" :prop="null" width="100px">
        <template #default="scope">
          <template v-if="scope.row.running">
            <el-button :loading="true" link></el-button>
          </template>
          <template v-else>
            <template v-if="scope.row.run">
              <el-button link class="status running">
                <yb-icon
                  :svg="import('@/svg/stop2.svg?raw')"
                  @click.stop="serviceDo('stop', scope.row)"
                />
              </el-button>
              <el-button link class="status refresh">
                <yb-icon
                  :svg="import('@/svg/icon_refresh.svg?raw')"
                  @click.stop="serviceDo('start', scope.row)"
                />
              </el-button>
            </template>
            <template v-else>
              <el-button link class="status start">
                <yb-icon
                  :svg="import('@/svg/play.svg?raw')"
                  @click.stop="serviceDo('start', scope.row)"
                />
              </el-button>
            </template>
          </template>
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('base.action')" :prop="null" width="100px" align="center">
        <template #default="scope">
          <el-popover
            ref="popper"
            effect="dark"
            popper-class="host-list-poper"
            placement="left-start"
            :show-arrow="false"
            width="auto"
            @before-enter="onBeforEnter"
            @show="onShow"
          >
            <ul v-poper-fix class="host-list-menu">
              <li @click.stop="action(scope.row, scope.$index, 'edit')">
                <yb-icon :svg="import('@/svg/edit.svg?raw')" width="13" height="13" />
                <span class="ml-15">{{ I18nT('base.edit') }}</span>
              </li>
              <template v-for="(c, _i) in scope.row.configPath" :key="_i">
                <li @click.stop="action(c, _i, 'conf')">
                  <yb-icon :svg="import('@/svg/config.svg?raw')" width="13" height="13" />
                  <span class="ml-15"> {{ c.name }} </span>
                </li>
              </template>
              <template v-for="(c, _i) in scope.row.logPath" :key="_i">
                <li @click.stop="action(c, _i, 'log')">
                  <yb-icon :svg="import('@/svg/log.svg?raw')" width="13" height="13" />
                  <span class="ml-15"> {{ c.name }} </span>
                </li>
              </template>
              <li @click.stop="action(scope.row, scope.$index, 'del')">
                <yb-icon :svg="import('@/svg/trash.svg?raw')" width="13" height="13" />
                <span class="ml-15">{{ I18nT('base.del') }}</span>
              </li>
            </ul>
            <template #reference>
              <el-button link class="status">
                <yb-icon :svg="import('@/svg/more1.svg?raw')" width="22" height="22" />
              </el-button>
            </template>
          </el-popover>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script lang="ts" setup>
  import { computed, reactive } from 'vue'
  import { I18nT } from '@lang/index'
  import { AsyncComponentShow } from '@/util/AsyncComponent'
  import { AppCustomerModule } from '@/core/Module'
  import { ModuleCustomerExecItem } from '@/core/ModuleCustomer'
  import { FolderAdd } from '@element-plus/icons-vue'

  const title = computed(() => {
    return AppCustomerModule.currentModule?.label ?? ''
  })

  const moduleExecItems = computed(() => {
    return AppCustomerModule.currentModule?.item ?? []
  })

  let EditVM: any
  import('@/components/Setup/Module/module/moduleExecItemAdd.vue').then((res) => {
    EditVM = res.default
  })

  let ConfVM: any
  import('./ConfigPoper.vue').then((res) => {
    ConfVM = res.default
  })

  let LogVM: any
  import('./LogsPoper.vue').then((res) => {
    LogVM = res.default
  })

  const action = (item: any, index: number, flag: string) => {
    switch (flag) {
      case 'conf':
        AsyncComponentShow(ConfVM, {
          file: item.path
        }).then()
        break
      case 'log':
        AsyncComponentShow(LogVM, {
          file: item.path
        }).then()
        break
      case 'edit':
        AsyncComponentShow(EditVM, {
          edit: item,
          isEdit: true
        }).then((res) => {
          const find = AppCustomerModule.currentModule!.item[index]
          find.stop().then().catch()
          const save = reactive(new ModuleCustomerExecItem(res))
          save.pid = ''
          save.running = false
          save.run = false
          const onStart = AppCustomerModule.currentModule!.onExecStart.bind(
            AppCustomerModule.currentModule!
          )
          save.onStart(onStart)
          AppCustomerModule.currentModule!.item.splice(index, 1, save)
          AppCustomerModule.saveModule()
        })
        break
      case 'del':
        Base._Confirm(I18nT('base.areYouSure'), undefined, {
          customClass: 'confirm-del',
          type: 'warning'
        })
          .then(() => {
            const findIndex = AppCustomerModule.currentModule?.item?.findIndex(
              (f) => f.id === item.id
            )
            if (findIndex >= 0) {
              const find: ModuleCustomerExecItem = AppCustomerModule.currentModule!.item[findIndex]
              find.stop().then().catch()
              AppCustomerModule.currentModule!.item.splice(findIndex, 1)
              AppCustomerModule.saveModule()
            }
          })
          .catch()
        break
    }
  }

  const serviceDo = (fn: 'start' | 'stop', item: ModuleCustomerExecItem) => {
    if (fn === 'start') {
      item.start().then().catch()
    } else {
      item.stop().then().catch()
    }
  }
</script>
