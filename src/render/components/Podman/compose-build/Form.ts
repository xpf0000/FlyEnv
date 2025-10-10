import { reactive } from 'vue'

const supportedTimeZones = Intl.supportedValuesOf('timeZone')
console.log(supportedTimeZones) // 返回当前环境支持的时区数组

const ComposeBuildForm = reactive({
  base: {
    dir: '',
    name: '',
    flag: '',
    comment: ''
  },
  'Apache HTTP Server': {
    version: 'latest',
    wwwRoot: '',
    docRoot: '/',
    ports: [
      { in: '80', out: '80' },
      { in: '443', out: '443' }
    ],
    volumes: [{ in: '', out: '/usr/local/apache2/htdocs' }],
    environment: {
      TZ: supportedTimeZones[0]
    }
  }
})

export { ComposeBuildForm }
