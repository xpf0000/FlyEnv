<template>
  <div class="plant-title">{{ $t('util.macPortsSrcSwitch') }}</div>
  <div class="main brew-src">
    <el-select v-model="currentSrc" :disabled="!checkMacPorts()">
      <template v-for="(src, _index) in srcs" :key="_index">
        <el-option :label="src.name" :value="src.url"></el-option>
      </template>
    </el-select>
    <el-button
      :loading="Controller.running"
      :disabled="!checkMacPorts() || Controller.running"
      @click="changeSrc"
      >{{ $t('base.switch') }}</el-button
    >
  </div>
  <div v-if="Controller.preview" class="mt-4">
    <p>{{ $t('util.macPortsSourceTerminal') }}</p>
    <template v-for="file in Controller.preview.files" :key="file.path">
      <p class="mt-2">{{ file.path }}</p>
      <el-input :model-value="file.content" type="textarea" :rows="6" readonly />
    </template>
    <el-button class="mt-3" :disabled="Controller.running" @click="applySource"
      >{{ $t('nodejs.openIN') }} {{ $t('nodejs.Terminal') }}</el-button
    >
  </div>
  <p v-for="result in Controller.outcomes" :key="result.path" class="mt-2">
    {{ result.path }}: {{ $t('util.macPortsSourceOutcome.' + result.status) }}
  </p>
  <div
    v-show="Controller.preview || Controller.xterm"
    ref="terminalElement"
    class="mt-3 min-h-64"
  ></div>
</template>

<script lang="ts" setup>
  import { ref, computed, onMounted, onUnmounted } from 'vue'
  import { I18nT } from '@lang/index'
  import Controller from './Controller'
  import { MessageError } from '@/util/Element'
  import { fs } from '@/util/NodeFn'

  const srcs = computed(() => {
    return [
      {
        name: I18nT('common.value.default'),
        url: 'rsync://rsync.macports.org/macports/release/tarballs/ports.tar',
        rsync_server: '',
        rsync_dir: ''
      },
      {
        name: I18nT('util.macPortsSrcAustraliBrisbane'),
        url: 'rsync://aarnet.au.rsync.macports.org/pub/macports/ports/',
        rsync_server: '',
        rsync_dir: ''
      },
      {
        name: I18nT('util.macPortsSrcCanadaManitoba'),
        url: 'rsync://ywg.ca.rsync.macports.org/macports/release/tarballs/ports.tar',
        rsync_server: 'ywg.ca.rsync.macports.org',
        rsync_dir: 'macports/release/tarballs/base.tar'
      },
      {
        name: I18nT('util.macPortsSrcCanadaWaterloo'),
        url: 'rsync://ykf.ca.rsync.macports.org/mprelease/tarballs/ports.tar',
        rsync_server: 'ykf.ca.rsync.macports.org',
        rsync_dir: 'mprelease/tarballs/base.tar'
      },
      {
        name: I18nT('util.macPortsSrcChinaBeijing'),
        url: 'rsync://pek.cn.rsync.macports.org/macports/release/tarballs/ports.tar',
        rsync_server: 'pek.cn.rsync.macports.org',
        rsync_dir: 'macports/release/tarballs/base.tar'
      },
      {
        name: I18nT('util.macPortsSrcDenmarkCopenhagen'),
        url: 'rsync://cph.dk.rsync.macports.org/macports/release/tarballs/ports.tar',
        rsync_server: 'cph.dk.rsync.macports.org',
        rsync_dir: 'macports/release/tarballs/base.tar'
      },
      {
        name: I18nT('util.macPortsSrcGermanyErlangen'),
        url: 'rsync://nue.de.rsync.macports.org/macports/release/tarballs/ports.tar',
        rsync_server: 'nue.de.rsync.macports.org',
        rsync_dir: 'macports/release/tarballs/base.tar'
      },
      {
        name: I18nT('util.macPortsSrcGermanyLimburg'),
        url: 'rsync://fra.de.rsync.macports.org/macports/release/tarballs/ports.tar',
        rsync_server: 'fra.de.rsync.macports.org',
        rsync_dir: 'macports/release/tarballs/base.tar'
      },
      {
        name: I18nT('util.macPortsSrcIndonesiaYogyakarta'),
        url: 'rsync://jog.id.rsync.macports.org/macports/release/tarballs/ports.tar',
        rsync_server: 'jog.id.rsync.macports.org',
        rsync_dir: 'macports/release/tarballs/base.tar'
      },
      {
        name: I18nT('util.macPortsSrcJapanNomiIshikawa'),
        url: 'rsync://kmq.jp.rsync.macports.org/macports/release/tarballs/ports.tar',
        rsync_server: 'kmq.jp.rsync.macports.org',
        rsync_dir: 'macports/release/tarballs/base.tar'
      },
      {
        name: I18nT('util.macPortsSrcSouthAfricaJohannesburg'),
        url: 'rsync://jnb.za.rsync.macports.org/macports/release/tarballs/ports.tar',
        rsync_server: 'jnb.za.rsync.macports.org',
        rsync_dir: 'macports/release/tarballs/base.tar'
      },
      {
        name: I18nT('util.macPortsSrcSouthKoreaDaejeon'),
        url: 'rsync://cjj.kr.rsync.macports.org/macports/release/tarballs/ports.tar',
        rsync_server: 'cjj.kr.rsync.macports.org',
        rsync_dir: 'macports/release/tarballs/base.tar'
      },
      {
        name: I18nT('util.macPortsSrcUnitedKingdomCanterbury'),
        url: 'rsync://mse.uk.rsync.macports.org/rsync.macports.org/release/tarballs/ports.tar',
        rsync_server: 'mse.uk.rsync.macports.org',
        rsync_dir: 'rsync.macports.org/release/tarballs/base.tar'
      },
      {
        name: I18nT('util.macPortsSrcUnitedStatesGeorgia'),
        url: 'rsync://atl.us.rsync.macports.org/MacPorts/release/tarballs/ports.tar',
        rsync_server: 'atl.us.rsync.macports.org',
        rsync_dir: 'MacPorts/release/tarballs/base.tar'
      }
    ]
  })

  const sourcesConf = '/opt/local/etc/macports/sources.conf'

  const currentSrc = ref('')
  const terminalElement = ref<HTMLElement>()

  const checkMacPorts = () => {
    return !!window.Server.MacPorts
  }

  const getCurrentSrc = async () => {
    if (!(await fs.existsSync(sourcesConf))) {
      return ''
    }
    const content = await fs.readFile(sourcesConf)
    const regex = /^(?:\s*rsync:\/\/.*\[default\])$/gm
    const all: Array<string> = content.match(regex)?.map((s: string) => s.trim()) ?? []
    let find = all?.find((a) => a.includes('[default]'))
    if (!find) {
      find = all.pop()
    }
    return find
  }

  getCurrentSrc().then((res) => {
    if (res) {
      const find = srcs.value.find((s) => s.url === res.replace('[default]', '').trim())
      if (find) {
        currentSrc.value = find.url
        return
      }
    }
    currentSrc.value = 'rsync://rsync.macports.org/macports/release/tarballs/ports.tar'
    console.log('getCurrentSrc: ', res, currentSrc.value)
  })

  const changeSrc = async () => {
    const find = srcs.value.find((f) => f.url === currentSrc.value)
    if (find) await Controller.prepare(JSON.parse(JSON.stringify(find)))
    else MessageError(I18nT('base.fail'))
  }
  const applySource = () => {
    if (terminalElement.value) void Controller.apply(terminalElement.value)
  }
  onMounted(() => {
    if (Controller.xterm && terminalElement.value)
      void Controller.xterm
        .mount(terminalElement.value)
        .catch((error) => MessageError(String(error)))
  })
  onUnmounted(() => Controller.detach())
</script>
