#!/bin/bash
cachedir=$1
phpdir=$2
mongodbv=$3
cd $cachedir
echo http://pecl.php.net/get/mongodb-$mongodbv.tgz
curl -C - -O -L -s http://pecl.php.net/get/mongodb-$mongodbv.tgz
if [ -d "mongodb-$mongodbv" ]; then
 rm -rf "mongodb-$mongodbv"
fi
if [ -f "mongodb-$mongodbv.tgz" ]; then
  tar -zxf mongodb-$mongodbv.tgz
else
  exit 1
fi
export HOMEBREW_NO_AUTO_UPDATE=1
arch $arch brew install pkg-config autoconf automake libtool
prefix=$(brew --prefix)
export CFLAGS=-I$prefix/include
cd "mongodb-$mongodbv"
$phpdir/bin/phpize
./configure --with-php-config=$phpdir/bin/php-config
make
make install
