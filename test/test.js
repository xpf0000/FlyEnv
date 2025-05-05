const { spawn } = require('child-process-promise')
const dir = 'C:\\Users\\x\\Desktop\\Git Hub\\FlyEnv\\data\\server\\redis'

spawn('cmd.exe', ['star', '/B', 'cmd', '/c', 'start.cmd'], {
  shell: true, // 使用shell执行
  cwd: dir // 设置工作目录为当前目录
})
  .then((res) => {
    console.log('res: ', res.stdout, res.stderr)
  })
  .catch((e) => {
    console.log('e: ', e)
  })
