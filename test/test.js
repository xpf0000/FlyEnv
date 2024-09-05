const { readdirSync } = require('fs')

const files = readdirSync('/Library/Java/JavaVirtualMachines', { withFileTypes: true })

for (const file of files) {
  console.log(file, file.isFile(), file.isDirectory(), file.isSymbolicLink())
}
