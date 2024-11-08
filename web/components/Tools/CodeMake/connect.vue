<template>
  <div class="flex center justify-center w-full">
    <el-card class="w-96">
      <template #header>
        <div class="card-header">
          <span>Mysql Connect</span>
        </div>
      </template>
      <el-form label-position="top">
        <el-form-item label="user">
          <el-input v-model.trim="CodeMake.user"></el-input>
        </el-form-item>
        <el-form-item label="password">
          <el-input v-model.trim="CodeMake.password" type="password"></el-input>
        </el-form-item>
        <el-form-item label="host">
          <el-input v-model.trim="CodeMake.host"></el-input>
        </el-form-item>
        <el-form-item label="port">
          <el-input v-model.number="CodeMake.port" type="number"></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="flex justify-end">
          <el-button style="margin-bottom: 0" type="primary" @click.stop="CodeMake.connect()"
            >Connect</el-button
          >
        </div>
      </template>
    </el-card>
  </div>
</template>
<script lang="ts" setup>
  import { CodeMake } from './store'
</script>
