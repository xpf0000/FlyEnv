#!/bin/bash
cachedir=$1
extendV=$2
phpize=$3
phpconfig=$4
cd "$cachedir" || exit 1
echo "downloading pdo_sqlsrv-$extendv.tgz from http://pecl.php.net/get/pdo_sqlsrv-$extendv.tgz"
curl -C - -O -L http://pecl.php.net/get/pdo_sqlsrv-"$extendV".tgz
if [ -d "pdo_sqlsrv-$extendV" ]; then
sudo -S rm -rf "pdo_sqlsrv-$extendV"
fi
if [ -f "pdo_sqlsrv-$extendV.tgz" ]; then
  tar -zxf pdo_sqlsrv-"$extendV".tgz
else
  exit 1
fi
echo "download success. start install"
sudo -S port install -v pkgconfig autoconf automake libtool unixodbc
export CFLAGS=-I/opt/local/include
export CXXFLAGS=-I/opt/local/include
export LDFLAGS=-L/opt/local/lib
cd "pdo_sqlsrv-$extendV" || exit 1
$phpize
./configure --with-php-config="$phpconfig"
sudo -S make
sudo -S make install
