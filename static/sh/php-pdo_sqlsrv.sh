#!/bin/bash
cachedir=$1
phpdir=$2
extendv=$3
arch=$4
password=$5
cd "$cachedir" || exit 1
curl -C - -O -s http://pecl.php.net/get/pdo_sqlsrv-"$extendv".tgz
if [ -d "pdo_sqlsrv-$extendv" ]; then
 echo "$password" | sudo -S rm -rf "pdo_sqlsrv-$extendv"
fi
if [ -f "pdo_sqlsrv-$extendv.tgz" ]; then
  tar -zxf pdo_sqlsrv-"$extendv".tgz
else
  exit 1
fi
export HOMEBREW_NO_AUTO_UPDATE=1
arch "$arch" brew install pkg-config autoconf automake libtool unixodbc
prefix=$(brew --prefix)
export CFLAGS=-I$prefix/include
export CXXFLAGS=-I$prefix/include
export LDFLAGS=-L$prefix/lib
cd "pdo_sqlsrv-$extendv" || exit 1
"$phpdir"/bin/phpize
./configure --with-php-config="$phpdir"/bin/php-config
make
make install
