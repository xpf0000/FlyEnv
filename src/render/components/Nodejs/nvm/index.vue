<template>
  <template v-if="NVMSetup.installing">
    <div class="w-full h-full overflow-hidden p-5">
      <div ref="xtermDom" class="w-full h-full overflow-hidden"></div>
    </div>
  </template>
  <template v-else-if="showInstall">
    <div class="p-5">
      <pre class="app-html-block mb-6 text-xl" v-html="I18nT('nodejs.installNVM')"></pre>
      <el-form label-position="top" label-width="150px">
        <el-form-item :label="I18nT('util.nodeToolInstallBy')">
          <el-radio-group v-model="NVMSetup.installLib">
            <el-radio-button key="shell" label="shell">{{
              I18nT('util.nodeToolShell')
            }}</el-radio-button>
            <el-radio-button key="brew" :disabled="!hasBrew" label="brew">Homebrew</el-radio-button>
            <el-radio-button key="port" :disabled="!hasPort" label="port">Macports</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item>
          <el-button class="mt-3" type="primary" @click.stop="installNVM">{{
            I18nT('util.nodeToolInstallBtn')
          }}</el-button>
        </el-form-item>
      </el-form>
    </div>
  </template>
  <template v-else>
    <el-table v-loading="NVMSetup.fetching" class="nodejs-table" :data="tableData">
      <el-table-column :label="I18nT('base.version')" prop="version">
        <template #header>
          <div class="w-p100 name-cell">
            <span style="display: inline-flex; align-items: center; padding: 2px 0">{{
              I18nT('base.version')
            }}</span>
            <el-input v-model.trim="NVMSetup.search" placeholder="search" clearable></el-input>
          </div>
        </template>
        <template #default="scope">
          <span
            style="display: inline-flex; align-items: center; padding: 2px 12px 2px 50px"
            :class="{ current: NVMSetup.current === scope.row.version }"
            >{{ scope.row.version }}</span
          >
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('util.nodeListCellCurrent')" :prop="null" align="center">
        <template #default="scope">
          <template v-if="NVMSetup.current === scope.row.version">
            <el-button link>
              <yb-icon
                class="current"
                :svg="import('@/svg/select.svg?raw')"
                width="17"
                height="17"
              />
            </el-button>
          </template>
          <template v-else-if="scope.row.installed">
            <template v-if="scope.row.switching">
              <el-button :loading="true" link></el-button>
            </template>
            <template v-else>
              <el-button
                v-if="!NVMSetup.switching"
                link
                class="current-set"
                @click.stop="versionChange(scope.row)"
              >
                <yb-icon
                  class="current-not"
                  :svg="import('@/svg/select.svg?raw')"
                  width="20"
                  height="20"
                />
              </el-button>
            </template>
          </template>
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('util.nodeListCellInstalled')" :prop="null" align="center">
        <template #default="scope">
          <template v-if="scope.row.installed">
            <el-button link>
              <yb-icon
                class="installed"
                :svg="import('@/svg/select.svg?raw')"
                width="20"
                height="20"
              />
            </el-button>
          </template>
        </template>
      </el-table-column>
      <el-table-column :label="I18nT('base.operation')" width="140px" :prop="null" align="center">
        <template #default="scope">
          <template v-if="scope.row.installing">
            <el-button :loading="true" link></el-button>
          </template>
          <template v-else>
            <template v-if="scope.row.installed">
              <el-button
                type="primary"
                link
                @click.stop="installOrUninstall('uninstall', scope.row)"
                >{{ I18nT('base.uninstall') }}</el-button
              >
            </template>
            <template v-else>
              <el-button
                type="primary"
                link
                @click.stop="installOrUninstall('install', scope.row)"
                >{{ I18nT('base.install') }}</el-button
              >
            </template>
          </template>
        </template>
      </el-table-column>
    </el-table>
  </template>
</template>

<script lang="ts" setup>
  import { I18nT } from '@shared/lang'
  import { NVMSetup, Setup } from './setup'

  const {
    showInstall,
    xtermDom,
    hasBrew,
    hasPort,
    installNVM,
    versionChange,
    installOrUninstall,
    tableData
  } = Setup()
</script>
<script setup lang="ts"></script>
