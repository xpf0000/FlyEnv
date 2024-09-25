const fs = require('fs')
const path = require('path')

const content = fs.readFileSync(path.join(__dirname, 'data.json'), 'utf-8')
const all = JSON.parse(content)

const arr = all.map((a) => {
  return {
    name: a.countryName
  }
})

fs.writeFileSync(path.join(__dirname, 'country.json'), JSON.stringify(arr))
