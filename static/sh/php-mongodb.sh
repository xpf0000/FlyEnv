#!/bin/bash
cachedir=$1
phpdir=$2
mongodbv=$3
prefix=$(brew --prefix)
export CFLAGS=-I$prefix/include
cd $cachedir
echo http://pecl.php.net/get/mongodb-$mongodbv.tgz
curl -C - -O -s http://pecl.php.net/get/mongodb-$mongodbv.tgz
if [ -d "mongodb-$mongodbv" ]; then
 rm -rf "mongodb-$mongodbv"
fi
if [ -f "mongodb-$mongodbv.tgz" ]; then
  tar -zxf mongodb-$mongodbv.tgz
else
  exit 1
fi
cd "mongodb-$mongodbv"
$phpdir/bin/phpize
./configure --with-php-config=$phpdir/bin/php-config
make
make install
