#!/bin/bash
cachedir=$1
phpdir=$2
extendV=$3
arch=$4
cd "$cachedir" || exit 1
echo "Downloading xlswriter-"$extendV".tgz from http://pecl.php.net/get/xlswriter-"$extendV".tgz"
curl -C - -O -L http://pecl.php.net/get/xlswriter-"$extendV".tgz
if [ -d "xlswriter-$extendV" ]; then
  sudo -S rm -rf "xlswriter-$extendV"
fi
if [ -f "xlswriter-$extendV.tgz" ]; then
  tar -zxf xlswriter-"$extendV".tgz
else
  exit 1
fi
echo "Download complete. Now installing..."
export HOMEBREW_NO_AUTO_UPDATE=1
arch $arch brew install pkg-config autoconf automake libtool
prefix=$(brew --prefix)
export CFLAGS=-I$prefix/include
cd "xlswriter-$extendV" || exit 1
$phpdir/bin/phpize
./configure --with-php-config="$phpdir"/bin/php-config
make
make install
