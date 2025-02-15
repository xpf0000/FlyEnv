# PHP icu4c issues

For PHP installed using Homebrew. Sometimes it may be encountered that it can be displayed in the Service panel But the color is red and it cannot start. It's show some error message like this:

```sh
/opt/homebrew/Cellar/php/8.2.10/sbin/php-fpm -n -v
Error: Command failed: /opt/homebrew/Cellar/php/8.2.10/sbin/php-fpm -n -v
dyld[1578]: Library not loaded: @loader_path/../../../../opt/icu4c/lib/libicuio.73.dylib
Referenced from: <8225FD7D-2159-3B46-AB67-18AFF8F24255> /opt/homebrew/Cellar/php/8.2.10/sbin/php-fpm
Reason: tried: '/opt/homebrew/Cellar/php/8.2.10/sbin/../../../../opt/icu4c/lib/libicuio.73.dylib' (no such file), '/usr/local/lib/libicuio.73.dylib' (no such file), '/usr/lib/libicuio.73.dylib' (no such file, not in dyld cache)
```

Don't worry, this is a common issue encountered when using homebrew

Essentially, it is because of the software installed using Homebrew. There are multiple software that depend on different versions of one software. The dependency project has been upgraded, while the software itself has not been upgraded

You need run this to update Homebrew and the software which has outdated

```sh
brew update && brew upgrade
```

After updating, if the problem still exists, reinstall the problematic software
