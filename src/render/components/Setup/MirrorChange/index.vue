<template>
  <el-form-item :label="$t('base.mirrorChange')" label-position="left" label-width="110">
    <el-space direction="vertical">
      <el-space wrap>
        <el-select
          v-model="currentBrewSrc"
          :disabled="!checkBrew()"
          style="width: 255px"
          @change="changeBrewSrc"
        >
          <template #prefix>
            <span>{{ $t('base.brewSource') }}:</span>
          </template>

          <template v-for="(src, index) in brewSrc" :key="index">
            <el-option :label="src.name" :value="src.value"></el-option>
          </template>
        </el-select>
      </el-space>

      <el-space wrap>
        <el-select
          v-model="currentSrc"
          :disabled="!checkMacPorts()"
          style="width: 255px"
          @change="changeMacPortsSrc"
        >
          <template #prefix>
            <span>{{ $t('base.macPortsSource') }}:</span>
          </template>
          <template v-for="(src, index) in macPortsSrc" :key="index">
            <el-option :label="src.name" :value="src.url"></el-option>
          </template>
        </el-select>
      </el-space>
    </el-space>
  </el-form-item>
</template>

<script lang="ts" setup>
  import { ref, computed, onMounted } from 'vue'
  import { I18nT } from '@shared/lang/index'
  import IPC from '@/util/IPC'
  import { BrewStore } from '@/store/brew'
  import { MessageError, MessageSuccess } from '@/util/Element'

  const { readFile, existsSync } = require('fs-extra')

  const brewStore = BrewStore()

  const macPortsSrc = computed(() => {
    return [
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
  })

  const brewSrc = computed(() => {
    return [
      {
        name: I18nT('util.brewDefault'),
        value: 'default'
      },
      {
        name: I18nT('util.brewTsinghua'),
        value: 'tsinghua'
      },
      {
        name: I18nT('util.brewBfsu'),
        value: 'bfsu'
      },
      {
        name: I18nT('util.brewUstc'),
        value: 'ustc'
      },
      {
        name: I18nT('util.brewTencent'),
        value: 'tencent'
      },
      {
        name: I18nT('util.brewAliyun'),
        value: 'aliyun'
      }
    ]
  })

  const sourcesConf = '/opt/local/etc/macports/sources.conf'

  const currentSrc = ref('')
  const currentBrewSrc = ref('')

  onMounted(() => {
    getMacPortsSrc().then((res) => {
      if (res) {
        const find = macPortsSrc.value.find((s) => s.url === res.replace('[default]', '').trim())
        if (find) {
          currentSrc.value = find.url
          return
        }
      }
      currentSrc.value = 'rsync://rsync.macports.org/macports/release/tarballs/ports.tar'
      console.log('getCurrentSrc: ', res, currentSrc.value)
    })
    getBrewSrc()
  })
  const checkMacPorts = () => {
    return !!global.Server.MacPorts
  }

  const checkBrew = () => {
    return !!global.Server.BrewCellar
  }

  const getBrewSrc = () => {
    IPC.send('app-fork:brew', 'currentSrc').then((key: string, info: any) => {
      IPC.off(key)
      console.log('info: ', info)
      if (info.data) {
        currentBrewSrc.value = info.data
      }
    })
  }

  const changeBrewSrc = () => {
    IPC.send('app-fork:brew', 'changeSrc', currentBrewSrc.value).then((key: string, info: any) => {
      IPC.off(key)
      console.log('info: ', info)
      if (info.code === 0) {
        brewStore.brewSrc = currentBrewSrc.value
        MessageSuccess(I18nT('base.success'))
      } else {
        MessageError(I18nT('base.fail'))
      }
    })
  }

  const getMacPortsSrc = async () => {
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

  const changeMacPortsSrc = async () => {
    const find = macPortsSrc.value.find((f) => f.url === currentSrc.value)
    if (find) {
      IPC.send('app-fork:macports', 'changSrc', JSON.parse(JSON.stringify(find))).then(
        (key: string, info: any) => {
          IPC.off(key)
          if (info?.code === 0) {
            MessageSuccess(I18nT('base.success'))
          } else {
            MessageError(I18nT('base.fail'))
          }
        }
      )
    } else {
      MessageError(I18nT('base.fail'))
    }
  }
</script>
