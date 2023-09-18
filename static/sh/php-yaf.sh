#!/bin/bash
cachedir=$1
phpdir=$2
yafv=$3
arch=$4
prefix=$(brew --prefix)
export CFLAGS=-I$prefix/include
cd "$cachedir" || exit 1
curl -C - -O -L -s http://pecl.php.net/get/yaf-"$yafv".tgz
if [ -d "yaf-$yafv" ]; then
 rm -rf "yaf-$yafv"
fi
if [ -f "yaf-$yafv.tgz" ]; then
  tar -zxf yaf-"$yafv".tgz
else
  exit 1
fi
export HOMEBREW_NO_AUTO_UPDATE=1
arch "$arch" brew install pkg-config autoconf automake libtool
prefix=$(brew --prefix)
export CFLAGS=-I$prefix/include
cd "yaf-$yafv" || exit 1
"$phpdir"/bin/phpize
./configure --with-php-config="$phpdir"/bin/php-config
make
make install
