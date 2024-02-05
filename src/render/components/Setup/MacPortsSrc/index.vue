<template>
  <div class="plant-title">{{ $t('util.macPortsSrcSwitch') }}</div>
  <div class="main brew-src">
    <el-select v-model="currentSrc" :disabled="!checkMacPorts()">
      <template v-for="(src, index) in srcs" :key="index">
        <el-option :label="src.name" :value="src.url"></el-option>
      </template>
    </el-select>
    <el-button :loading="running" :disabled="!checkMacPorts() || running" @click="changeSrc">{{
      $t('base.switch')
    }}</el-button>
  </div>
</template>

<script lang="ts" setup>
  import { ref } from 'vue'
  import { I18nT } from '@shared/lang/index'
  import IPC from '@/util/IPC'
  import { MessageError, MessageSuccess } from '@/util/Element'

  const { readFile, existsSync } = require('fs-extra')

  const srcs = [
    {
      name: I18nT('util.macPortsSrcDefault'),
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

  const sourcesConf = '/opt/local/etc/macports/sources.conf'

  const currentSrc = ref('')
  const running = ref(false)

  const checkMacPorts = () => {
    return !!global.Server.MacPorts
  }

  const getCurrentSrc = async () => {
    if (!existsSync(sourcesConf)) {
      return ''
    }
    const content = await readFile(sourcesConf, 'utf-8')
    const regex = /^(?:\s*rsync:\/\/.*\[default\])$/gm
    const all: Array<string> = content.match(regex)?.map((s: string) => s.trim())
    let find = all?.find((a) => a.includes('[default]'))
    if (!find) {
      find = all.pop()
    }
    return find
  }

  getCurrentSrc().then((res) => {
    if (res) {
      const find = srcs.find((s) => s.url === res.replace('[default]', '').trim())
      if (find) {
        currentSrc.value = find.url
        return
      }
    }
    currentSrc.value = 'rsync://rsync.macports.org/macports/release/tarballs/ports.tar'
    console.log('getCurrentSrc: ', res, currentSrc.value)
  })

  const changeSrc = async () => {
    const find = srcs.find((f) => f.url === currentSrc.value)
    if (find) {
      running.value = true
      IPC.send('app-fork:macports', 'changSrc', JSON.parse(JSON.stringify(find))).then(
        (key: string, info: any) => {
          IPC.off(key)
          if (info?.code === 0) {
            MessageSuccess(I18nT('base.success'))
          } else {
            MessageError(I18nT('base.fail'))
          }
          running.value = false
        }
      )
    } else {
      MessageError(I18nT('base.fail'))
    }
  }
</script>
