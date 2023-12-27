const { fork } = require('child_process')

const names = [
  'php',
  'nginx',
  'pure-ftpd',
  'apache',
  'memcached',
  'mysql',
  'mariadb',
  'redis',
  'mongodb',
  'postgresql'
]

let count = 0
// const child = fork('./sub.js')
const child = fork('./subSync.js')
child.on('message', (num) => {
  console.log('child on message: ', num)
  count += 1
  if (count === names.length) {
    console.timeEnd('Test')
  }
})

const doRun = (num = 0) => {
  if (num >= names.length) {
    return
  }
  child.send(num)
  setTimeout(() => {
    doRun(num + 1)
  }, 500)
}

console.time('Test')
doRun()
