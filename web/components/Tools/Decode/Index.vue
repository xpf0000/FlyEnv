<template>
  <div class="host-edit tool-decode">
    <div class="nav">
      <div class="left" @click="doClose">
        <yb-icon :svg="import('@/svg/delete.svg?raw')" class="top-back-icon" />
        <span class="ml-15">Decode/Encode</span>
      </div>
    </div>

    <div class="main-wapper">
      <div class="main">
        <el-input v-model="str" type="textarea" resize="none"></el-input>
        <div class="center">
          <el-button @click="ASCIIToUnicode"
            >ASCII
            <i style="font-size: 16px; margin: 0 3px" class="el-icon-right"></i> Unicode</el-button
          >
          <el-button @click="UnicodeToASCII"
            >Unicode
            <i style="font-size: 16px; margin: 0 3px" class="el-icon-right"></i> ASCII</el-button
          >
          <el-button @click="UnicodeToChinaStr"
            >Unicode
            <i style="font-size: 16px; margin: 0 3px" class="el-icon-right"></i> 中文</el-button
          >
          <el-button @click="ChinaStrToUnicode"
            >中文
            <i style="font-size: 16px; margin: 0 3px" class="el-icon-right"></i> Unicode</el-button
          >
          <el-button @click="Utf8ToChinaStr"
            >UTF-8
            <i style="font-size: 16px; margin: 0 3px" class="el-icon-right"></i> 中文</el-button
          >
          <el-button @click="ChinaStrToUtf8"
            >中文
            <i style="font-size: 16px; margin: 0 3px" class="el-icon-right"></i> UTF-8</el-button
          >
          <el-button @click="UrlDecode"
            >URL
            <i style="font-size: 16px; margin: 0 3px" class="el-icon-right"></i> Decode</el-button
          >
          <el-button @click="UrlEncode"
            >URL
            <i style="font-size: 16px; margin: 0 3px" class="el-icon-right"></i> Encode</el-button
          >
          <el-button @click="HexToString"
            >Hex
            <i style="font-size: 16px; margin: 0 3px" class="el-icon-right"></i> Decode</el-button
          >
          <el-button @click="StringToHex"
            >Hex
            <i style="font-size: 16px; margin: 0 3px" class="el-icon-right"></i> Encode</el-button
          >
          <el-button @click="HtmlDecode"
            >Html
            <i style="font-size: 16px; margin: 0 3px" class="el-icon-right"></i> Decode</el-button
          >
          <el-button @click="HtmlEncode"
            >Html
            <i style="font-size: 16px; margin: 0 3px" class="el-icon-right"></i> Encode</el-button
          >
        </div>
        <el-input v-model="str1" readonly type="textarea" resize="none"></el-input>
      </div>
    </div>
  </div>
</template>

<script>
  export default {
    components: {},
    props: {},
    data() {
      return {
        str: '',
        str1: ''
      }
    },
    computed: {},
    watch: {},
    created: function () {},
    methods: {
      doClose() {
        this.$emit('doClose')
      },
      ASCIIToUnicode() {
        let result = ''
        for (let i = 0; i < this.str.length; i += 1) {
          result += '&#' + this.str.charCodeAt(i) + ';'
        }
        this.str1 = result
      },
      UnicodeToASCII() {
        let result = ''
        let code = this.str.match(/&#(\d+);/g)
        if (code == null) {
          return result
        }
        for (let i = 0; i < code.length; i++) {
          result += String.fromCharCode(code[i].replace(/[&#;]/g, ''))
        }
        this.str1 = result
      },
      UnicodeToChinaStr() {
        let t = '{"t":"' + this.str + '"}'
        console.log('t: ', t)
        this.str1 = JSON.parse(t).t
      },
      ChinaStrToUnicode() {
        let unicodeStr = ''
        for (let i = 0; i < this.str.length; i++) {
          unicodeStr += '\\u' + this.str.charCodeAt(i).toString(16).padStart(4, '0000')
        }
        this.str1 = unicodeStr
      },
      Utf8ToChinaStr() {
        this.str1 = unescape(this.str.replace(/&#x/g, '%u').replace(/;/g, ''))
      },
      ChinaStrToUtf8() {
        // eslint-disable-next-line no-control-regex
        this.str1 = this.str.replace(/[^\u0000-\u00FF]/g, function ($0) {
          return escape($0).replace(/(%u)(\w{4})/gi, '&#x$2;')
        })
      },
      UrlEncode() {
        this.str1 = encodeURIComponent(this.str)
      },
      UrlDecode() {
        this.str1 = decodeURIComponent(this.str)
      },
      StringToHex() {
        const utf8encoder = new TextEncoder()
        const rb = utf8encoder.encode(this.str)
        let result = ''
        for (const b of rb) {
          result += '%' + ('0' + b.toString(16)).slice(-2)
        }
        this.str1 = result
      },
      HexToString() {
        this.str1 = decodeURIComponent(
          this.str.replace(/\s+/g, '') // remove spaces
        )
      },
      HtmlEncode: function () {
        let temp = document.createElement('div')
        temp.textContent !== undefined ? (temp.textContent = this.str) : (temp.innerText = this.str)
        let output = temp.innerHTML
        temp = null
        this.str1 = output
      },
      HtmlDecode: function () {
        let temp = document.createElement('div')
        temp.innerHTML = this.str
        let output = temp.innerText || temp.textContent
        temp = null
        this.str1 = output
      }
    }
  }
</script>
