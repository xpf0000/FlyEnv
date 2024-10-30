let num = 1
const echo = () => {
  console.log('num: ', num)
  num += 1
  setTimeout(echo, 2000)
}

echo()
