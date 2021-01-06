
<template>
  <div class="php-versions">
    <div class="block">
      <span>选择版本</span>
      <el-select v-model="current" :disabled="currentType === 'php' && isRunning" placeholder="请选择" class="ml-30">
        <el-option
          v-for="item in versions"
          :key="item"
          :label="item"
          :value="item">
        </el-option>
      </el-select>
      <el-button class="ml-20" :disabled="isRunning" @click="versionChange" :loading="isRunning">切换</el-button>
    </div>

    <ul class="logs" id="logs" v-if="currentType === 'php-versions'">
      <li class="mb-5" v-for="log in logs" v-html="log"></li>
    </ul>

  </div>
</template>

<script>
  import FileUtil from '@shared/FileUtil'
  import { join } from 'path'
  import { mapState } from 'vuex'
  export default {
    name: 'mo-php-versions',
    data () {
      return {
        current: '',
        versions: [
          'php-8.1.0',
          'php-8.0.0',
          'php-7.4.13',
          'php-7.4.3',
          'php-7.3.25',
          'php-7.3.15',
          'php-7.2.34',
          'php-7.2.28',
          'php-7.1.33',
          'php-7.0.33',
          'php-5.6.40',
          'php-5.5.38',
          'php-5.4.45',
          'php-5.3.29'
        ]
      }
    },
    components: {
    },
    props: {},
    computed: {
      ...mapState('task', {
        currentType: state => state.taskType,
        isRunning: state => state.taskRunning,
        logs: state => state.taskLog,
        taskResult: state => state.taskResult
      })
    },
    watch: {
      currentType (nv, ov) {
        console.log(`currentType: nv: ${nv}, ov: ${ov}`)
      },
      logs () {
        this.$nextTick(() => {
          let container = this.$el.querySelector('#logs')
          if (container) {
            container.scrollTop = container.scrollHeight
          }
        })
      }
    },
    methods: {
      getAllVersion () {
        let brewng = join(__static, 'brew/php')
        let rbfiles = FileUtil.getAllFile(brewng).map(file => file.replace(`${brewng}/`, '').replace('.rb', ''))
        console.log('files: ', rbfiles)
        this.versions = rbfiles
      },
      getCurrenVersion () {
        if (this.$store.state.task.taskType === 'php-versions' && this.$store.state.task.taskRunning) {
          this.current = this.$store.state.task.taskVersion
          console.log('this.current: ', this.current)
        } else {
          let c = this.$store.state.preference.config.server.php.current
          this.current = c
        }
        if (!this.$store.state.task.taskRunning) {
          this.$store.dispatch('task/cleanLog')
        }
      },
      versionChange () {
        console.log('current is change: ', this.current)
        this.$store.dispatch('task/start', { type: 'php-versions', v: this.current })
        this.$electron.ipcRenderer.send('command', 'php', 'switchVersion', this.current)
      }
    },
    created: function () {
      console.log('config: ', this.$store.state.preference.config)
      this.getCurrenVersion()
    }
  }
</script>

<style lang="scss">
  .php-versions{
    display: flex;
    flex-direction: column;
    height: 100%;
    .block{
      display: flex;
      align-items: center;
      margin: 40px 0 30px 40px;
      flex-shrink: 0;
    }
    .logs{
      padding-left: 40px;
      flex: 1;
      width: 100%;
      display: flex;
      flex-direction: column;
      overflow: auto;
      >li{
        width: 100%;
        word-break: break-all;
      }
    }
  }
</style>
