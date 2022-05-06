import os from 'os'
class Os {
  constructor() {
    this.mac = this.getPcMsg()
    this.cpu = os.cpus()
  }
  info() {
    return {
      mac: this.mac,
      cpu: this.cpu
    }
  }
  getPcMsg() {
    let interfaces = os.networkInterfaces()
    let pcObj = {}
    let pcMessage = []
    for (let key in interfaces) {
      if (key.indexOf('WLAN') !== -1 || key.indexOf('无线网络连接') !== -1) {
        pcObj = interfaces[key]
        break
      } else if (key.indexOf('以太网') !== -1 || key.indexOf('本地连接') !== -1) {
        pcObj = interfaces[key]
      } else if (Object.keys(pcObj).length < 1) {
        pcObj = interfaces[key]
      }
    }
    pcMessage = pcObj.filter((item) => {
      if (item.family === 'IPv4') {
        return item
      }
    })
    return pcMessage[0]
  }
}
export default new Os()
