const html = `Sorting... Done
Full Text Search... Done
php-fpm/jammy,jammy 2:8.3+94+ubuntu22.04.1+deb.sury.org+2 all
  server-side, HTML-embedded scripting language (FPM-CGI binary) (default)

php5.6-fpm/jammy 5.6.40-77+ubuntu22.04.1+deb.sury.org+1 amd64
  server-side, HTML-embedded scripting language (FPM-CGI binary)

php7.0-fpm/jammy 7.0.33-75+ubuntu22.04.1+deb.sury.org+1 amd64
  server-side, HTML-embedded scripting language (FPM-CGI binary)

php7.1-fpm/jammy 7.1.33-63+ubuntu22.04.1+deb.sury.org+1 amd64
  server-side, HTML-embedded scripting language (FPM-CGI binary)

php7.2-fpm/jammy 7.2.34-50+ubuntu22.04.1+deb.sury.org+1 amd64
  server-side, HTML-embedded scripting language (FPM-CGI binary)

php7.3-fpm/jammy 7.3.33-19+ubuntu22.04.1+deb.sury.org+1 amd64
  server-side, HTML-embedded scripting language (FPM-CGI binary)

php7.4-fpm/jammy 1:7.4.33-13+ubuntu22.04.1+deb.sury.org+1 amd64
  server-side, HTML-embedded scripting language (FPM-CGI binary)

php8.0-fpm/jammy 1:8.0.30-7+ubuntu22.04.1+deb.sury.org+1 amd64
  server-side, HTML-embedded scripting language (FPM-CGI binary)

php8.1-fpm/jammy 8.1.29-1+ubuntu22.04.1+deb.sury.org+1 amd64
  server-side, HTML-embedded scripting language (FPM-CGI binary)

php8.2-fpm/jammy 8.2.21-1+ubuntu22.04.1+deb.sury.org+1 amd64
  server-side, HTML-embedded scripting language (FPM-CGI binary)

php8.3-fpm/jammy 8.3.9-1+ubuntu22.04.1+deb.sury.org+1 amd64
  server-side, HTML-embedded scripting language (FPM-CGI binary)

php8.4-fpm/jammy 8.4.0~alpha2-1+ubuntu22.04.1+deb.sury.org+1 amd64
  server-side, HTML-embedded scripting language (FPM-CGI binary)`
const reg = /(php(.*?)-fpm)\/(.*?)([:\s]+?)([\d\.]+)([+-~])/g
let r
const all = new Set()
while ((r = reg.exec(html)) !== null) {
  console.log(r)
}
