#!/bin/bash
cachedir=$1
phpv=$2
redisv=$3
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
cd "redis-$redisv"
cellar=$(brew --Cellar)
$cellar/php@$phpv/$phpv/bin/phpize
./configure --with-php-config=$cellar/php@$phpv/$phpv/bin/php-config
make
make install
