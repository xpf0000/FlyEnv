const html = `Last metadata expiration check: 1:20:10 ago on Thu 25 Jul 2024 09:26:37 PM CST.
Installed Packages
Name         : httpd
Version      : 2.4.59
Release      : 2.fc38
Architecture : aarch64
Size         : 412 k
Source       : httpd-2.4.59-2.fc38.src.rpm
Repository   : @System
From repo    : updates
Summary      : Apache HTTP Server
URL          : https://httpd.apache.org/
License      : Apache-2.0 AND (BSD-3-Clause AND metamail AND HPND-sell-variant
             : AND Spencer-94)
Description  : The Apache HTTP Server is a powerful, efficient, and extensible
             : web server.

Name         : nginx
Epoch        : 1
Version      : 1.26.0
Release      : 1.fc38
Architecture : aarch64
Size         : 119 k
Source       : nginx-1.26.0-1.fc38.src.rpm
Repository   : @System
From repo    : updates
Summary      : A high performance web server and reverse proxy server
URL          : https://nginx.org
License      : BSD-2-Clause
Description  : Nginx is a web server and a reverse proxy server for HTTP, SMTP,
             : POP3 and IMAP protocols, with a strong focus on high concurrency,
             : performance and low memory usage.

Available Packages
Name         : caddy
Version      : 2.6.4
Release      : 1.fc38
Architecture : aarch64
Size         : 11 M
Source       : caddy-2.6.4-1.fc38.src.rpm
Repository   : updates
Summary      : Web server with automatic HTTPS
URL          : https://caddyserver.com
License      : Apache-2.0 AND BSD-2-Clause AND BSD-3-Clause AND MIT AND
             : BSD-2-Clause-Views AND ISC AND CC0-1.0 AND MPL-2.0
Description  : Caddy is the web server with automatic HTTPS.`
const reg = /(Name         : )(.*?)\n([\s\S]*?)(Version      : )(.*?)\n/g
let r
const all = new Set()
while ((r = reg.exec(html)) !== null) {
  console.log(r)
}
