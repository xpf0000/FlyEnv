// // const str = `
// // Listen 80
// // Listen   80 ###abc
// // NameVirtualHost *:#Listen_Port_Apache#
// // <VirtualHost *:8080>
// //     ServerAdmin webmaster@example.com
// //     DocumentRoot "#Server_Root#"
// //     ServerName #Server_Name#
// //     ServerAlias #Server_Alias#
// //     ErrorLog "#Log_Path#/#Server_Name#-error_log"
// //     CustomLog "#Log_Path#/#Server_Name#-access_log" combined
// // </VirtualHost>
// // <VirtualHost *:8443>
// // Listen 8080   `
// // console.log(
// //   str
// //     .replace(/([\s\n]?[^\n]*)Listen\s+\d+(.*?)([^\n])(\n|$)/g, '\n')
// //     .replace(/\n+/g, '\n')
// //     .trim()
// // )
// // const regex = /<VirtualHost\s+\*:(\d+)>/g
// // // const regex = /([\s\n]?[^\n]*)Listen\s+\d+(.*?)([^\n])(\n|$)/g
// // const str1 = `\nListen 80\n`
// // const str2 = '\n Listen   80 \n'
// // const str3 = ' Listen 80 \n'
// // const str4 = 'Listen 80 \n'
// // regex.lastIndex = 0
// // console.log(regex.test(str)) // true
// // regex.lastIndex = 0
// // console.log(regex.test(str1)) // true
// // regex.lastIndex = 0
// // console.log(regex.test(str2)) // true
// // regex.lastIndex = 0
// // console.log(regex.test(str3)) // true
// // regex.lastIndex = 0
// // console.log(regex.test(str4)) // true
//
// // const regex = new RegExp('([\\s\\S]?[^\\d]*)([\\d\\.]*)([^\\d])([\\s\\S]*)', 'g')
// // const str = `pg_ctl (PostgreSQL) 3 16.1.5-dev\n`
//
// // const regex = /^\d[\d\.]*\d$/g
// // const str = '16.7.A'
// //
// // console.log(regex.test(str))
//
// // console.log(str.match(regex))
// // regex.lastIndex = 0
// // //
// // let m
// // while ((m = regex.exec(str)) !== null) {
// //   console.log(m)
// // }
//
const str = `2024-01-07T12:20:38.693574Z 0 [ERROR] [MY-011300] [Server] Plugin mysqlx reported: 'Setup of bind-address: '*' port: 33060 failed, \`bind()\` failed with error: Address already in use (48). Do you already have another mysqld server running with Mysqlx ?'`
//
const regex = /port: (\d+) failed, `bind\(\)` failed with error: Address already in use \(48\)/g

// console.log(regex.test(str))
// console.log(str.match(regex))
const port = new Set()
let m
while ((m = regex.exec(str)) !== null) {
  console.log(m)
  if (m && m.length > 1) {
    port.add(m[1])
  }
}
console.log(port)

// class Test4 {
//   constructor() {
//     this.a = 2
//   }
// }
// const a = typeof Test4
// console.log(Reflect.construct('Test4', []))

// const { statSync } = require('fs')
// const { dirname } = require('path')
// console.log(dirname('/'))
// let dir = '/Users/x/Desktop/AAA/nginx'
// let parentDir = dirname(dir)
// while (parentDir !== dir) {
//   const state = statSync(dir)
//   console.log(dir, state.uid, state.gid)
//   dir = parentDir
//   parentDir = dirname(dir)
// }
//
// console.log(statSync(dir))
