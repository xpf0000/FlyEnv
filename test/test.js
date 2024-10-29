const { spawn } = require('child_process')

const Password = ``

function execPromiseRoot(params) {
  return new Promise(async (resolve, reject) => {
    const stdout = []
    const stderr = []
    const args = ['-k', '-S']
    args.push(...params)
    const child = spawn('sudo', args)

    let exit = false
    const onEnd = async (code) => {
      if (exit) return
      exit = true
      if (!code) {
        resolve({
          stdout: Buffer.concat(stdout).toString().trim(),
          stderr: Buffer.concat(stderr).toString().trim()
        })
      } else {
        reject(new Error(Buffer.concat(stderr).toString().trim()))
      }
    }
    const onPassword = (data) => {
      const str = data.toString()
      console.log('onPassword str: ', str, str.startsWith('Password:'))
      if (str.startsWith('Password:')) {
        child?.stdin?.write(Password)
        child?.stdin?.write(`\n`)
      }
    }
    child?.stdout?.on('data', (data) => {
      stdout.push(data)
      onPassword(data)
    })
    child?.stderr?.on('data', (err) => {
      stderr.push(err)
      onPassword(err)
    })
    child.on('exit', onEnd)
    child.on('close', onEnd)
  })
}

execPromiseRoot(['echo', 'a'])
  .then((res) => {
    console.log('res: ', res)
  })
  .catch((e) => {
    console.log('err: ', e)
  })
