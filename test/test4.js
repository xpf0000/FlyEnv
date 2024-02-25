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
const regex = /(\d+(\.\d+){1,4}) default/g
const str = `* v18.19.1 default
* v20.8.1
* system`
// //
// // console.log(regex.test(str))
//
console.log(str.match(regex))
regex.lastIndex = 0
console.log(regex.exec(str))
// // //
// let m
// while ((m = regex.exec(str)) !== null) {
//   console.log(m)
// }
//
// const sourcesConf = '/opt/local/etc/macports/macports.conf'
//
// const regex = /([^\n\da-zA-Z][\s]?)rsync:\/\/(.*?)([^\n])(\n|$)/g

// const regex = /(^|\n)\s*rsync:\/\/.*(\[default])?(\n|$)/
// const regex = /^(?:\s*rsync:\/\/.*\[default\])$/gm
// const regex = /^(?:\s*rsync_server\s.*)$/gm
// const fs = require('fs')
//
// const content = fs.readFileSync(sourcesConf, 'utf-8')
//
// console.log(content.match(regex))

// let m
// while ((m = regex.exec(content)) !== null) {
//   console.log(m)
// }

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
