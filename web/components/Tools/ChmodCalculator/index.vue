<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { I18nT } from '@shared/lang'
  import {
    computeChmodOctalRepresentation,
    computeChmodSymbolicRepresentation
  } from './chmod-calculator.service'
  import type { Scope } from './chmod-calculator.types'
  import { CopyDocument } from '@element-plus/icons-vue'
  import { MessageSuccess } from '@/util/Element'

  const scopes: { scope: Scope; title: string }[] = [
    { scope: 'read', title: 'Read (4)' },
    { scope: 'write', title: 'Write (2)' },
    { scope: 'execute', title: 'Execute (1)' }
  ]

  const permissions: any = ref({
    owner: { read: false, write: false, execute: false },
    group: { read: false, write: false, execute: false },
    public: { read: false, write: false, execute: false }
  })

  const octal = computed(() => computeChmodOctalRepresentation({ permissions: permissions.value }))
  const symbolic = computed(() =>
    computeChmodSymbolicRepresentation({ permissions: permissions.value })
  )

  const copy = (v: string) => {
    MessageSuccess(I18nT('base.success'))
  }
</script>
<template>
  <div class="host-edit tools">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('chmod-calculator.title') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <div class="p-3 pb-0 overflow-hidden flex-1">
      <el-scrollbar>
        <el-table :data="scopes">
          <el-table-column label="" prop="title"></el-table-column>
          <el-table-column label="Owner (u)">
            <template #default="scope">
              <el-checkbox v-model="permissions.owner[scope.row.scope]"></el-checkbox>
            </template>
          </el-table-column>
          <el-table-column label="Group (g)">
            <template #default="scope">
              <el-checkbox v-model="permissions.group[scope.row.scope]"></el-checkbox>
            </template>
          </el-table-column>
          <el-table-column label="Public (o)">
            <template #default="scope">
              <el-checkbox v-model="permissions.public[scope.row.scope]"></el-checkbox>
            </template>
          </el-table-column>
        </el-table>

        <div class="octal-result">
          {{ octal }}
        </div>
        <div class="octal-result">
          {{ symbolic }}
        </div>

        <el-input :model-value="`chmod ${octal} path`" readonly>
          <template #suffix>
            <el-button
              link
              :icon="CopyDocument"
              @click.stop="copy(`chmod ${octal} path`)"
            ></el-button>
          </template>
        </el-input>
      </el-scrollbar>
    </div>
  </div>
</template>
<style lang="scss" scoped>
  .octal-result {
    text-align: center;
    font-size: 50px;
    font-family: monospace;
    margin: 24px 0;
    color: #01cc74;
    user-select: text;
  }
</style>
