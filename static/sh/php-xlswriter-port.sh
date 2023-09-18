#!/bin/bash
cachedir=$1
extendV=$2
password=$3
phpize=$4
phpconfig=$5
cd "$cachedir" || exit 1
curl -C - -O -L -s http://pecl.php.net/get/xlswriter-"$extendV".tgz
if [ -d "xlswriter-$extendV" ]; then
 echo "$password" | sudo -S rm -rf "xlswriter-$extendV"
fi
if [ -f "xlswriter-$extendV.tgz" ]; then
  tar -zxf xlswriter-"$extendV".tgz
else
  exit 1
fi
echo "y" | echo "$password" | sudo -S port install pkgconfig autoconf automake libtool
export CFLAGS=-I/opt/local/include
cd "xlswriter-$extendV" || exit 1
$phpize
./configure --with-php-config="$phpconfig"
echo "$password" | sudo -S make
echo "$password" | sudo -S make install
