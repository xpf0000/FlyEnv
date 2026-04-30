<script setup lang="ts">
  import Store from './store'
  import { I18nT } from '@lang/index'
</script>

<template>
  <div class="host-edit tools">
    <div class="nav p-0">
      <div class="left">
        <span class="text-xl">{{ I18nT('tools.cron-parser-title') }}</span>
        <slot name="like"></slot>
      </div>
    </div>

    <el-scrollbar class="flex-1">
      <div class="main-wapper pb-0">
        <div class="main p-0">
          <el-card class="mb-3">
            <el-form-item label-position="top" label="Cron mode:">
              <el-radio-group v-model="Store.cronMode" @change="Store.generate()">
                <template v-for="item in Store.cronModes" :key="item.value">
                  <el-radio-button :value="item.value">{{ item.label }}</el-radio-button>
                </template>
              </el-radio-group>
            </el-form-item>
            <el-alert :title="Store.modeFieldHints[Store.cronMode]" type="info" show-icon />
          </el-card>

          <div class="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <el-card header="Generate">
              <el-form-item label-position="top" label="Schedule:">
                <el-select v-model="Store.generateMode" class="w-full" @change="Store.generate()">
                  <template v-for="item in Store.generateModes" :key="item.value">
                    <el-option :value="item.value" :label="item.label"></el-option>
                  </template>
                </el-select>
              </el-form-item>

              <el-form-item
                v-if="Store.generateMode === 'everyNMinutes'"
                label-position="top"
                label="Interval minutes:"
              >
                <el-input-number
                  v-model="Store.intervalMinutes"
                  :min="1"
                  :max="59"
                  @change="Store.generate()"
                />
              </el-form-item>

              <div
                v-if="['hourly', 'daily', 'weekly', 'monthly'].includes(Store.generateMode)"
                class="grid grid-cols-1 md:grid-cols-2 gap-3"
              >
                <el-form-item label-position="top" label="Hour:">
                  <el-input-number
                    v-model="Store.hour"
                    :min="0"
                    :max="23"
                    @change="Store.generate()"
                  />
                </el-form-item>
                <el-form-item label-position="top" label="Minute:">
                  <el-input-number
                    v-model="Store.minute"
                    :min="0"
                    :max="59"
                    @change="Store.generate()"
                  />
                </el-form-item>
              </div>

              <el-form-item
                v-if="Store.generateMode === 'weekly'"
                label-position="top"
                label="Day of week:"
              >
                <el-select v-model="Store.dayOfWeek" class="w-full" @change="Store.generate()">
                  <el-option :value="0" label="Sunday"></el-option>
                  <el-option :value="1" label="Monday"></el-option>
                  <el-option :value="2" label="Tuesday"></el-option>
                  <el-option :value="3" label="Wednesday"></el-option>
                  <el-option :value="4" label="Thursday"></el-option>
                  <el-option :value="5" label="Friday"></el-option>
                  <el-option :value="6" label="Saturday"></el-option>
                </el-select>
              </el-form-item>

              <el-form-item
                v-if="Store.generateMode === 'monthly'"
                label-position="top"
                label="Day of month:"
              >
                <el-input-number
                  v-model="Store.dayOfMonth"
                  :min="1"
                  :max="31"
                  @change="Store.generate()"
                />
              </el-form-item>

              <el-alert :title="Store.generatedDescription" type="success" show-icon />
            </el-card>

            <el-card header="Parse">
              <el-form-item label-position="top" label="Cron expression:">
                <el-input
                  v-model.trim="Store.expression"
                  placeholder="*/5 * * * *"
                  @input="Store.parse()"
                />
              </el-form-item>

              <div class="flex gap-2 mb-4">
                <el-tag v-if="Store.detectedMode" type="success">
                  Detected: {{ Store.detectedMode }}
                </el-tag>
                <el-tag v-if="Store.fieldHint" type="info">{{ Store.fieldHint }}</el-tag>
              </div>

              <div class="flex flex-wrap gap-2 mb-4">
                <template v-for="item in Store.examples" :key="item.expression">
                  <el-button size="small" @click="Store.useExample(item.expression)">
                    {{ item.label }}
                  </el-button>
                </template>
              </div>

              <el-form-item label-position="top" :label="`Next runs (${Store.count})`">
                <el-slider v-model="Store.count" :min="1" :max="30" @change="Store.parse()" />
              </el-form-item>
            </el-card>
          </div>

          <el-card class="mt-3" header="Next run times">
            <el-alert v-if="Store.error" :title="Store.error" type="error" show-icon />

            <el-table
              v-else
              :data="Store.results.map((value, index) => ({ index: index + 1, value }))"
            >
              <el-table-column prop="index" label="#" width="80" />
              <el-table-column prop="value" label="Run time" />
            </el-table>
          </el-card>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>
