/** Keep the release classpath short and quote the complete value only once for Java. */
export function patchKafkaWindowsRunClass(content: string): string {
  return (
    content
      .replace(
        /for %%i in \("%BASE_DIR%\\libs\\\*"\) do \(\r?\n\s*call :concat "%%i"\r?\n\)/,
        'call :concat "%BASE_DIR%\\libs\\*"'
      )
      .replace(/^([ \t]*)set CLASSPATH="%~1"([ \t]*)(\r?)$/gim, '$1set "CLASSPATH=%~1"$2$3')
      .replace(
        /^([ \t]*)set CLASSPATH=%CLASSPATH%;"%~1"([ \t]*)(\r?)$/gim,
        '$1set "CLASSPATH=%CLASSPATH%;%~1"$2$3'
      )
      // goto :eof can hide the JVM failure; capture its exit status immediately.
      .replace(/^%COMMAND%(\r?\n)(?!exit \/b %ERRORLEVEL%)/m, '%COMMAND%$1exit /b %ERRORLEVEL%$1')
  )
}
