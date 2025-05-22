const { exec } = require('child-process-promise')

const dir = 'F:\\Temp\\path-set-utf8bom.ps1'

exec(
  `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Unblock-File -LiteralPath '${dir}'; & '${dir}'"`,
  {
    shell: true
  }
)
  .then((res) => {
    console.log('res: ', res.stdout, res.stderr)
  })
  .catch((e) => {
    console.log('e: ', e)
  })
