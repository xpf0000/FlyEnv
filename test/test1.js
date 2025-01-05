const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const child = spawn('npx', ['create-next-app@latest --js --no-tailwind --eslint --app --src-dir --turbopack'], {
  cwd: '/Users/x/Desktop/未命名文件夹'
})

const keys = {
  name: false,
  ts: false
}
child.stdout.on('data', (data) => {
  console.log('stdout: ', data.toString())
  const str = data.toString()
  if (str.includes('What is your project named?') && !keys.name) {
    keys.name = true
    child.stdin.write('app123\n')
  } else if (str.includes('Would you like to use TypeScript?') && !keys.ts) {
    keys.ts = true
    child.stdin.write('^[[D\n')
  }
})

child.stderr.on('data', (data) => {
  console.log('stderr: ', data.toString())
  const str = data.toString()
})
