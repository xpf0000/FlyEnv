#!/bin/bash
cachedir=$1
extendV=$2
phpize=$3
phpconfig=$4
cd "$cachedir" || exit 1
echo "downloading xlswriter-$extendV.tgz from http://pecl.php.net/get/xlswriter-$extendV.tgz"
curl -C - -O -L http://pecl.php.net/get/xlswriter-"$extendV".tgz
if [ -d "xlswriter-$extendV" ]; then
sudo -S rm -rf "xlswriter-$extendV"
fi
if [ -f "xlswriter-$extendV.tgz" ]; then
  tar -zxf xlswriter-"$extendV".tgz
else
  exit 1
fi
echo "download success. start install"
sudo -S port install -v pkgconfig autoconf automake libtool
export CFLAGS=-I/opt/local/include
cd "xlswriter-$extendV" || exit 1
$phpize
./configure --with-php-config="$phpconfig"
sudo -S make
sudo -S make install
