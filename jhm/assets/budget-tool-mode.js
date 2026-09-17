(function () {
  "use strict";

  // This extension keeps the existing generator untouched and adds only the
  // JXNW3 payload used by the budget batch-processing tool.
  var PRIVATE_KEY_XML =
    "<RSAKeyValue><Modulus>tGPRhsP5czCK8xwAtfI6NK79s+AcyQB5QfF9TrZ1uQVvzRxLJ+giY0JFYkvc1sqBPJfEXhYkfUrFQSjb8siGSWyLACSYOPhQlPmj6H7am0nwmkvKK5iMPGyq2SfFGC+8CVcuIMW9NgKI/qUqMSdXPl/QZ9tBPYoOvI+nZKkocynpHwX51CTjIxHEu6jYF259dy/8TdJYddHn/EAlMdwX9EnABiuXYibtSLXw328ePXPg4bxN3LezSxq16C8xV6rICSpAdsrzkst+ILfS9PHblqXbY6NPaIVZRQ9GAwKljoHbg1YMc3qp8ReBGDUDTTmDlnPNgg68uykoY61qHWOY+Q==</Modulus><Exponent>AQAB</Exponent><P>202o4N12JB+jPoI6ofQbL7SZemSx0ZjrXGPesbTXdfDNppAe3kszggRZIURZf3V1WWSX92cxsylIEBdsXRsesxn8mDRwXvKTpZKLBjSAvSh9ZK6nq4TYcnzag+fhzfrXZsTFGy60y487Rc6YdydKd2jqo9/4Lz7P3s8hdg70MKM=</P><Q>0pM3VM3xAS4LUqPAp8wNAhCt8cWO4HarLywkQpI8D1Lyb67s6sQEs4FKwbszjpg5AwQJ1RkU3GqB6ADRoJapm3Dd7tOGyj4W/Y9W0hAMdKODA1hM99sgWd/JjjuYte2qYFPYSjBX5drv2C+wF9t4iYW4a1x+yubYTLHNW1/ifbM=</Q><DP>m9rlWmoJvEJ/0bzbzp2ddJn1OXa2qS70lgSkD8dmGPu6K9XhGjp3sL9GWM4qjNr9OzqyhbFhMOL1w/nhmYncl4ywZ7tc4R2ksNck1pQZqlVMSHGX193htfvlkDkL0UekLfVJ37eh5ck1ZrccxBG4aoS1vSE/UNRjBwZN0YlvIeE=</DP><DQ>MWUBDK6GQv2XAFqTHYk63+ojs1vhKPwNKbKUCt2coweVAOeqgWNbqvPAInOUI3XHodJ3r/oDL7T4JgDTK3VL8b9m/9e0fYpVAEN4XSwQj+evGsDCxT0seIiLEgceykYmuhPQ3445gBx8OFzvVJlRzAiG+wAmadf+kvb+MdnrGgs=</DQ><InverseQ>UrebaOzCjH/9OWKyP3ASbJ+XniTpgBkBX60re8LOxir4e54gzwaytNLH0pMlaljrBgpZR6LBy7Tbyw2UcN+Vf8NrddzXL79x7C3gfa5IKEEWnc2A8FrYC/WrS5MliadCJ3dyll+nvgY0qOyNq2mMzty4sG0T2F9aVwPvQGjY4/w=</InverseQ><D>ej/DeW9KmFPndsYdfTDBXX7SFJrnJxkZFCWSZEunEFKs5/YqwMrCsz3wQ6Nh8Hagiu3XeGPNKtQHRhdop+pZh1z1/ozOVJ2EDtH30NJXWDINyqNeSZlCQJjsV+pp2fBPoIzih/c6OWYSbXCFXXZp262XUSr31brALe205bT14sT7ES0K+QlNo1VtWhyagG71UYZoWJKWkGXeRsRZaGOxdc51rqrRasa45oxPttA/ZACZvHDIBlvudodTe57c/6ix6XYiFweU+leF0no1QGGX5+ukeMUvdUO7Iq+0IeLh2tvm+kRVhrTYXqfIqYLjdKtH9G604/jrN+KIfynn0zNQuQ==</D></RSAKeyValue>";

  var initialized = false;
  var budgetMode = false;
  var previousFeatureState = [];
  var rsa = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"]/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch];
    });
  }

  function base64ToBytes(value) {
    var binary = atob(value);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function bytesToBase64Url(bytes) {
    var binary = "";
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  }

  function bytesToBigInt(bytes) {
    var hex = "";
    for (var i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
    return BigInt("0x" + (hex || "0"));
  }

  function bigIntToBytes(value, length) {
    var hex = value.toString(16).padStart(length * 2, "0");
    if (hex.length > length * 2) hex = hex.slice(-length * 2);
    var bytes = new Uint8Array(length);
    for (var i = 0; i < length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return bytes;
  }

  function xmlValue(name) {
    var match = PRIVATE_KEY_XML.match(new RegExp("<" + name + ">([\\s\\S]*?)</" + name + ">"));
    if (!match) throw new Error("预算工具授权密钥参数缺失：" + name);
    return bytesToBigInt(base64ToBytes(match[1]));
  }

  function getRsa() {
    if (rsa) return rsa;
    var n = xmlValue("Modulus");
    var d = xmlValue("D");
    var length = Math.ceil(n.toString(16).length / 2);
    if (length !== 256) throw new Error("预算工具授权签名密钥长度异常");
    rsa = { n: n, d: d, length: length };
    return rsa;
  }

  function modPow(base, exponent, modulus) {
    var result = 1n;
    base %= modulus;
    while (exponent > 0n) {
      if (exponent & 1n) result = result * base % modulus;
      base = base * base % modulus;
      exponent >>= 1n;
    }
    return result;
  }

  function sha256(bytes) {
    var K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var bitLen = bytes.length * 8;
    var withOne = bytes.length + 1;
    var padLen = (64 - ((withOne + 8) % 64)) % 64;
    var data = new Uint8Array(withOne + padLen + 8);
    data.set(bytes);
    data[bytes.length] = 0x80;
    for (var i = 0; i < 8; i++) data[data.length - 1 - i] = Math.floor(bitLen / Math.pow(256, i)) & 0xff;
    var W = new Uint32Array(64);
    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
    for (var off = 0; off < data.length; off += 64) {
      for (var t = 0; t < 16; t++) {
        var j = off + t * 4;
        W[t] = ((data[j] << 24) | (data[j + 1] << 16) | (data[j + 2] << 8) | data[j + 3]) >>> 0;
      }
      for (t = 16; t < 64; t++) {
        var s0 = (rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3)) >>> 0;
        var s1 = (rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10)) >>> 0;
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
        var ch = ((e & f) ^ (~e & g)) >>> 0;
        var temp1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
        var S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
        var maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
        var temp2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    var out = new Uint8Array(32);
    for (i = 0; i < H.length; i++) {
      out[i * 4] = H[i] >>> 24;
      out[i * 4 + 1] = H[i] >>> 16;
      out[i * 4 + 2] = H[i] >>> 8;
      out[i * 4 + 3] = H[i];
    }
    return out;
  }

  function signPayload(payload) {
    var textBytes = new TextEncoder().encode(payload);
    var digest = sha256(textBytes);
    var digestInfoPrefix = new Uint8Array([
      0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86,
      0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05,
      0x00, 0x04, 0x20
    ]);
    var digestInfo = new Uint8Array(digestInfoPrefix.length + digest.length);
    digestInfo.set(digestInfoPrefix);
    digestInfo.set(digest, digestInfoPrefix.length);

    var key = getRsa();
    var encoded = new Uint8Array(key.length);
    encoded[0] = 0;
    encoded[1] = 1;
    encoded.fill(0xff, 2, key.length - digestInfo.length - 1);
    encoded[key.length - digestInfo.length - 1] = 0;
    encoded.set(digestInfo, key.length - digestInfo.length);
    var signature = modPow(bytesToBigInt(encoded), key.d, key.n);
    return bigIntToBytes(signature, key.length);
  }

  function getLicenseType() {
    var type = byId("typeSelect");
    var count = byId("countInput");
    if (!type) return "";
    return type.value === "C" ? "C" + String(count ? count.value.trim() : "") : type.value;
  }

  function createBudgetKey() {
    var unit = byId("unitInput").value.trim();
    var name = byId("nameInput").value.trim();
    var device = byId("deviceInput").value.trim();
    var type = getLicenseType();
    var payload = [unit, name, device, type].join("\t");
    var payloadBytes = new TextEncoder().encode(payload);
    var signatureBytes = signPayload(payload);
    return {
      payload: payload,
      activationKey: "CAICATS-JXNW3-" + bytesToBase64Url(payloadBytes) + "." + bytesToBase64Url(signatureBytes),
      licenseType: type
    };
  }

  function setToast(message) {
    var toast = byId("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    window.setTimeout(function () { toast.classList.remove("show"); }, 2200);
  }

  function setBudgetResult(result) {
    var resultMeta = byId("resultMeta");
    var keyCode = byId("keyCode");
    var payloadView = byId("payloadView");
    var resultCard = byId("resultCard");
    if (!resultMeta || !keyCode || !payloadView || !resultCard) return;

    var values = [
      ["单位", byId("unitInput").value.trim()],
      ["真实姓名", byId("nameInput").value.trim()],
      ["设备码", byId("deviceInput").value.trim()],
      ["授权类型", result.licenseType],
      ["授权次数", result.licenseType.indexOf("C") === 0 ? result.licenseType.slice(1) : "—"],
      ["授权功能", "江西农网预算批量化处理平台"]
    ];
    resultMeta.innerHTML = values.map(function (entry) {
      return "<dt>" + escapeHtml(entry[0]) + "</dt><dd>" + escapeHtml(entry[1]) + "</dd>";
    }).join("");
    keyCode.value = result.activationKey;
    payloadView.innerHTML = result.payload.split("\t").map(escapeHtml).join('<span class="tabmark">⇥</span>');
    resultCard.classList.remove("hidden");
    keyCode.focus({ preventScroll: true });
    keyCode.setSelectionRange(0, result.activationKey.length);
  }

  function setBudgetFeatureState(enabled) {
    var chips = byId("featureChips");
    var featureField = chips && chips.closest("fieldset");
    if (!chips || !featureField) return;

    var allChip = chips.querySelector('.chip[data-code="ALL"]');
    if (enabled) {
      previousFeatureState = Array.prototype.map.call(chips.querySelectorAll(".chip"), function (chip) {
        return [chip, chip.getAttribute("aria-checked")];
      });
      chips.querySelectorAll(".chip").forEach(function (chip) {
        chip.setAttribute("aria-checked", chip === allChip ? "true" : "false");
      });
      featureField.classList.add("wc-budget-feature-hidden");
    } else {
      previousFeatureState.forEach(function (entry) {
        entry[0].setAttribute("aria-checked", entry[1]);
      });
      previousFeatureState = [];
      featureField.classList.remove("wc-budget-feature-hidden");
    }
  }

  function updateMode() {
    var selector = byId("wcToolSelect");
    budgetMode = !!selector && selector.value === "budgetBatch";
    setBudgetFeatureState(budgetMode);
  }

  function addToolSelector() {
    if (byId("wcToolSelect")) return;
    var form = byId("genForm");
    if (!form || !form.firstElementChild) return;

    var card = document.createElement("section");
    card.className = "card wc-tool-card";
    card.innerHTML =
      '<h2 class="sec-title">授权工具</h2>' +
      '<div class="field">' +
      '<label for="wcToolSelect">选择生成对象<span class="req">*</span></label>' +
      '<div class="select-wrap">' +
      '<select id="wcToolSelect">' +
      '<option value="designBudget">设计 / 预算工具通用授权</option>' +
      '<option value="budgetBatch">江西农网预算批量化处理平台</option>' +
      '</select>' +
      '</div>' +
      '<p class="hint">原有模式保持不变；预算工具使用专用授权格式。</p>' +
      '</div>';
    form.insertBefore(card, form.firstElementChild);
    byId("wcToolSelect").addEventListener("change", updateMode);
  }

  function bindConfirmation() {
    var ok = byId("dmOk");
    if (!ok || ok.dataset.wcBudgetBound === "1") return;
    ok.dataset.wcBudgetBound = "1";
    ok.addEventListener("click", function () {
      if (!budgetMode) return;
      var entered = Array.prototype.map.call(document.querySelectorAll(".dm-digit"), function (digit) {
        return digit.value;
      }).join("");
      var now = new Date();
      var month = String(now.getMonth() + 1).padStart(2, "0");
      var day = String(now.getDate()).padStart(2, "0");
      var expected = String(now.getFullYear()).slice(2) + month + day;
      if (!/^\d{6}$/.test(entered) || entered !== expected) return;
      window.setTimeout(function () {
        try {
          setBudgetResult(createBudgetKey());
        } catch (error) {
          console.error(error);
          setToast(error.message || "预算工具激活码生成失败");
        }
      }, 0);
    });
  }

  function installStyles() {
    if (byId("wcBudgetModeStyle")) return;
    var style = document.createElement("style");
    style.id = "wcBudgetModeStyle";
    style.textContent =
      ".wc-tool-card{margin-bottom:16px}" +
      ".wc-budget-feature-hidden{display:none!important}" +
      "#wcToolSelect{font-size:16px}";
    document.head.appendChild(style);
  }

  function init() {
    if (initialized) return;
    if (!byId("genForm") || !byId("dmOk") || !byId("featureChips")) return;
    initialized = true;
    installStyles();
    addToolSelector();
    bindConfirmation();
  }

  var timer = window.setInterval(function () {
    init();
    if (initialized) window.clearInterval(timer);
  }, 50);
  init();
})();
