#!/bin/bash
cachedir=$1
phpdir=$2
yafv=$3
prefix=$(brew --prefix)
export CFLAGS=-I$prefix/include
cd $cachedir
curl -C - -O -s http://pecl.php.net/get/yaf-$yafv.tgz
if [ -d "yaf-$yafv" ]; then
 rm -rf "yaf-$yafv"
fi
if [ -f "yaf-$yafv.tgz" ]; then
  tar -zxf yaf-$yafv.tgz
else
  exit 1
fi
cd "yaf-$yafv"
$phpdir/bin/phpize
./configure --with-php-config=$phpdir/bin/php-config
make
make install
