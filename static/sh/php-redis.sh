#!/bin/bash
cachedir=$1
phpdir=$2
redisv=$3
arch=$4
cd $cachedir
curl -C - -O -s http://pecl.php.net/get/redis-$redisv.tgz
if [ -d "redis-$redisv" ]; then
 rm -rf "redis-$redisv"
fi
if [ -f "redis-$redisv.tgz" ]; then
  tar -zxf redis-$redisv.tgz
else
  exit 1
fi
export HOMEBREW_NO_AUTO_UPDATE=1
arch $arch brew install pkg-config autoconf automake libtool
prefix=$(brew --prefix)
export CFLAGS=-I$prefix/include
cd "redis-$redisv"
$phpdir/bin/phpize
./configure --with-php-config=$phpdir/bin/php-config
make
make install
