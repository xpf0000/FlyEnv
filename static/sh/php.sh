#!/bin/zsh
brew install pkg-config apr apr-util argon2 aspell autoconf@2.13 freetds freetype gettext glib gmp jpeg libffi libpng libpq libsodium libzip oniguruma openldap sqlite tidy-html5 unixodbc webp zlib libiconv curl-openssl autoconf httpd curl libtool mcrypt openssl@1.1 pcre xz pcre2 gd krb5 bison re2c bzip2 libedit libxml2 libxslt mhash
if [ -n "$1" ]
then
  brew uninstall --ignore-dependencies -f "$1"
  brew install --build-from-source "$1"
fi

