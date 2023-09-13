#!/bin/bash
cachedir=$1
extendV=$2
password=$3
phpize=$4
phpconfig=$5
cd "$cachedir" || exit 1
curl -C - -O -s http://pecl.php.net/get/pdo_sqlsrv-"$extendV".tgz
if [ -d "pdo_sqlsrv-$extendV" ]; then
 rm -rf "pdo_sqlsrv-$extendV"
fi
if [ -f "pdo_sqlsrv-$extendV.tgz" ]; then
  tar -zxf pdo_sqlsrv-"$extendV".tgz
else
  exit 1
fi
echo "y" | echo "$password" | sudo -S port install pkg-config autoconf automake libtool
export CFLAGS=-I/opt/local/include
export CXXFLAGS=-I/opt/local/include
export LDFLAGS=-L/opt/local/lib
cd "pdo_sqlsrv-$extendV"
$phpize
./configure --with-php-config="$phpconfig"
echo "$password" | sudo -S make
echo "$password" | sudo -S make install
