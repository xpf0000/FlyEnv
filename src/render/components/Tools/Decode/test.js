var tools = {
  clear: function (array) {
    for (var i = 0; i < array.length; i++) {
      if (array[i]) {
        array[i].value = '';
        $(array[i]).siblings("b").show();
      }
    }
  },
  cssdesigner: function () {
    $(".cornerIco").click(function () {
      var obj = $(this).parents('ul');
      if (obj.find('.Csspad-widthEven').hasClass("autohide")) {
        obj.find('.Csspad-widthEven').removeClass('autohide');
        obj.find('.Csspad-widthOdd').addClass('autohide');
        $(this).addClass("cornerIco-open").removeClass("cornerIco");
      } else {
        obj.find('.Csspad-widthEven').addClass('autohide');
        obj.find('.Csspad-widthOdd').removeClass('autohide');
        $(this).addClass("cornerIco").removeClass("cornerIco-open");
      }
    });
    $("p.Typeleft a").click(function () {
      var index = $(this).index();
      $(this).addClass("TyLcurt").siblings().removeClass("TyLcurt");
      $("div.CssheadBoot div.QrCSSDesignerPad:eq(" + index + ")").removeClass("autohide").siblings().addClass("autohide");
    });
  },
  htmlcheck: function () {
    $("li.errorline a").click(function () {
      var line = $(this).attr("line");
      var htmltext = $('#htmltext');
      htmltext.focus();
      var linepos = htmltext.val().indexOf(line);
      SelectRange(htmltext[0], linepos, linepos);
    });
  },
  pagecode: function () {
    $("div.TabheadWrap a").click(function () {
      $(this).addClass("Tabon").siblings().removeClass("Tabon");
      $("#codecolor").val($(this).attr("val"));
      $("form").submit();
    });
  },
  webdebugger: {
    Webtest: function () {
      var win = window.open();
      win.document.open();
      win.document.write($('#content').val());
      win.document.close();
    },
    saveCode: function () {
      if (!document.all) {
        alert('此功能在IE有效');
        return;
      }
      var win = window.open('', '', 'top=10000,left=10000');
      win.document.write(document.all.content.innerText)
      win.document.execCommand('SaveAs', '', '文件名称.htm')
      win.close();
    },
    init: function () {
      var _this = this;
      $("#test").click(function () {
        _this.Webtest();
      });
      $("#select").click(function () {
        $("#content").select();
      });
      $("#clear").click(function () {
        $("#content").val("");
      });
      $("#save").click(function () {
        _this.saveCode();
      });
    }
  },
  htmlfilter: {
    fhtml: true,
    fjs: false,
    fcss: false,
    fself: false,
    Filter: function () {
      var s = jQuery("#content").val();
      if (!this.fhtml && !this.fjs && !this.fcss && !this.fself)
        this.fhtml = true;
      if (this.fjs)
        s = s.replace(/<\s*script[^>]*>(.|[\r\n])*?<\s*\/script[^>]*>/gi, '');
      if (this.fcss)
        s = s.replace(/<\s*style[^>]*>(.|[\r\n])*?<\s*\/style[^>]*>/gi, '');
      if (this.fhtml) {
        s = s.replace(/<\/?[^>]+>/g, '');
        s = s.replace(/\&[a-z]+;/gi, '');
        s = s.replace(/\s+/g, '\n');
      }
      if (this.fself)
        s = s.replace(new RegExp(jQuery("#preplace").val(), 'g'), $("#nextplace").val());
      jQuery("#result").val(s).removeClass("col-gray");
    },
    checked: function (obj) {
      var thisv = jQuery(obj).val();
      var set = jQuery(obj).prop("checked");
      if (thisv == 3) {
        if (set) {
          this.fhtml = false;
          this.fjs = false;
          this.fcss = false;
          this.fself = true;
          jQuery(obj).siblings("[name=type]").prop("checked", false);
          jQuery("#place").removeClass("autohide");
        }
        else {
          this.fhtml = true;
          this.fself = false;
          jQuery("#place").addClass("autohide");
          jQuery("input[name=type]").eq(1).prop("checked", true);
        }
      }
      else {
        jQuery("#place").addClass("autohide");
        jQuery("input[name=type]").eq(0).prop("checked", false);
        switch (thisv) {
          case "0": if (set) { this.fhtml = true; this.fself = false; } else { this.fhtml = false; } break;
          case "1": if (set) { this.fjs = true; this.fself = false; } else { this.fjs = false; } break;
          case "2": if (set) { this.fcss = true; this.fself = false; } else { this.fcss = false; } break;
        }
        var _this = this;
        _this.Filter();
      }
    },
    init: function (path) {
      var _this = this;
      jQuery("input[name=type]").bind("click", function () {
        _this.checked(this);
      });
      jQuery("#filter").click(function () {
        _this.Filter();
        jQuery("#result").siblings(".CentHid").hide();
      });
      jQuery("#clear").click(function () {
        jQuery("#content").val("");
        jQuery("#result").val("");
      });
      tools.clipfn(path);
    }
  },
  clipfn: function (path, id) {
    var _clip = "clip";
    if (id) _clip = id;
    var clip = new ZeroClipboard(getid(_clip), {
      moviePath: "/template/default/images/tool/ZeroClipboard.swf"
    });
    clip.on('complete', function (client, args) {
      alert("已成功复制到剪贴板！");
    });
  },
  checkbox: function (t) {
    $(".js-FilterItem li").click(function (e) {
      if (!$(this).hasClass("selected")) {
        $(this).addClass("selected");
        fn(this);
      } else {
        $(this).removeClass("selected");
        fn(this);
      }
    });
    function fn(obj) {
      if (t == "reg") {
        var index = $(obj).index();
        if (index == 5) {
          $("#chkboxhide input").eq(6).prop("checkbox", false).removeAttr("checked");
          $("#_chkboxhide li").eq(6).removeClass("selected");
        } else if (index == 6) {
          $("#chkboxhide input").eq(5).prop("checkbox", false).removeAttr("checked");
          $("#_chkboxhide li").eq(5).removeClass("selected");
        }
        $("#chkboxhide input").eq(index).click();
      }
      else
      if ($(obj).find("input").val()) $(obj).find("input").val(""); else $(obj).find("input").val($(obj).attr("val"));
    }
  },
  openweb: {
    openAttr: function (istest) {
      var address = $("input[name='url']").val();
      var op_tool = $("input[name='tool']").val() ? "toolbar=yes," : "";
      var op_loc = $("input[name='loc']").val() ? "location=yes," : "";
      var op_stat = $("input[name='stat']").val() ? "status=yes," : "";
      var op_menu = $("input[name='menu']").val() ? "menubar=yes," : "";
      var op_scroll = $("input[name='scroll']").val() ? "scrollbars=yes," : "";
      var op_resize = $("input[name='resize']").val() ? "resizable=yes," : "";
      var op_selfopen = $("input[name='selfopen']").val() ? "_self" : "newwindow";
      var op_width = $("input[name='width']").val() ? "width=" + $("input[name='width']").val() + "," : "";
      var op_height = $("input[name='height']").val() ? "height=" + $("input[name='height']").val() + "," : "";
      var op_L = $("input[name='L']").val() ? "left=" + $("input[name='L']").val() + "," : "";
      var op_T = $("input[name='T']").val() ? "top=" + $("input[name='T']").val() + "," : "";
      if (op_tool == "" && op_loc == "" && op_stat == "" && op_menu == "" && op_scroll == "" && op_resize == "" && op_width == "" && op_height == "" && op_L == "" && op_T == "") {
        tempopenstyle = "";
      } else {
        tempopenstyle = op_width + op_height + op_L + op_T + op_tool + op_loc + op_stat + op_menu + op_scroll + op_resize;
        tempopenstyle = tempopenstyle.substring(0, tempopenstyle.length - 1);
        tempopenstyle = tempopenstyle;
      }
      if (istest) {
        if (address == "http://" || !address) { $("#errorinfo").text("请输入URL！").show(); return; }
        window.open(address, op_selfopen, tempopenstyle);
        return;
      }
      $("#errorinfo").text("").hide();
      return "window.open('" + address + "','" + op_selfopen + "'" + (tempopenstyle ? ",'" + tempopenstyle + "'" : "") + ")";
    },
    init: function (path) {
      tools.checkbox();
      var _this = this;
      $("#gen").click(function () {
        $('#showcode').val(_this.openAttr()).removeClass("col-gray"); ;
      });
      $("#test").click(function () {
        _this.openAttr(true);
      });
      $("#clear").click(function () {
        jQuery("#showcode").val("");
      });
      tools.clipfn(path);
    }
  },
  regex: {
    regCommon: {
      chines: "[\\u4e00-\\u9fa5]", //中文
      doubleByte: "[^\\x00-\\xff]", //双字节（包含中文）
      nullLine: "\\s", //空白行
      email: "\\w[-\\w.+]*@([A-Za-z0-9][-A-Za-z0-9]+\\.)+[A-Za-z]{2,14}", //邮箱
      url: "^((https|http|ftp|rtsp|mms)?:\\/\\/)[^\\s]+", //网址（只验证是否包含某些前缀）
      phone: "0?(13|14|15|17|18|19)[0-9]{9}", //国内手机
      tel: "[0-9-()（）]{7,18}", //国内电话
      nFloat: "-([1-9]\\d*.\\d*|0.\\d*[1-9]\\d*)", //负浮点数
      interger: "-?[1-9]\\d*", //整型
      pFloat: "[1-9]\\d*.\\d*|0.\\d*[1-9]\\d*", //正浮点数 [1-9]\d*\.\d+|0\.\d*[1-9]\d*
      qq: "[1-9]([0-9]{5,11})", //QQ号
      postal: "\\d{6}", //国内邮政编码
      ip4: "(25[0-5]|2[0-4]\\d|[0-1]\\d{2}|[1-9]?\\d)\\.(25[0-5]|2[0-4]\\d|[0-1]\\d{2}|[1-9]?\\d)\\.(25[0-5]|2[0-4]\\d|[0-1]\\d{2}|[1-9]?\\d)\\.(25[0-5]|2[0-4]\\d|[0-1]\\d{2}|[1-9]?\\d)", //ip地址
      cardId: "\\d{17}[\\d|x]|\\d{15}", //身份证号码
      date: "\\d{4}(\\-|\\/|\.)\\d{1,2}\\1\\d{1,2}", //日期
      pInterger: "[1-9]\\d*", //正整数
      nInterger: "-[1-9]\\d*", //负整数
      userName: "[A-Za-z0-9_\\-\\u4e00-\\u9fa5]+"//用户名
    },
    checkReg: function () {
      var f = RegexPal.fields,
        o = f.options;
      onresize = function (e) {
        var isIE1 = !!window.ActiveXObject;
        var isIE61 = isIE1 && !window.XMLHttpRequest;
        f.input.field.style.height = "200px";
        //                if (isIE61) f.input.field.style.height = Math.max((window.innerHeight || document.documentElement.clientHeight) - 310, 268) + "px";
        //                else f.input.field.style.height = Math.max((window.innerHeight || document.documentElement.clientHeight) - 610, 268) + "px";
        f.search.setDimensions();
        f.input.setDimensions()
      };
      onresize();
      RegexPal.highlightSearchSyntax();
      RegexPal.highlightMatches();
      for (var flag in o.flags) {
        o.flags[flag].onclick = RegexPal.highlightMatches
      };
      o.highlightSyntax.onclick = RegexPal.highlightSearchSyntax;
      o.highlightMatches.onclick = RegexPal.highlightMatches;
      o.invertMatches.onclick = RegexPal.highlightMatches;
      function makeResetter(field) {
        return function () {
          field.clearBg();
          field.textbox.value = "";
          field.textbox.onfocus = null
        }
      };
    },
    itemClick: function (_this, flage) {
      $("#regCommon a").click(function () {
        var t = $(this).attr("t");
        var reg = new RegExp(_this.regCommon[t]);
        $("#searchText").val(_this.regCommon[t]).siblings(".CentHid").hide();
        var val = $("#inputText").val();
        if (flage) _this.checkReg();
      });
    },
    init: function () {
      tools.checkbox("reg");
      var _this = this;
      _this.itemClick(_this, true);
      _this.checkReg(_this);
      $("#repbtn").click(function () {
        var reptext = $("#reptext").val();
        var inputText = $("#inputText");
        var reg = $("#searchText").val();
        inputText.val(inputText.val().replace(new RegExp(reg, "gi"), reptext));
        _this.checkReg();
      });
      $("#inputText").keyup(function () { $("#inputText").height($("#inputBg").height()); });
      $("#inputText,#searchText").bind("keyup keydown blur", function () {
        if ($("#inputText").val().indexOf('tool.chinaz.com|888') >= 0) return;
        var reg = $("#searchText").val();
        var val = $("#inputText").val();
        if (!reg) {
          $("#result").hide(); return;
        }
        var arr = []
        try {
          arr = val.match(new RegExp(reg, 'g'));
        } catch (e) {
          $("#result").hide(); return;
        }
        if (!arr) {
          $("#result").hide(); return;
        }
        $("#result").val("");
        var str = "";
        for (var i = 0; i < arr.length; i++) {
          str += arr[i] + "\n";
        }
        $("#result").show();
        $("#result textarea").val(str);
        $("#result p").html("匹配到 <strong>" + arr.length + "</strong> 条结果：");
      });
    },
    languageCode: {
      js: "var pattern = /{0}/,\n\tstr = '{1}';\nconsole.log(pattern.test(str));",
      php: "$str = '{1}';\n$isMatched = preg_match('/{0}/', $str, $matches);\nvar_dump($isMatched, $matches);",
      go: "package main\n\nimport (\n\t\"fmt\"\n\t\"regexp\"\n)\n\nfunc main() {\n\tstr := \"{1}\"\n\tmatched, err := regexp.MatchString(\"{0}\", str)\n\tfmt.Println(matched, err)\n}",
      rb: "pattern = /{0}/\nstr = '{1}'\np pattern.match(str)",
      py: "import re\npattern = re.compile(ur'{0}')\nstr = u'{1}'\nprint(pattern.search(str))",
      java: "import java.util.regex.Matcher;\nimport java.util.regex.Pattern;\n\npublic class RegexMatches {\n\t\n\tpublic static void main(String args[]) {\n\t\tString str = \"{1}\";\n\t\tString pattern = \"{0}\";\n\n\t\tPattern r = Pattern.compile(pattern);\n\t\tMatcher m = r.matcher(str);\n\t\tSystem.out.println(m.matches());\n\t}\n\n}"
    },
    initgenerate: function () {
      var _this = this;
      _this.itemClick(_this);
      $("#test").click(function () {
        var pattern = $("#searchText").val();
        if (!pattern) return;
        var textarealist = $("#languagelist textarea");
        for (var i = 0; i < textarealist.length; i++) {
          var textarea = $(textarealist[i]);
          var language = textarea.attr("id");
          if (language == 'go' || language == 'java') pattern.replace(/\\/gi, "\\");
          textarea.val(_this.languageCode[language].format(pattern, ""));
        }
        $("#languagelist").removeClass("autohide");
      });


    }
  },
  transcoding: {
    fullhalf: {
      ///全角空格为12288，半角空格为32
      ///其他字符半角(33-126)与全角(65281-65374)的对应关系是：均相差65248
      //半角转换为全角函数
      ToFull: function () {
        var txtstring = $('#content').val();
        if (txtstring == '') {
          alert("请输入要转换的字符串");
          return;
        }
        var tmp = "";
        for (var i = 0; i < txtstring.length; i++) {
          if (txtstring.charCodeAt(i) == 32) {
            tmp = tmp + String.fromCharCode(12288);
          }
          else if (txtstring.charCodeAt(i) < 127) {
            tmp = tmp + String.fromCharCode(txtstring.charCodeAt(i) + 65248);
          }
          else
            tmp = tmp + String.fromCharCode(txtstring.charCodeAt(i));
        }
        $('#result').val(tmp);
      },
      //全角转换为半角函数
      ToHalf: function () {
        var str = $('#content').val();
        if (str == '') {
          alert('请输入要转换的字符');
          return;
        }
        var tmp = "";
        for (var i = 0; i < str.length; i++) {
          if (str.charCodeAt(i) > 65280 && str.charCodeAt(i) < 65375) {
            tmp += String.fromCharCode(str.charCodeAt(i) - 65248);
          }
          else if (str.charCodeAt(i) == 12288) {
            tmp += String.fromCharCode(32);
          }
          else {
            tmp += String.fromCharCode(str.charCodeAt(i));
          }
        }
        $('#result').val(tmp);

      },
      init: function () {
        var _this = this;
        $("#tohalf").click(function () {
          _this.ToHalf();
          if (jQuery("#result").val()) $("#result").siblings().hide();
        });
        $("#tofull").click(function () {
          _this.ToFull();
          if (jQuery("#result").val()) $("#result").siblings().hide();
        });
        $("#clear").click(function () {
          $("textarea").val("");
        });
        $("textarea").keydown(function () {
          $(this).removeClass("col-gray");
        });
      }
    },
    wordspell: function () {
      var forms = document.forms[0];
      forms.content.onclick = function () {
        $(this).removeClass("col-gray");
      };
      forms.trans.onclick = function () {
        var str = toPinyin({ str: forms.content.value, dz: forms.hidesel.value, sym: forms.sym.checked, sym1: forms.sym1.checked, sym2: forms.sym2.checked });
        forms.result.value = str;
        if (jQuery("textarea[name=\"result\"]").val()) $("textarea[name=\"result\"]").siblings().hide();
        $(forms.result).removeClass("col-gray");
      }
      var clear = getid("clear");
      clear.onclick = function () {
        forms.result.value = '';
        forms.content.value = '';
      }
    },
    gbbig: function () {
      var forms = document.forms[0];
      forms.tosim.onclick = function () {
        convert(0); $(forms.result).removeClass("col-gray");
        if (jQuery("#result").val()) $("#result").siblings().hide();
      }
      forms.totra.onclick = function () {
        convert(1); $(forms.result).removeClass("col-gray");
        if (jQuery("#result").val()) $("#result").siblings().hide();
      }
      forms.toother.onclick = function () {
        convert(2); $(forms.result).removeClass("col-gray");
        if (jQuery("#result").val()) $("#result").siblings().hide();
      }
      forms.clear.onclick = function () {
        forms.result.value = '';
        forms.textarea.value = '';
      }
    },
    pinyindictionary: function (path) {
      var forms = getid('fm');
      forms.content.onclick = function () {
        $(this).removeClass("col-gray");
      };
      forms.seach.onclick = function () {
        trans(); $(forms.result).removeClass("col-gray");
        if (jQuery("#result").val()) $("#result").siblings().hide();
      }
      forms.clear.onclick = function () {
        forms.result.value = '';
        forms.content.value = '';
      }
      tools.clipfn(path);
    },
    lowtoupp: function (path) {
      tools.clipfn(path, "clip");
      tools.clipfn(path, "clip1");
      var forms = getid('fm');
      //forms.num.onkeydown = function (e) { entNumber(e); $(forms.trans).removeClass("col-gray"); $(forms.num).removeClass("col-gray"); }
      $("#num").keydown(function (e) {
        entNumber(e);
        $(forms.trans).removeClass("col-gray");
        $(forms.num).removeClass("col-gray");
      });
      forms.seach.onclick = function () {
        TransConvert();
        if (jQuery("#trans").val()) $("#trans").siblings().hide();
      }
      forms.clear.onclick = function () { tools.clear([getid('trans'), getid('num')]); }
      forms.toupp.onclick = function () {
        englishConvert('touppercase'); $(forms.content).removeClass("col-gray");
        if (jQuery("#result").val()) $("#result").siblings().hide();
      }
      forms.tolow.onclick = function () {
        englishConvert('tolowercase'); $(forms.content).removeClass("col-gray");
        if (jQuery("#result").val()) $("#result").siblings().hide();
      }
      forms.firstupp.onclick = function () {
        englishConvert('touppercaseF'); $(forms.content).removeClass("col-gray");
        if (jQuery("#result").val()) $("#result").siblings().hide();
      }
      forms.clear1.onclick = function () { tools.clear([getid('content')]); }
      forms.content.onclick = function () { $(this).removeClass("col-gray"); }
    },
    qrcode: {
      loadSWF: function () {
        var swfu = new SWFUpload({
          upload_url: "/ajaxseo.aspx?t=pload",
          file_size_limit: "100 KB",
          file_types: "*.jpg;*.gif;*.png;*.jpe;*.jpeg",
          file_upload_limit: "50",
          file_queue_limit: 1,
          file_dialog_start_handler: fileDialogStart,
          file_queued_handler: fileQueued,
          file_queue_error_handler: fileQueueError,
          file_dialog_complete_handler: fileDialogComplete,
          upload_progress_handler: uploadProgress,
          upload_error_handler: uploadError,
          upload_success_handler: uploadSuccess,
          upload_complete_handler: uploadComplete,
          //button_image_url: "/template/default/images/public/tool-pus.png",
          button_width: 213,
          button_height: 80,
          button_placeholder_id: "buttonPlaceHolder",
          //button_text: "选择二维码图片",
          button_text_style: "",
          /*button_text_top_padding: 3,
          button_text_left_padding: 12,*/
          button_window_mode: SWFUpload.WINDOW_MODE.TRANSPARENT,
          button_cursor: SWFUpload.CURSOR.HAND,
          flash_url: "/template/default/js/swfup/swfupload.swf",
          custom_settings: {
            progressTarget: "fsUploadProgress",
            cancelButtonId: "btnCancel"
          },
          debug: false
        });
      },
      init: function () {
        var _this = this;
        jQuery("#txtarea").focus(function () {
          var v = jQuery(this).val();
          $(this).removeClass("col-gray");
          if (v == '200字符以内') jQuery(this).val('')
        }).blur(function () {
          var v = jQuery(this).val();
          if (v == '') {
            jQuery(this).val('200字符以内');
            $(this).addClass("col-gray");
          }
        }).keyup(function () {
          var v = jQuery(this).val();
          var length = jQuery.trim(v).length;
          if (length > 199) {
            jQuery(this).val(v.substr(0, 200));
            jQuery("#fontnum").html('200');
            return
          };
          jQuery("#fontnum").html(length)
        });
        _this.loadSWF();
        $("#generate").click(function () {
          if (!$("#decodingbox").hasClass("autohide")) {
            $("#decodingbox").addClass("autohide");
            $("#generatebox").removeClass("autohide");
            if ($("#imgdiv").length) $("#imgdiv").removeClass("autohide");
            $("#fsUploadProgress").html('');
            $(this).addClass("currtBtn").removeClass("LinkBrn");
            $("#decoding").addClass("LinkBrn").removeClass("currtBtn");
          } else {
            $("form").submit();
          }
        });
        $("#decoding").click(function () {
          $("#generatebox").addClass("autohide");
          $("#decodingbox").removeClass("autohide");
          if ($("#imgdiv").length) $("#imgdiv").addClass("autohide");
          $(this).addClass("currtBtn").removeClass("LinkBrn");
          $("#generate").addClass("LinkBrn").removeClass("currtBtn");
        });
      }
    },
    utf_8: function () {
      $("#conv").click(function () {
        $("#result").val($("#content").val().replace(/[^\u0000-\u00FF]/g, function ($0) { return escape($0).replace(/(%u)(\w{4})/gi, "&#x$2;") }));
        if (jQuery("#result").val()) $("#result").siblings().hide();
      });
      $("#res").click(function () {
        $("#content").val(unescape($("#result").val().replace(/&#x/g, '%u').replace(/;/g, '')));
        if (jQuery("#content").val()) $("#content").siblings().hide();
      });
      $("#clear").click(function () {
        tools.clear([getid("content"), getid("result")]);
        $(".CentHid").show();
      });
    }
  },
  other: {
    wordcounter: {
      wordStats: {
        unsortedWords: null,
        topWords: null,
        topWeights: null,
        _computed: false,
        addWords: function (str, weight) {
          if (str && str.length > 1) {
            var keywords = $("#keywordstxt").val().split(',');
            var regstr = "";
            //keywords = this.bubbleSort(keywords);
            keywords = keywords.trimArray();
            for (var i = 0; i < keywords.length; i++) {
              var kw = keywords[i].replace(/(\\)/g, "\\").replace(/(\^)/g, "\\^").replace(/(\$)/g, "\\$").replace(/(\.)/g, "\\.").replace(/(\*)/g, "\\*").replace(/(\?)/g, "\\?").replace(/(\+)/g, "\\+");
              if (kw) {
                regstr += "(" + kw + ")";
                if (i < keywords.length - 1)
                  regstr += "|";
              }
            }
            if (regstr)
              try {
                this.getWords(str.toLowerCase(), new RegExp(regstr, "gi"), weight);
              } catch (e) {

              }
          }
        },
        bubbleSort: function (arr) {
          for (var i = 0; i < arr.length; i++) {
            for (var j = i; j < arr.length; j++) {
              if (arr[i].length < arr[j].length) {
                var temp = arr[i];
                arr[i] = arr[j];
                arr[j] = temp;
              }
            }
          }
          return arr;
        },
        addWordsFromTextNodes: function (node, weight) {
          var nodes = node.childNodes;
          for (var i = 0, j = nodes.length; i < j; i++) {
            if (nodes[i].nodeType == 3)
              this.addWords(nodes[i].nodeValue, weight);
          }
        },
        getWords: function (words, reg, weight) {
          this.unsortedWords = new Array();
          var arr = words.match(reg);
          if (arr == null) return;
          for (var i = 0; i < arr.length; i++) {
            if (arr[i] != ',') {
              var word = arr[i].toLowerCase();
              if (this.unsortedWords[word])
                this.unsortedWords[word] += weight;
              else this.unsortedWords[word] = weight;
            }
          }
        },
        computeWords: function (elem) {
          if (!elem) elem = window.document;
          this.unsortedWords = new Array();
          if (elem.is("textarea")) {
            this.addWords(elem.val(), 1);
            return;
          }
          this.addWords($('title', elem).text(), 20); wordstats = this; $('h1', elem).each(function () {
            wordstats.addWordsFromTextNodes($(this).get(0), 15);
          }); $('h2', elem).each(function () {
            wordstats.addWordsFromTextNodes($(this).get(0), 10);
          }); $('h3, h4, h5, h6', elem).each(function () {
            wordstats.addWordsFromTextNodes($(this).get(0), 5);
          }); $('strong, b, em, i', elem).each(function () {
            wordstats.addWordsFromTextNodes($(this).get(0), 3);
          }); $('p, div, th, td, li, a, span', elem).each(function () {
            wordstats.addWordsFromTextNodes($(this).get(0), 2);
          }); $('img', elem).each(function () {
            wordstats.addWords($(this).attr('alt'), 1);
            wordstats.addWords($(this).attr('title'), 1);
          }); this._computed = true;
        },
        computeTopWords: function (count, elem) {
          if (!this._computed)
            this.computeWords(elem);
          this.topWords = new Array();
          this.topWeights = new Array();
          this.topWeights.push(0);
          for (word in this.unsortedWords) {
            for (var i = 0; i < count; i++) {
              if (this.unsortedWords[word] > this.topWeights[i]) {
                this.topWeights.splice(i, 0, this.unsortedWords[word]);
                this.topWords.splice(i, 0, word);
                break;
              }
            }
          }
        }, clear: function () {
          this.unsortedWords = this.sortedWords = this.topWords = this.topWeights = null;
          this._computed = false;
        }
      },
      displayCount: function (count) {
        if (count['words'] == 1) {
          wordOrWords = " Word";
        } else {
          wordOrWords = " Words";
        }
        if (count['chars'] == 1) {
          charOrChars = " Character";
        } else {
          charOrChars = " Characters";
        }
        str = '<strong class="col-blue02 pr10">{5}</strong><span class="pr40">Total</span><strong class="col-blue02 pr10">{0}</strong><span class="pr40">{1}</span><strong class="col-blue02 pr10">{2}</strong><span class="pr40">{3}</span><strong class="col-blue02 pr10">{4}</strong><span>Chinese</span>';
        $(".counted").html(str.format(count['words'], wordOrWords, count['chars'], charOrChars, count['chinese'], $("#box").val().length));
      },
      displayTextBoxes: function (count) {
        $("#word_count").text(count['words']);
        $("#character_count").text(count['chars']);
        $("#character_count_no_spaces").text(count['chars_no_spaces']);
        $("#chinese_count_no_spaces").text(count['chinese']);
        $("#sentence_count").text(count['sentences']);
        $("#paragraph_count").text(count['paragraphs']);
        $("#avg_sentence_words").text(count['avg_sentence_words']);
        $("#avg_sentence_chars").text(count['avg_sentence_chars']);
      },
      countWords: function (text, language) {
        if (language == 2) {
          var words = text.match(/\S+/g);
        } else {
          var words = text.replace(/[,;.!:—\/]/g, ' ').replace(/[^a-zA-Z\d\s&:]/g, '').match(/\S+/g);
        }
        return (words !== null ? words.length : 0);
      },
      countChinese: function (text) {
        iTotal = 0;
        for (i = 0; i < text.length; i++) {
          var c = text.charAt(i);
          if (c.match(/[\u4e00-\u9fa5]/)) {
            iTotal++;
          }
        }
        return iTotal;
      },
      wordCountInternational: function () {
        var _this = tools.other.wordcounter;
        var box = $("#box");
        var count = [];
        count['words'] = _this.countWords(box.val(), 0);
        chars = box.val().match(/(?:[^\r\n]|\r(?!\n))/g);
        count['chars'] = (chars !== null ? chars.length : 0);
        count['chinese'] = _this.countChinese(box.val());
        chars_no_spaces = box.val().match(/\S/g);
        count['chars_no_spaces'] = (chars_no_spaces !== null ? chars_no_spaces.length : 0);
        sentences = box.val().match(/[^.!?\s][^.!?]*(?:[.!?](?!['"]?\s|$)[^.!?]*)*[.!?]?['"]?(?=\s|$)/g);
        count['sentences'] = (sentences !== null ? sentences.length : 0);
        paragraphs = box.val().match(/(\n\n?|^).*?(?=\n\n?|$)/g);
        count['paragraphs'] = (box.val() != '' ? (paragraphs !== null ? paragraphs.length : 0) : 0);
        count['avg_sentence_words'] = (box.val() != '' ? Math.ceil(count['words'] / count['sentences']) : 0);
        count['avg_sentence_chars'] = (box.val() != '' ? Math.ceil(count['chars'] / count['sentences']) : 0);
        _this.displayCount(count);
        _this.displayTextBoxes(count);
      },
      keywordDensity: function () {
        var max = 1000;
        var stats = tools.other.wordcounter.wordStats;
        var _this = tools.other.wordcounter;
        stats.computeTopWords(max, $('#box'));
        var density_list = $("#density_list");
        density_list.empty();
        var text = '';
        var percentage;
        $("#keywords li:first").nextAll().remove();
        for (i = 0; i < stats.topWords.length; i++) {
          var percentage = (100 * (stats.topWeights[i] * stats.topWords[i].length / $("#box").val().length)).toFixed(0);
          var str = '<div class="w30-0{3}">{0}</div><div class="w15-0 col-blue02">{1}({2}%)</div>';
          if (i % 2 == 0) {
            str = '<li class="DelListCent DelRLlist bor-b1s">' + str + '</li>';
            $("#keywords").append(str.format(stats.topWords[i].html2Escape(), stats.topWeights[i], percentage, ''));
          } else {
            $("#keywords li:last").append(str.format(stats.topWords[i].html2Escape(), stats.topWeights[i], percentage, ' bor-l1s'));
          }
        }
        stats.clear();
      },
      init: function () {
        var _this = this;
        $("#box").bind("keypress keyup keydown blur focus change load", _this.wordCountInternational);
        $("#box").bind("keypress keyup keydown blur focus change load", _this.keywordDensity);
        $("#clear").click(function () {
          tools.clear([getid('box')]);
        });
        $("#keywordstxt").bind("keypress keyup keydown blur focus change load", _this.keywordDensity);
        $("#clkshowbox").click(function () {
          var showbox = $("#showbox");
          if (showbox.hasClass("autohide"))
            showbox.removeClass("autohide");
          else
            showbox.addClass("autohide");
        });
      }
    },
    httptest: function () {
      var pramsHtml = '<div class="portTestWrap clearfix pt20">';
      pramsHtml += '<div class="Porname"><input type="text" class="TitInput _WrapHid w240" name="paramsname" value="{0}" /><b class="search-hint CentHid mt5" style="display:{2}">参数名</b></div>';
      pramsHtml += '<div class="Porname ml10"><input type="text" class="TitInput _WrapHid w360" name="paramsval" value="{1}" /><b class="search-hint CentHid mt5" style="display:{2}">值</b></div>';
      pramsHtml += '<div class="fl pl10"><input type="button" value="删除" class="TitInBtn w70 removeparams" /></div></div>';
      $("#addparams").click(function () {
        if ($("#isRAW").prop("checked")) {
          $(".portTestWrap").remove();
          $("#RAW").removeClass("autohide");
        } else {
          $("#RAW").addClass("autohide");
          $("#totest").after(pramsHtml.format("", "", "block"));
          $("input.removeparams").click(function () {
            $(this).parent().remove();
          });
          $("._WrapHid").each(function () {
            checkFocus({
              obj_input: $(this),
              msgBox: $(this).siblings(".CentHid"),
              Tip: "CentHid"
            });
            clearInput({
              obj_input: $(this),
              msgBox: $(this).siblings("._CentHid"),
              Tip: "_CentHid"
            });
          });
        }
        $("input.removeparams").off("click");
        $("input.removeparams").click(function () {
          $(this).parents(".portTestWrap").remove();
        });
      });
      $("#OK").click(function () {
        $("#hideRAW").val($("#RAWval").val());
        $("#RAW").addClass("autohide");
        $(".portTestWrap").remove();
        var arr = $("#RAWval").val().queryString();
        for (var i = 0; i < arr.length; i++) {
          $("#totest").after(pramsHtml.format(arr[i].k, arr[i].v, "none"));
        }
      });
    }
  },
  encryptDecode: {
    base64: function () {
      /*$("#conv").click(function () {
      var str = CryptoJS.enc.Utf8.parse(jQuery("#content").val());
      var base64 = CryptoJS.enc.Base64.stringify(str);
      jQuery("#result").val(base64);
      if (jQuery("#result").val()) $("#result").siblings().hide();
      });
      $("#res").click(function () {
      var words = CryptoJS.enc.Base64.parse(jQuery("#result").val());
      try {
      jQuery("#content").val(words.toString(CryptoJS.enc.Utf8));
      } catch (e) {
      jQuery("#content").val("格式有误");
      }
      if (jQuery("#content").val()) $("#content").siblings().hide();
      });*/
      $("#conv").click(function () {
        jQuery("#result").val(encode64(jQuery("#content").val()));
        jQuery("#content").val(jQuery("#content").val().replace(/(^\n|\n$)/g, '').replace(/\n{2,}/, '\n'));
        if (jQuery("#result").val()) $("#result").siblings().hide();
      });
      $("#res").click(function () {
        jQuery("#content").val(decode64(jQuery("#result").val()));
        jQuery("#result").val(jQuery("#result").val().replace(/(^\n|\n$)/g, '').replace(/\n{2,}/, '\n'));
        if (jQuery("#content").val()) $("#content").siblings().hide();
      });
      $("#clear").click(function () {
        tools.clear([getid("content"), getid("result")]);
        $(".CentHid").show();
      });
      var keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
      function encode64(val) {
        val = getVal(val);
        var output = "";
        for (var i = 0; i < val.length; i++) {
          output += enWhile(escape(val[i].trim()));
          if (i < val.length - 1)
            output += "\n";
        }
        return output;
      }
      function getVal(val) {
        var val = val.replace(/\n/g, '|');
        if (val.indexOf('|') >= 0)
          val = val.split('|');
        else
          val = [val];
        return val.trimArray();
      }
      function enWhile(input) {
        var output = "";
        var chr1, chr2, chr3 = "";
        var enc1, enc2, enc3, enc4 = "";
        var i = 0;
        do {
          chr1 = input.charCodeAt(i++);
          chr2 = input.charCodeAt(i++);
          chr3 = input.charCodeAt(i++);
          enc1 = chr1 >> 2;
          enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
          enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
          enc4 = chr3 & 63;
          if (isNaN(chr2)) {
            enc3 = enc4 = 64;
          }
          else if (isNaN(chr3)) {
            enc4 = 64;
          }
          output = output + keyStr.charAt(enc1) + keyStr.charAt(enc2) + keyStr.charAt(enc3) + keyStr.charAt(enc4);
          chr1 = chr2 = chr3 = "";
          enc1 = enc2 = enc3 = enc4 = "";
        } while (i < input.length);
        return output
      }
      function decode64(val) {
        val = getVal(val);
        var output = "";
        for (var i = 0; i < val.length; i++) {
          output += deWhile(val[i].trim());
          if (i < val.length - 1)
            output += "\n";
        }
        return output;
      }
      function deWhile(input) {
        var output = "";
        var chr1, chr2, chr3 = "";
        var enc1, enc2, enc3, enc4 = "";
        var i = 0;
        var base64test = /[^A-Za-z0-9\+\/\=]/g;
        if (base64test.exec(input)) {
          return "不是有效的Base64编码";
        }
        input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");
        do {
          enc1 = keyStr.indexOf(input.charAt(i++));
          enc2 = keyStr.indexOf(input.charAt(i++));
          enc3 = keyStr.indexOf(input.charAt(i++));
          enc4 = keyStr.indexOf(input.charAt(i++));
          chr1 = (enc1 << 2) | (enc2 >> 4);
          chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
          chr3 = ((enc3 & 3) << 6) | enc4;
          output = output + String.fromCharCode(chr1);
          if (enc3 != 64) {
            output = output + String.fromCharCode(chr2);
          }
          if (enc4 != 64) {
            output = output + String.fromCharCode(chr3);
          }
          chr1 = chr2 = chr3 = "";
          enc1 = enc2 = enc3 = enc4 = "";
        } while (i < input.length);
        return unescape(output);
      }
    },
    unicode: function () {
      //ASCII 转换 Unicode
      $("#asicctounicode").click(function () {
        if (document.getElementById('content').value == '') {
          alert('文本框中没有代码！');
          return;
        }
        document.getElementById('result').value = '';
        for (var i = 0; i < document.getElementById('content').value.length; i++)
          result.value += '&#' + document.getElementById('content').value.charCodeAt(i) + ';';
        document.getElementById('content').focus();
        if (jQuery("#result").val()) $("#result").siblings().hide();
      });
      //Unicode 转换 ASCII
      $("#unicodetoasicc").click(function () {
        var code = document.getElementById('content').value.match(/&#(\d+);/g);
        if (code == null) {
          alert('文本框中没有合法的Unicode代码！'); document.getElementById('content').focus();
          return;
        }
        document.getElementById('result').value = '';
        for (var i = 0; i < code.length; i++)
          document.getElementById('result').value += String.fromCharCode(code[i].replace(/[&#;]/g, ''));
        document.getElementById('content').focus();
        if (jQuery("#result").val()) $("#result").siblings().hide();
      });
      $("#clear").click(function () {
        tools.clear([getid("content"), getid("result")]);
        $(".CentHid").show();
      });
    },
    htmlEncode: function (key) {
      $(".GuoLvCbtn input[name]").click(function () {
        var name = $(this).attr("name"); // $(this)表示获取当前被点击元素的name值
        var content = $.trim($('#content').val());
        if (content == '') {
          layer.msg('请输入要转换的html字符串！');
          return;
        }
        if (content.length > 10000) {
          $('#content').val("该功能暂不支持超过1w字符的大文本操作，请将文本分段后再操作！");
          return;
        }
        var index = null;
        $.ajax({
          type: 'POST',
          url: '/AjaxSeo.aspx?t=htmlencode',
          data: { enkey: key, type: name, content: content },
          beforeSend: function () {
            index = layer.load();
          },
          dataType: 'json',
          success: function (json) {
            layer.close(index);
            if (json.StateCode == 0) {
              layer.msg(json.Message);
            }
            else {
              $("#content").val(json.Result);
            }
          }
        });
      });
    },
    scriptEncode: function () {
      $("#jsencode").click(function () {
        var v = getid('ipt').value;
        if (!v) return;
        var es = escape(v);
        getid('result').value = "document.write(unescape('{0}'));".format(es);
        if (jQuery("#result").val()) $("#result").siblings().hide();
      });
      $("#jsdecode").click(function () {
        var v = getid('result').value;
        var regex = /unescape\('([a-z%0-9].*)'\)/i;
        if (v.match(regex)) {
          getid('ipt').value = unescape(RegExp.$1);
        }
        if (jQuery("#ipt").val()) $("#ipt").siblings().hide();
      });
      $("#clear").click(function () {
        tools.clear([getid("ipt"), getid("result")]);
        $(".CentHid").show();
      });
    },
    textEncrypt: function () {
      $("#encrypt").click(function () {
        var v = jQuery('input[name="encrypt_type"]').val();
        if (!v) return;
        switch (v) {
          case "aes":
            jQuery("#result").val(CryptoJS.AES.encrypt(jQuery("#content").val(), jQuery("#pwd").val()));
            break;
          case "des":
            jQuery("#result").val(CryptoJS.DES.encrypt(jQuery("#content").val(), jQuery("#pwd").val()));
            break;
          case "rabbit":
            jQuery("#result").val(CryptoJS.Rabbit.encrypt(jQuery("#content").val(), jQuery("#pwd").val()));
            break;
          case "rc4":
            jQuery("#result").val(CryptoJS.RC4.encrypt(jQuery("#content").val(), jQuery("#pwd").val()));
            break;
          case "tripledes":
            jQuery("#result").val(CryptoJS.TripleDES.encrypt(jQuery("#content").val(), jQuery("#pwd").val()));
            break;
        }
        if (jQuery("#result").val()) $("#result").siblings().hide();
      });
      $("#decrypt").click(function () {
        switch (jQuery('input[name="encrypt_type"]').val()) {
          case "aes":
            jQuery("#content").val(CryptoJS.AES.decrypt(jQuery("#result").val(), jQuery("#pwd").val()).toString(CryptoJS.enc.Utf8));
            break;
          case "des":
            jQuery("#content").val(CryptoJS.DES.decrypt(jQuery("#result").val(), jQuery("#pwd").val()).toString(CryptoJS.enc.Utf8));
            break;
          case "rabbit":
            jQuery("#content").val(CryptoJS.Rabbit.decrypt(jQuery("#result").val(), jQuery("#pwd").val()).toString(CryptoJS.enc.Utf8));
            break;
          case "rc4":
            jQuery("#content").val(CryptoJS.RC4.decrypt(jQuery("#result").val(), jQuery("#pwd").val()).toString(CryptoJS.enc.Utf8));
            break;
          case "tripledes":
            jQuery("#content").val(CryptoJS.TripleDES.decrypt(jQuery("#result").val(), jQuery("#pwd").val()).toString(CryptoJS.enc.Utf8));
            break;
        }
        if (jQuery("#content").val()) $("#content").siblings().hide();
      });
      $("#clear").click(function () {
        tools.clear([getid("content"), getid("result")]);
        $(".CentHid").show();
      });
    },
    nativeAscii: function () {
      $("#nativeConvertAscii").click(function () {
        var nativecode = getid("nativecode").value.split("");
        var ascii = "";
        for (var i = 0; i < nativecode.length; i++) {
          var code = Number(nativecode[i].charCodeAt(0));
          if (!document.getElementById("ignoreLetter").checked || code > 127) {
            var charAscii = code.toString(16);
            charAscii = new String("0000").substring(charAscii.length, 4) + charAscii;
            ascii += "\\u" + charAscii;
          } else {
            ascii += nativecode[i];
          }
        }
        getid("asciicode").value = ascii;
        if (jQuery("#asciicode").val()) $("#asciicode").siblings().hide();
      });

      $("#asciiConvertNative").click(function () {
        var asciicode = getid("asciicode").value.split("\\u");
        var nativeValue = asciicode[0];
        for (var i = 1; i < asciicode.length; i++) {
          var code = asciicode[i];
          nativeValue += String.fromCharCode(parseInt("0x" + code.substring(0, 4)));
          if (code.length > 4) {
            nativeValue += code.substring(4, code.length);
          }
        }
        getid("nativecode").value = nativeValue;
        if (jQuery("#nativecode").val()) $("#nativecode").siblings().hide();
      });
      $("#clear").click(function () {
        tools.clear([getid("nativecode"), getid("asciicode")]);
        $(".CentHid").show();
      });
    },
    unixtime: {
      currentTimeActive: 1,
      unixTimer: 0,
      appendZero: function (obj) { //日期不足两位补0
        if (obj < 10) return "0" + "" + obj;
        else return obj;
      },
      unix2human: function () {
        var unixTimestamp = document.unix.timestamp.value.trim();
        if (!unixTimestamp) {
          layer.msg("时间戳格式不正确");
          return;
        }
        unixTimestamp = parseInt(unixTimestamp);
        var isms = $("#unixtoutc8sel").val();
        if (isms == 0) //秒
        {
          unixTimestamp = unixTimestamp * 1000; //转化为毫秒
        }

        var dateObj = new Date(unixTimestamp);
        if (dateObj.format('yyyy') == "NaN") {
          layer.msg("时间戳格式不正确");
          return;
        }
        var year = dateObj.getFullYear();
        var month = this.appendZero(dateObj.getMonth() + 1);
        var date = this.appendZero(dateObj.getDate());
        var hour = this.appendZero(dateObj.getHours());
        var minute = this.appendZero(dateObj.getMinutes());
        var second = this.appendZero(dateObj.getSeconds());
        var UnixTimeToDate = year + '-' + month + '-' + date + ' ' + hour + ':' + minute + ':' + second;
        document.unix.unixtoutc8result.value = UnixTimeToDate;
      },
      human2unix: function () {
        var isms = $("#utc8tounixsel").val();
        var _this = ted.unixtime;
        var form = document.unix;
        var year = form.year.value; if (!year) { /*alert("时间格式不正确");*/return; }
        var month = _this.stripLeadingZeroes(form.month.value);
        var day = _this.stripLeadingZeroes(form.day.value);
        var hour = _this.stripLeadingZeroes(form.hour.value);
        var minute = _this.stripLeadingZeroes(form.minute.value);
        var second = _this.stripLeadingZeroes(form.second.value);
        year = year ? year : new Date().getFullYear(), month = month ? month : 1, day = day ? day : 1, hour = hour ? hour : (year == 1970 ? 0 : 0), minute = minute ? minute : 0, second = second ? second : 0;
        //var humanDate = new Date(Date.UTC(year, month, day, hour, minute, second));

        var humanDate = new Date(year + "/" + month + "/" + day + " " + hour + ":" + minute + ":" + second);
        if (humanDate.format('yyyy') == "NaN") { /*alert("时间格式不正确");*/return; }
        if (isms == 0) document.unix.utc8tounixresult.value = (humanDate.getTime() / 1000);
        else document.unix.utc8tounixresult.value = humanDate.getTime();
      },
      human2unix1: function () {
        var isms = $("#unixtoutc81sel").val();
        var form = document.unix;
        var datetime = form.utc8.value;
        if (!datetime) return;
        if (datetime.split(' ').length == 1) //如 2021-01-19
          datetime = datetime + " 00:00:00";
        var ndate = new Date(datetime);
        if (ndate.format('yyyy') == "NaN") {
          layer.msg("时间格式不正确");
          return;
        }
        var year = ndate.getFullYear();
        var month = ndate.getMonth();
        var day = ndate.getDate();
        var hour = ndate.getHours();
        var minute = ndate.getMinutes();
        var second = ndate.getSeconds();
        var ms = ndate.getMilliseconds();
        var humanDate;
        if (isms == 0) humanDate = new Date(year, month, day, hour, minute, second);
        else humanDate = new Date(year, month, day, hour, minute, second, ms);
        //if (humanDate.format('yyyy') == "NaN") { /*alert("时间格式不正确");*/return; }
        if (isms == 0) form.unixtoutc8result1.value = (humanDate.getTime() / 1000);
        else form.unixtoutc8result1.value = humanDate.getTime();
      },
      stripLeadingZeroes: function (input) {
        if ((input.length > 1) && (input.substr(0, 1) == "0")) {
          return input.substr(1);
        } else {
          return input;
        }
      },
      currentTime: function () {
        var _this = ted.unixtime;
        var timeNow = new Date();
        document.getElementById("currentunixtime").innerHTML = Math.round(timeNow.getTime() / 1000);
        if (_this.currentTimeActive) {
          this.unixTimer = setTimeout(function () { _this.currentTime() }, 1000);
        }
      },
      nowDate: function () {
        var form = document.unix;
        var timeNow = new Date();
        form.timestamp.value = Math.round(timeNow.getTime() / 1000);
        form.year.value = timeNow.getFullYear();
        //                form.month.value = timeNow.getMonth() + 1;
        //                form.day.value = timeNow.getDate();
        //                form.hour.value = timeNow.getHours();
        //                form.minute.value = timeNow.getMinutes();
        //                form.second.value = timeNow.getSeconds();
      },
      init: function () {
        var _this = this;
        _this.nowDate();
        _this.currentTime();
        $("#start").click(function () {
          _this.currentTimeActive = 1;
          _this.currentTime();
        });
        $("#stop").click(function () {
          _this.currentTimeActive = 0;
          clearTimeout(_this.unixTimer);
        });
        $("#refresh").click(_this.currentTime);
        $("#unixtoutc8").click(function () { _this.unix2human() });
        $("#utc8tounix").click(_this.human2unix);
        $("#utc8tounix1").click(_this.human2unix1);
        //$("form input").keydown(function (e) { entNumber(e, true); });

        $("._ToolChoese").each(function () {
          _select({
            select: $(this).find(".SearChoese"),
            options: $(this).find("ul.SearChoese-show"),
            option: $(this).find("ul.SearChoese-show li a"),
            t: "slide",
            callback: function (_this) {
              var id = $(_this).parents("ul").siblings("input[type=hidden]").attr("id");
              switch (id) {
                case "unixtoutc8sel": $("#unixtoutc8").click();
                  break;
                case "unixtoutc81sel": $("#utc8tounix1").click();
                  break;
                case "utc8tounixsel": $("#utc8tounix").click();
                  break;
              }
            }
          });
        });
      }
    },
    hash: {
      setHash: function (type, val, pwd) {
        switch (type) {
          case "sha1":
            $("#p_div").addClass("autohide")
            jQuery("#result").val(CryptoJS.SHA1(val));
            break;
          case "sha224":
            $("#p_div").addClass("autohide")
            jQuery("#result").val(CryptoJS.SHA224(val));
            break;
          case "sha256":
            $("#p_div").addClass("autohide")
            jQuery("#result").val(CryptoJS.SHA256(val));
            break;
          case "sha384":
            $("#p_div").addClass("autohide")
            jQuery("#result").val(CryptoJS.SHA384(val));
            break;
          case "sha512":
            $("#p_div").addClass("autohide")
            jQuery("#result").val(CryptoJS.SHA512(val));
            break;
          case "md5":
            $("#p_div").addClass("autohide")
            jQuery("#result").val(CryptoJS.MD5(val));
            break;
          case "hmacsha1":
            $("#p_div").removeClass("autohide");
            jQuery("#result").val(CryptoJS.HmacSHA1(val, pwd));
            break;
          case "hmacsha224":
            $("#p_div").removeClass("autohide");
            jQuery("#result").val(CryptoJS.HmacSHA224(val, pwd));
            break;
          case "hmacsha256":
            $("#p_div").removeClass("autohide");
            jQuery("#result").val(CryptoJS.HmacSHA256(val, pwd));
            break;
          case "hmacsha384":
            $("#p_div").removeClass("autohide");
            jQuery("#result").val(CryptoJS.HmacSHA384(val, pwd));
            break;
          case "hmacsha512":
            $("#p_div").removeClass("autohide");
            jQuery("#result").val(CryptoJS.HmacSHA512(val, pwd));
            break;
          case "hmacmd5":
            $("#p_div").removeClass("autohide");
            jQuery("#result").val(CryptoJS.HmacMD5(val, pwd));
            break;
        }
      },
      init: function () {
        var _this = this;
        $("#btnlist .GLOkBtn").click(function () {
          var val = jQuery("#content").val();
          var pwd = jQuery("#pwd").val();
          if (val) {
            _this.setHash($(this).attr("t"), val, pwd);
            if (jQuery("#result").val()) $("#result").siblings().hide();
          }
        });
        $("#clear").click(function () { tools.clear([getid("result"), getid("content")]) });
      }
    }
  },
  htmlcssjs: {
    htmljs: function () {
      var oresul = getid("oresult");
      var osource = getid("osource");
      oresul.onfocus = oresul.onkeyup = function () {
        getid('re').value = getid('oresult').value.replace(/document.writeln\("/g, "").replace(/document.write\("/g, "").replace(/\\\"/g, "\"").replace(/\\\'/g, "\'").replace(/\\\//g, "\/").replace(/\\\\/g, "\\").replace(/"\);/g, "");
        if (jQuery("#re").val()) $("#re").siblings().hide();
      }
      osource.onfocus = osource.onkeyup = function () {
        getid('oresult2').value = "document.writeln(\"" + getid('osource').value.replace(/\\/g, "\\\\").replace(/\"/g, "'").replace(/\\/g, "\\/").replace(/\'/g, "\\\'").replace(/\"/g, "\\\"").split('\n').join("\");\ndocument.writeln(\"") + "\");";
        if (jQuery("#oresult2").val()) $("#oresult2").siblings().hide();
      }
    },
    htmlubb: {
      pattern: function (str) {
        //str = str.replace(/(\r\n|\n|\r)/ig, '');
        str = str.replace(/<br[^>]*>/ig, '\n');
        str = str.replace(/<p[^>\/]*\/>/ig, '\n');
        //str = str.replace(/\[code\](.+?)\[\/code\]/ig, function($1, $2) {return phpcode($2);});
        str = str.replace(/\son[\w]{3,16}\s?=\s*([\'\"]).+?\1/ig, '');

        str = str.replace(/<hr[^>]*>/ig, '[hr]');
        str = str.replace(/<(sub|sup|u|strike|b|i|pre)>/ig, '[$1]');
        str = str.replace(/<\/(sub|sup|u|strike|b|i|pre)>/ig, '[/$1]');
        str = str.replace(/<(\/)?strong>/ig, '[$1b]');
        str = str.replace(/<(\/)?em>/ig, '[$1i]');
        str = str.replace(/<(\/)?blockquote([^>]*)>/ig, '[$1blockquote]');

        str = str.replace(/<img[^>]*smile=\"(\d+)\"[^>]*>/ig, '[s:$1]');
        str = str.replace(/<img[^>]*src=[\'\"\s]*([^\s\'\"]+)[^>]*>/ig, '[img]' + '$1' + '[/img]');
        str = str.replace(/<a[^>]*href=[\'\"\s]*([^\s\'\"]*)[^>]*>(.+?)<\/a>/ig, '[url=$1]' + '$2' + '[/url]');
        //str = str.replace(/<h([1-6]+)([^>]*)>(.*?)<\/h\1>/ig,function($1,$2,$3,$4){return h($3,$4,$2);});

        str = str.replace(/<[^>]*?>/ig, '');
        str = str.replace(/&amp;/ig, '&');
        str = str.replace(/&lt;/ig, '<');
        str = str.replace(/&gt;/ig, '>');

        return str;
      },
      up: function (str) {
        str = str.replace(/</ig, '&lt;');
        str = str.replace(/>/ig, '&gt;');
        str = str.replace(/\n/ig, '<br />');
        str = str.replace(/\[code\](.+?)\[\/code\]/ig, function ($1, $2) { return phpcode($2); });

        str = str.replace(/\[hr\]/ig, '<hr />');
        str = str.replace(/\[\/(size|color|font|backcolor)\]/ig, '</font>');
        str = str.replace(/\[(sub|sup|u|i|strike|b|blockquote|li)\]/ig, '<$1>');
        str = str.replace(/\[\/(sub|sup|u|i|strike|b|blockquote|li)\]/ig, '</$1>');
        str = str.replace(/\[\/align\]/ig, '</p>');
        str = str.replace(/\[(\/)?h([1-6])\]/ig, '<$1h$2>');

        str = str.replace(/\[align=(left|center|right|justify)\]/ig, '<p align="$1">');
        str = str.replace(/\[size=(\d+?)\]/ig, '<font size="$1">');
        str = str.replace(/\[color=([^\[\<]+?)\]/ig, '<font color="$1">');
        str = str.replace(/\[backcolor=([^\[\<]+?)\]/ig, '<font style="background-color:$1">');
        str = str.replace(/\[font=([^\[\<]+?)\]/ig, '<font face="$1">');
        str = str.replace(/\[list=(a|A|1)\](.+?)\[\/list\]/ig, '<ol type="$1">$2</ol>');
        str = str.replace(/\[(\/)?list\]/ig, '<$1ul>');

        str = str.replace(/\[s:(\d+)\]/ig, function ($1, $2) { return smilepath($2); });
        str = str.replace(/\[img\]([^\[]*)\[\/img\]/ig, '<img src="$1" border="0" />');
        str = str.replace(/\[url=([^\]]+)\]([^\[]+)\[\/url\]/ig, '<a href="$1">' + '$2' + '</a>');
        str = str.replace(/\[url\]([^\[]+)\[\/url\]/ig, '<a href="$1">' + '$1' + '</a>');
        return str;
      },
      htmltoubb: function () {
        str = hcj.htmlubb.pattern(getid("Hsource").value);
        getid("Uresult").value = str;
        if (jQuery("#Uresult").val()) $("#Uresult").siblings().hide();
      },
      ubbtohtml: function () {
        str = hcj.htmlubb.up(getid("Usource").value);
        getid("Hresult").value = str;
        if (jQuery("#Hresult").val()) $("#Hresult").siblings().hide();
      },
      init: function () {
        var Hsource = getid("Hsource");
        var Usource = getid("Usource");
        var _this = this;
        Hsource.onfocus = Hsource.onkeyup = _this.htmltoubb;
        Usource.onfocus = Usource.onkeyup = _this.ubbtohtml;
      }

    },
    htmlCodeCov: {
      //html代码转换javascript代码
      javascript: function () {
        var input = document.getElementById("content").value;
        if (input == "") {
          document.getElementById("result").value = "<script language=\"JavaScript\">\n<!--\n/\/\-->\n</script>";
        }
        else {
          output = "document.writeln(\"";
          for (var c = 0; c < input.length; c++) {
            if ((input.charAt(c) == "\n" || input.charAt(c) == "\r")) {
              output += "\");";
              if (c != input.length - 1) output += "\ndocument.writeln(\"";
              c++;
            }
            else {
              if (input.charAt(c) == "\"") {
                output += "/\"";
              }
              else {
                if (input.charAt(c) == "\\") {
                  output += "\\\\";
                }

                else {
                  output += input.charAt(c);
                  if (c == input.length - 1) output += "\");";
                }
              }
            }

          }
          document.getElementById("result").value = "<script language=\"JavaScript\">\n<!--\n" + output + "\n/\/\-->\n</script>";
        }

      },

      //html代码转换asp代码
      asp: function () {
        var input = document.getElementById("content").value;
        if (input == "") {
          document.getElementById("result").value = "<%\n%>";
        }
        else {
          output = "Response.Write \"";
          for (var c = 0; c < input.length; c++) {
            if ((input.charAt(c) == "\n" || input.charAt(c) == "\r")) {
              output += "\"";
              if (c != input.length - 1) output += "\nResponse.Write \"";
              c++;
            }
            else {
              if (input.charAt(c) == "\"") {
                output += "\"\"";
              }
              else {
                if (input.charAt(c) == "\\") {
                  output += "\\\\";
                }

                else {
                  output += input.charAt(c);
                  if (c == input.length - 1) output += "\"";
                }
              }
            }

          }
          document.getElementById("result").value = "<%\n" + output + "\n%>";
        }
      },

      //html代码转换php代码
      php: function () {
        var input = document.getElementById("content").value;
        if (input == "") {
          document.getElementById("result").value = "<?php\n?>";
        }
        else {
          output = "echo \"";
          for (var c = 0; c < input.length; c++) {
            if ((input.charAt(c) == "\n" || input.charAt(c) == "\r")) {
              output += "\\n\";";
              if (c != input.length - 1) output += "\necho \"";
              c++;
            }
            else {
              if (input.charAt(c) == "\"") {
                output += "\\\"";
              }
              else {
                if (input.charAt(c) == "\\") {
                  output += "\\\\";
                }

                else {
                  output += input.charAt(c);
                  if (c == input.length - 1) output += "\\n\";";
                }
              }
            }

          }
          document.getElementById("result").value = "<?php\n" + output + "\n?>";
        }
      },

      //html代码转换Jsp代码
      Jsp: function () {
        var input = document.getElementById("content").value;
        if (input == "") {
          document.getElementById("result").value = "<%\n%>";
        }
        else {
          output = "out.println(\"";
          for (var c = 0; c < input.length; c++) {
            if ((input.charAt(c) == "\n" || input.charAt(c) == "\r")) {
              output += "\");";
              if (c != input.length - 1) output += "\nout.println(\"";
              c++;
            }
            else {
              if (input.charAt(c) == "\"") {
                output += "\\\"";
              }
              else {
                if (input.charAt(c) == "\\") {
                  output += "\\\\";
                }

                else {
                  output += input.charAt(c);
                  if (c == input.length - 1) output += "\");";
                }
              }
            }

          }
          document.getElementById("result").value = "<%\n" + output + "\n%>";
        }
      },

      //html代码转换Perl代码
      Perl: function () {
        var input = document.getElementById("content").value;
        if (input == "") {
          document.getElementById("result").value = output;
        }
        else {
          output = "print \"";
          for (var c = 0; c < input.length; c++) {
            if ((input.charAt(c) == "\n" || input.charAt(c) == "\r")) {
              output += "\\n\";";
              if (c != input.length - 1) output += "\nprint \"";
              c++;
            }
            else {
              if (input.charAt(c) == "\"") {
                output += "\\\"";
              }
              else {
                if (input.charAt(c) == "\\") {
                  output += "\\\\";
                }

                else {
                  output += input.charAt(c);
                  if (c == input.length - 1) output += "\\n\";";
                }
              }
            }

          }
          document.getElementById("result").value = output;
        }
      },


      //html代码转换vbnet代码
      vbnet: function () {
        var input = document.getElementById("content").value;
        if (input == "") {
          document.getElementById("result").value = "<%\n%>";
        }
        else {
          output = "Response.Write (\"";
          for (var c = 0; c < input.length; c++) {
            if ((input.charAt(c) == "\n" || input.charAt(c) == "\r")) {
              output += "\");";
              if (c != input.length - 1) output += "\nResponse.Write (\"";
              c++;
            }
            else {
              if (input.charAt(c) == "\"") {
                output += "\"\"";
              }
              else {
                if (input.charAt(c) == "\\") {
                  output += "\\\\";
                }

                else {
                  output += input.charAt(c);
                  if (c == input.length - 1) output += "\");";
                }
              }
            }

          }
          document.getElementById("result").value = "<%\n" + output + "\n%>";
        }
      },

      //html代码转换Sws代码
      Sws: function () {
        var input = document.getElementById("content").value;
        if (input == "") {
          document.getElementById("result").value = output;
        }
        else {
          output = "STRING \"";
          for (var c = 0; c < input.length; c++) {
            if ((input.charAt(c) == "\n" || input.charAt(c) == "\r")) {
              output += "\"";
              if (c != input.length - 1) output += "\nSTRING \"";
              c++;
            }
            else {
              if (input.charAt(c) == "\"") {
                output += "\\\"";
              }
              else {
                if (input.charAt(c) == "\\") {
                  output += "\\\\";
                }

                else {
                  output += input.charAt(c);
                  if (c == input.length - 1) output += "\"";
                }
              }
            }

          }
          document.getElementById("result").value = output;
        }
      },

      //开始转换按钮
      htmlCov: function () {
        var _this = hcj.htmlCodeCov;
        var type = getid("html").value;
        switch (type) {
          case "javascript": _this.javascript(); break;
          case "asp": _this.asp(); break;
          case "php": _this.php(); break;
          case "jsp": _this.Jsp(); break;
          case "perl": _this.Perl(); break;
          case "sws": _this.Sws(); break;
          case "vbnet": _this.vbnet(); break;
          default: getid("result").value = '转换错误'; break;
        }
        if (jQuery("#result").val()) $("#result").siblings().hide();
      },
      init: function (path) {
        var _this = this;
        $("#trans").click(_this.htmlCov);
        tools.clipfn(path, "clip");
        $("._ToolChoese").each(function () {
          _select({
            select: $(this).find(".SearChoese"),
            options: $(this).find("ul.SearChoese-show"),
            option: $(this).find("ul.SearChoese-show li a"),
            t: "slide",
            callback: _this.htmlCov//下拉选项
          });
        });
        $("#clear").click(function () { tools.clear([getid("content"), getid("result")]) });
      }

    },
    jsCodeConfusion: function (path) {
      $("#confused").click(function () {
        var code = document.getElementById("JScode").value;
        var xx = new CLASS_CONFUSION(code);
        var a = new Date();
        getid("ConfusionAfterCode").value = xx.confusion();
        if (jQuery("#ConfusionAfterCode").val()) $("#ConfusionAfterCode").siblings().hide();
      });
      tools.clipfn(path, "clip");
      $("#clear").click(function () { tools.clear([getid("JScode"), getid("ConfusionAfterCode")]) });
    },
    jstool: {
      jsonData: { action: '', content: '', enkey: '' },
      jsbeauty: function (_this) {
        var source = jQuery('#txtInitCode').val().trim(),
          output,
          opts = {};

        opts.indent_size = 4;
        opts.indent_char = ' ';
        opts.max_preserve_newlines = 5;
        opts.preserve_newlines = opts.max_preserve_newlines !== "-1";
        opts.keep_array_indentation = false;
        opts.break_chained_methods = false;
        opts.indent_scripts = 'normal';
        opts.brace_style = 'collapse';
        opts.space_before_conditional = true;
        opts.unescape_strings = false;
        opts.jslint_happy = false;
        opts.wrap_line_length = 0;
        opts.space_after_anon_function = true;
        source = _this.unpacker_filter(source, _this);
        output = js_beautify(source, opts);
        jQuery('#txtResultCode').val(output);
        if (jQuery("#txtResultCode").val()) $("#txtResultCode").siblings("b").hide();
      },
      unpacker_filter: function (source) {
        var trailing_comments = '',
          comment = '',
          unpacked = '',
          found = false;

        do {
          found = false;
          if (/^\s*\/\*/.test(source)) {
            found = true;
            comment = source.substr(0, source.indexOf('*/') + 2);
            source = source.substr(comment.length).replace(/^\s+/, '');
            trailing_comments += comment + "\n";
          } else if (/^\s*\/\//.test(source)) {
            found = true;
            comment = source.match(/^\s*\/\/.*/)[0];
            source = source.substr(comment.length).replace(/^\s+/, '');
            trailing_comments += comment + "\n";
          }
        } while (found);

        var unpackers = [P_A_C_K_E_R, Urlencoded, MyObfuscate];
        for (var i = 0; i < unpackers.length; i++) {
          if (unpackers[i].detect(source)) {
            unpacked = unpackers[i].unpack(source);
            if (unpacked != source) {
              source = this.unpacker_filter(unpacked);
            }
          }
        }
        return trailing_comments + source;
      },
      ajaxdata: function (_this) {
        jQuery.ajax({
          type: 'POST',
          url: '/AjaxSeo.aspx?t=jsformat',
          data: _this.jsonData,
          beforeSend: function () {
            jQuery("#txtResultCode").val("");
            jQuery("#loading").removeClass("autohide");
          },
          dataType: 'jsonp',
          success: function (json) {
            jQuery("#loading").addClass("autohide");
            if (json.state == 0) {
              alert(json.msg);
            }
            else {
              jQuery("#txtResultCode").val(json.txt);
              if (jQuery("#txtResultCode").val()) $("#txtResultCode").siblings("b").hide();
            }
          }
        });
      },
      init: function (path, key) {
        var _this = this;
        _this.jsonData.enkey = key;
        jQuery("#btndiv input[ref]").click(function () {
          _this.jsonData.action = jQuery(this).attr("ref");
          _this.jsonData.content = jQuery.trim(jQuery("#txtInitCode").val());
          if (_this.jsonData.content == '') {
            alert('请输入要转换的内容');
            return;
          }
          switch (_this.jsonData.action) {
            case "beauty": _this.jsbeauty(_this); return;
            case "filtercomment": _this.ajaxdata(_this); break;
            case "basiccompress": _this.ajaxdata(_this); break;
            case "encodecompress": _this.ajaxdata(_this); break;
            case "decodebeauty": _this.jsbeauty(_this); return;
          }
        });
        //tools.clipfn(path, "clip");
        var clipboard = new Clipboard('#clip');
        $("#clear").click(function () { tools.clear([getid("txtInitCode"), getid("txtResultCode")]) });
      }
    },
    jsFormat: function (path) {
      $("#beautify").click(function () {
        document.getElementById('beautify').disabled = true;
        js_source = document.getElementById('content').value.replace(/^\s+/, '');
        tabsize = document.getElementById('tabsize').value;
        tabchar = ' ';
        if (tabsize == 1) {
          tabchar = '\t';
        }
        var regEmptyTag = /(<([^\/][^>|^\/>].*)>)(\s*)?(<\/([^>]*)>)/g;
        var c = "";
        if (js_source && js_source.charAt(0) === '<') {
          //document.getElementById('result').value = style_html(js_source, tabsize, tabchar, 80);
          c = style_html(js_source, tabsize, tabchar, 80);
        } else {
          //document.getElementById('result').value = js_beautify(js_source, tabsize, tabchar);
          c = js_beautify(js_source, tabsize, tabchar);
        }
        document.getElementById('result').value = c.replace(regEmptyTag, '$1$4');
        document.getElementById('newresult').value = c.replace(regEmptyTag, '$1$4');
        if (jQuery("#result").val()) $("#result").siblings().hide();
        document.getElementById('beautify').disabled = false;
        return false;
      });
      $("#pack0").click(function (base64) {
        pack_js(0);
      });
      $("#pack1").click(function (base64) {
        pack_js(1);
      });
      //tools.clipfn(path, "clip");
      $("#clear").click(function () { tools.clear([getid("result"), getid("content")]) });
      function pack_js(base64) {
        var input = document.getElementById('content').value;
        var packer = new Packer;
        if (base64) {
          var output = packer.pack(input, 1, 0);
        } else {
          var output = packer.pack(input, 0, 0);
        }
        document.getElementById('result').value = output;
        document.getElementById('newresult').value = output;
        if (jQuery("#result").val()) $("#result").siblings().hide();
      }
      //复制
      $("#copy").click(function () {
        try {
          var val = $("#result").val();
          if (val == "")
            return;
          var clipboard = new ClipboardJS('#copy');
          layer.msg("复制成功");
        } catch (ex) {
          layer.msg("复制失败");
        }
      });
      //全屏
      $("#fullscreen").click(function () {
        $("body").css("overflow","hidden")
        layer.open({
          type: 1,
          title: '格式化结果',
          closeBtn: 1,
          area: ['100%', '100%'],
          shadeClose: true,
          content: $('#newresult'),
          end: function(){
            $("body").css("overflow","unset")
          }
        });
        layer.fullhalf
      })
    }
  },
  jsonTool: {
    jsontocsharp: {
      init: function (path) {
        var _this = this;

        $(".ToolChoesecj").each(function () {
          _select({
            select: $(this).find(".SearChoese"),
            options: $(this).find("ul.SearChoese-show"),
            option: $(this).find("ul.SearChoese-show li a"),
            t: "slide",
            parents: $(".ToolChoesecj"),
            callback: function () {
              if ($("#showtype").val() == 0)
                $(".javawh").addClass("autohide");
              else
                $(".javawh").removeClass("autohide");
            }
          });
        });

        tools.clipfn(path);
        $("#2csharp").click(function () {
          if (!$("#jsonval").val().trim()) {
            alert("请填写JSON");
            return false;
          }
          try {
            var v = eval("(" + document.getElementById("jsonval").value + ")");
            var res = "";
            if ($("#showtype").val() == 0)
              res = _this.JSON2CSharp.convert(v);
            else
              res = _this.JSON2POJO.convert(v);
            $("#result").val(res).siblings("b").hide();
          } catch (e) {
            alert("生成C#实体类异常，请检查JSON是否错误。");
          }
        });
        $("#testjson").click(function () {
          var testjson = '{\r\n    "name":"站长工具",\r\n    "url":"http://tool.chinaz.com",\r\n    "address":{\r\n        "city":"厦门",\r\n        "country":"中国"\r\n    },\r\n    "arrayBrowser":[{\r\n        "name":"Google",\r\n        "url":"http://www.google.com"\r\n    },\r\n    {\r\n       "name":"Baidu",\r\n       "url":"http://www.baidu.com"\r\n   },\r\n   {\r\n       "name":"SoSo",\r\n       "url":"http://www.SoSo.com"\r\n   }]\r\n}';
          $("#jsonval").val(testjson).siblings("b").hide();
        });
        $("#clear").click(function () {
          tools.clear([getid('result'), getid('jsonval')]);
        });
      },
      JSON2CSharp: {
        _allClass: [],
        _genClassCode: function (obj, name) {
          var clas = "public class {0}\r\n{\r\n".format(name || "Root");
          for (var n in obj) {
            var v = obj[n];
            n = n.trim();
            //变量定义规则
            n = n.replace(/[^\w]+/ig, '_');
            if (/^\d+/.test(n))
              n = "_" + n;
            clas += "    {0}    public {1} {2} { get; set; }\r\n".format(this._genComment(v, n), this._genTypeByProp(n, v), n);
          }
          clas += "}\r\n";
          this._allClass.push(clas);
          return this._allClass.join("\r\n");
        },
        _genTypeByProp: function (name, val) {
          try {
            if (typeof val == "string") {
              var regdt = /^(\d{4})(-|\/|年)(\d{2})(-|\/|月)(\d{2})(日)?(\s((\d{1,2}):)?((\d{1,2}):)?(\d{1,2})?)?$/
              if (regdt.test(val.trim()))
                val = new Date(val);
            }
          } catch (e) {

          }
          switch (Object.prototype.toString.apply(val)) {
            case "[object Number]":
            {
              return val.toString().indexOf(".") > -1 ? "double" : "int";
            }
            case "[object Date]":
            {
              return "DateTime";
            }
            case "[object Object]":
            {
              name = name.substring(0, 1).toUpperCase() + name.substring(1);
              this._genClassCode(val, name);
              return name;
            }
            case "[object Array]":
            {
              return "List<{0}>".format(this._genTypeByProp(name, val[0]));
            }
            case "[object Boolean]":
            {
              return "bool";
            }
            default:
            {
              return "string";
            }
          }
        },
        _genComment: function (val, n) {
          //var commm = typeof (val) == "string" && /.*[\u4e00-\u9fa5]+.*$/.test(val) ? val : "";
          var s = Object.prototype.toString.apply(val);
          var commm = typeof (val) == "string" ? val : n.substring(0, 1).toUpperCase() + n.substring(1); ;
          return "/// <summary>\r\n    /// " + commm + "\r\n    /// </summary>\r\n";
        },
        convert: function (jsonObj) {
          this._allClass = [];
          return this._genClassCode(jsonObj);
        }
      },
      JSON2POJO: {
        _allClass: [],
        _genClassCode: function (obj, name) {
          var packageval = $("#packageval").val(), isfill = $("#isfill").prop("checked");
          var clas = "";
          var str = "";
          var privateAttr = "", publicAttr = "", fill = "", filllist = "";
          if (isfill) {
            fill += "    public static {0} fill(JSONObject jsonobj){\r\n".format(name || "Root");
            fill += "        {0} entity = new {0}();\r\n".format(name || "Root");

            filllist += "    public static List<{0}> fillList(JSONArray jsonarray) {\r\n";
            filllist += "        if (jsonarray == null || jsonarray.size() == 0)\r\n";
            filllist += "            return null;\r\n";
            filllist += "        List<{0}> olist = new ArrayList<{0}>();\r\n";
            filllist += "        for (int i = 0; i < jsonarray.size(); i++) {\r\n";
            filllist += "            olist.add(fill(jsonarray.getJSONObject(i)));\r\n";
            filllist += "        }\r\n";
            filllist += "        return olist;\r\n";
            filllist += "    }\r\n";
            filllist = filllist.format(name || "Root");
          }
          for (var n in obj) {
            var v = obj[n];
            n = n.trim();
            //变量定义规则
            n = n.replace(/[^\w]+/ig, '_');
            if (/^\d+/.test(n))
              n = "_" + n;
            var tp = this._genTypeByProp(n, v);
            var _type = tp.type;
            if (tp.islist) {
              if (isfill)
                str = "package {1};\r\nimport java.util.ArrayList;\r\nimport java.util.List;\r\nimport net.sf.json.JSONObject;\r\nimport net.sf.json.JSONArray;\r\npublic class {0}\r\n{\r\n".format(name || "Root", packageval);
              else
                str = "package {1};\r\nimport java.util.ArrayList;\r\nimport java.util.List;\r\npublic class {0}\r\n{\r\n".format(name || "Root", packageval, "\r\nimport java.util.List;");
            }
            privateAttr += "    private {0} {1};\r\n\r\n".format(_type, n);
            var firstChar = n.substring(0, 1).toUpperCase() + n.substring(1);
            publicAttr += "    public void set{2}({0} {1}){\r\n        this.{1} = {1};\r\n    }\r\n".format(_type, n, firstChar);
            publicAttr += "    public {0} get{2}(){\r\n        return this.{1};\r\n    }\r\n".format(_type, n, firstChar);

            if (isfill) {
              fill += "        if (jsonobj.containsKey(\"{0}\")) {\r\n".format(n);
              var _typefirstChartoUpper = _type.substring(0, 1).toUpperCase() + _type.substring(1);
              fill += "            entity.set{1}(jsonobj.get{2}(\"{0}\"));        \r\n        }\r\n".format(n, n.substring(0, 1).toUpperCase() + n.substring(1), _typefirstChartoUpper.indexOf("List") >= 0 ? "JSONArray" : _typefirstChartoUpper);
            }
          }
          clas += "==================================\r\n"
          if (!str) {
            if (isfill)
              clas += "package {1};\r\nimport net.sf.json.JSONObject;\r\nimport net.sf.json.JSONArray;\r\npublic class {0}\r\n{\r\n".format(name || "Root", packageval);
            else
              clas += "package {1};\r\npublic class {0}\r\n{\r\n".format(name || "Root", packageval);
          }
          else
            clas += str;
          if (isfill) {
            fill += "        return entity;\r\n    }\r\n";
          }
          clas += privateAttr;
          clas += publicAttr;
          clas += fill;
          clas += filllist;
          clas += "}\r\n";
          this._allClass.push(clas);
          return this._allClass.join("\r\n");
        },
        _genTypeByProp: function (name, val) {
          try {
            if (typeof val == "string") {
              //xxxx(-|/|年)xx(-|/|月)xx(-|/|日) xx:xx:xx
              var regdt = /^(\d{4})(-|\/|年)(\d{2})(-|\/|月)(\d{2})(日)?(\s((\d{1,2}):)?((\d{1,2}):)?(\d{1,2})?)?$/
              if (regdt.test(val.trim()))
                val = new Date(val);
            }
          } catch (e) {

          }
          switch (Object.prototype.toString.apply(val)) {
            case "[object Number]":
            {
              return { type: val.toString().indexOf(".") > -1 ? "double" : "int" };
            }
            case "[object Date]":
            {
              return { type: "DateTime" };
            }
            case "[object Object]":
            {
              name = name.substring(0, 1).toUpperCase() + name.substring(1);
              this._genClassCode(val, name);
              return { type: name };
            }
            case "[object Array]":
            {
              return { type: "List<{0}>".format(this._genTypeByProp(name, val[0]).type), islist: true };
            }
            case "[object Boolean]":
            {
              return { type: "boolean" };
            }
            default:
            {
              return { type: "String" };
            }
          }
        },
        convert: function (jsonObj) {
          this._allClass = [];
          return this._genClassCode(jsonObj);
        }
      }
    },
    jsontoxml: function () {
      $("#2json").click(function () {
        var xmlobjtree = new XML.ObjTree();
        var dumper = new JKL.Dumper();
        var xmlText = $("#xmljsonval").val();
        if (!xmlText) {
          alert("请输入XML字符串");
          $("#xmljsonval").focus();
          return false;
        }
        xmlText = xmlText.replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&quot;/g, "\""); //HTML转义
        var tree = xmlobjtree.parseXML(xmlText);
        if (tree) {
          if (!tree.html)
            $("#result").val(dumper.dump(tree)).siblings("b").hide();
          else {
            alert("请检查XML是否错误。");
            $("#xmljsonval").focus();
          }
        }
      });

      $("#2xml").click(function () {
        var xmlobjtree = new XML.ObjTree();
        if (!$("#xmljsonval").val()) {
          alert("请输入JSON字符串");
          $("#xmljsonval").focus();
          return false;
        }
        try {
          var json = eval("(" + $("#xmljsonval").val() + ")");
          $("#result").val(formatXml(xmlobjtree.writeXML(json))).siblings("b").hide();
        } catch (e) {
          alert("转XML异常，请检查JSON是否错误。");
          $("#xmljsonval").focus();
        }
      });

      $("#clear").click(function () {
        tools.clear([getid('xmljsonval'), getid('result')]);
      });

    },
    jsontoget: function () {
      $("#getjsonval").bind("keyup paste", function (e) {
        var obj = $(this);
        var etype = e.type;
        setTimeout(function () {
          if (etype == "paste")
            obj.val(obj.val().trim().replace(/(\r|\n|\t|\s)/g, ""));
        }, 100);
      });
      $("#2json").click(function () {
        var val = $("#getjsonval").val();
        val = val.replace(/&/g, '","').replace(/=/g, '":"');
        val = '{"' + val + '"}';
        $("#result").val(val).siblings("b").hide();
      });
      $("#2get").click(function () {
        var val = $("#getjsonval").val();
        val = val.replace(/\t/g, "");
        val = val.replace(/\"/g, "").replace("{", "").replace("}", "").replace(",", "&").replace(":", "=");
        val = val.replace(/\"/g, "").replace(/{/g, "").replace(/}/g, "").replace(/,/g, "&").replace(/:/g, "=");
        $("#result").val(val).siblings("b").hide();
      });
      $("#clear").click(function () {
        tools.clear([getid('getjsonval'), getid('result')]);
      });
    },
    exceltojson: {
      getresult: function (totype) {
        var splitchar = $("#splitchar").val() || /\t/;
        var txt = $("#excelval").val();
        if (!txt.trim()) {
          alert("请输入EXCEL格式的字符串。");
          return false;
        }
        var datas = txt.split("\n");
        var html = "[\n";
        var keys = [];
        for (var i = 0; i < datas.length; i++) {
          var ds = datas[i].split(splitchar);
          if (i == 0) {
            if (totype == "0") {
              keys = ds;
            } else {
              html += "[";
              for (var j = 0; j < ds.length; j++) {
                html += '"' + ds[j] + '"';
                if (j < ds.length - 1) {
                  html += ",";
                }
              }
              html += "],\n";
            }
          } else {
            if (ds.length == 0) continue;
            if (ds.length == 1) {
              ds[0] == "";
              continue;
            }
            html += totype == "0" ? "{" : "[";
            for (var j = 0; j < ds.length; j++) {
              var d = ds[j];
              if (d == "") continue;
              if (totype == "0") {
                html += '"' + keys[j] + '":"' + d + '"';
              } else {
                html += '"' + d + '"';
              }
              if (j < ds.length - 1) {
                html += ',';
              }
            }
            html += totype == "0" ? "}" : "]";
            if (i < datas.length - 1)
              html += ",\n";
          }
        }
        if (html&&html.lastIndexOf(",\n")==html.length-2) {
          html = html.substring(0, html.lastIndexOf(",\n"));
        }
        html += "\n]";
        $("#result").val(html).siblings("b").hide();
      },
      init: function () {
        var _this = this;
        $("#2object").click(function () {
          _this.getresult(0);
        });
        $("#2array").click(function () {
          _this.getresult(1);
        });
        $("#clear").click(function () {
          tools.clear([getid('excelval'), getid('result')]);
        });
      }
    },
    jsonescape: {
      //ctype: 1压缩  2转义  3压缩转义  4去除转义
      escapezip: function (ctype) {
        var txtA = document.getElementById("jsonval");
        var text = txtA.value;
        if (!text.trim()) {
          alert("请输入JSON字符串。");
          return false;
        }
        if (ctype == 1 || ctype == 3) {
          text = text.split("\n").join(" ");
          var t = [];
          var inString = false;
          for (var i = 0, len = text.length; i < len; i++) {
            var c = text.charAt(i);
            if (inString && c === inString) {
              if (text.charAt(i - 1) !== '\\') {
                inString = false;
              }
            } else if (!inString && (c === '"' || c === "'")) {
              inString = c;
            } else if (!inString && (c === ' ' || c === "\t")) {
              c = '';
            }
            t.push(c);
          }
          text = t.join('');
        }
        if (ctype == 2 || ctype == 3) {
          text = text.replace(/\\/g, "\\\\").replace(/\"/g, "\\\"");
        }
        if (ctype == 4) {
          text = text.replace(/\\\\/g, "\\").replace(/\\\"/g, '\"');
        }
        txtA.value = text;
      },
      GB2312UnicodeConverter: {
        ToUnicode: function (str) {
          var txt = escape(str).toLocaleLowerCase().replace(/%u/gi, '\\u');
          return txt.replace(/%7b/gi, '{').replace(/%7d/gi, '}').replace(/%3a/gi, ':').replace(/%2c/gi, ',').replace(/%27/gi, '\'').replace(/%22/gi, '"').replace(/%5b/gi, '[').replace(/%5d/gi, ']').replace(/%3D/gi, '=').replace(/%20/gi, ' ').replace(/%3E/gi, '>').replace(/%3C/gi, '<').replace(/%3F/gi, '?');
        },
        ToGB2312: function (str) {
          return unescape(str.replace(/\\u/gi, '%u'));
        }
      },
      utozh: function () {
        var _this = this;
        var txtA = document.getElementById("jsonval");
        var text = txtA.value.trim();
        if (!text) {
          alert("请输入JSON字符串。");
          return false;
        }
        txtA.value = _this.GB2312UnicodeConverter.ToGB2312(text);
      },
      zhtou: function () {
        var _this = this;
        var txtA = document.getElementById("jsonval");
        var text = txtA.value.trim();
        if (!text) {
          alert("请输入JSON字符串。");
          return false;
        }
        txtA.value = _this.GB2312UnicodeConverter.ToUnicode(text);
      },
      cntoenehar: function () {
        var txtA = document.getElementById("jsonval");
        var str = txtA.value;
        str = str.replace(/\’|\‘/g, "'").replace(/\“|\”/g, "\"");
        str = str.replace(/\【/g, "[").replace(/\】/g, "]").replace(/\｛/g, "{").replace(/\｝/g, "}");
        str = str.replace(/，/g, ",").replace(/：/g, ":");
        txtA.value = str;
      },
      init: function () {
        $('#jsonval').linedtextarea({ resize: "none" });
        var _this = this;
        $("#zip").click(function () {
          _this.escapezip(1);
        });
        $("#escape").click(function () {
          _this.escapezip(2);
        });
        $("#zipescape").click(function () {
          _this.escapezip(3);
        });
        $("#delescape").click(function () {
          _this.escapezip(4);
        });
        $("#u2zh-cn").click(function () {
          _this.utozh();
        });
        $("#zh-cn2u").click(function () {
          _this.zhtou();
        });
        $("#zh-cn2enchar").click(function () {
          _this.cntoenehar();
        });
      }
    }
  }
}


var tc = tools.transcoding;
var to = tools.other;
var ted = tools.encryptDecode;
var hcj = tools.htmlcssjs;
var jsontool = tools.jsonTool;
