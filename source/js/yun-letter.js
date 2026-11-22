/* 「云的另一面」文章交互：不联网，不采集访客信息 */
(function () {
  "use strict";
  const KEY = "yun-letter-time-capsule-v1";
  const quotes = [
    "你不必一直发光，月亮也有看不见的那一面。",
    "慢一点没有关系，星星也要走很远才到达眼睛。",
    "把今天的遗憾折成纸船，明天会有新的河流。",
    "不是每朵云都要下雨，有些只是来替天空画画。",
    "你已经走过许多曾经觉得走不过的日子。",
    "愿你保有好奇，也允许自己偶尔平凡。",
    "世界很大，而你依然有权选择自己的节奏。",
    "有些答案会迟到，但你仍然值得好好生活。",
    "风会经过每条街，而温柔不必有固定的方向。",
    "就算今天是一片雾，也不代表明天没有日出。"
  ];
  function init() {
    const root = document.getElementById("yun-letter");
    if (!root || root.dataset.yunReady === "1") return;
    root.dataset.yunReady = "1";

    const choices = Array.from(root.querySelectorAll("[data-yun-mood]"));
    const fortune = root.querySelector("[data-yun-quote]");
    const fortuneButton = root.querySelector("[data-yun-fortune]");
    const input = root.querySelector("[data-yun-capsule]");
    const status = root.querySelector("[data-yun-status]");
    const saveButton = root.querySelector("[data-yun-save]");
    const clearButton = root.querySelector("[data-yun-clear]");
    const bar = root.querySelector(".yun-letter__progress");
    const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    choices.forEach((button) => {
      button.addEventListener("click", () => {
        const scene = button.getAttribute("data-yun-mood");
        if (!["dawn", "aurora", "sunset", "night"].includes(scene)) return;
        root.dataset.scene = scene;
        choices.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      });
    });

    function sparkle() {
      if (reducedMotion) return;
      const rect = fortuneButton.getBoundingClientRect();
      const parent = root.getBoundingClientRect();
      for (let i = 0; i < 15; i++) {
        const star = document.createElement("span");
        star.className = "yun-letter__spark";
        star.setAttribute("aria-hidden", "true");
        star.style.left = (rect.left - parent.left + rect.width / 2) + "px";
        star.style.top = (rect.top - parent.top + rect.height / 2) + "px";
        const angle = Math.PI * 2 * i / 15;
        const distance = 30 + Math.random() * 80;
        star.style.setProperty("--yl-x", Math.cos(angle) * distance + "px");
        star.style.setProperty("--yl-y", Math.sin(angle) * distance + "px");
        root.appendChild(star);
        window.setTimeout(() => star.remove(), 1050);
      }
    }
    if (fortune && fortuneButton) {
      fortuneButton.addEventListener("click", () => {
        let next = quotes[Math.floor(Math.random() * quotes.length)];
        if (next === fortune.textContent && quotes.length > 1) {
          next = quotes[(quotes.indexOf(next) + 1) % quotes.length];
        }
        fortune.textContent = next;
        sparkle();
      });
    }

    if (input && status && saveButton && clearButton) {
      try {
        const saved = window.localStorage.getItem(KEY);
        if (saved !== null) input.value = saved;
      } catch (e) {
        status.textContent = "浏览器限制了本地存储，你仍可以写下文字，但无法在关闭后保留。";
      }
      saveButton.addEventListener("click", () => {
        const message = input.value.trim().slice(0,240);
        if (!message) { status.textContent = "先写一句想对未来的自己说的话吧。"; return; }
        try {
          window.localStorage.setItem(KEY, message);
          input.value = message;
          status.textContent = "已留在这台设备的当前浏览器里。它不会上传到网站。";
        } catch (e) { status.textContent = "保存失败：当前浏览器禁止了本地存储。"; }
      });
      clearButton.addEventListener("click", () => {
        input.value = "";
        try {
          window.localStorage.removeItem(KEY);
          status.textContent = "本地的这封信已清空。";
        } catch (e) { status.textContent = "输入已清空，但无法修改浏览器存储。"; }
      });
    }


    // 本地导入/导出 & D1 云端取回码：默认只在用户点击时执行。
    if (input && status) {
      const exportBtn = root.querySelector("[data-yun-export]");
      const importBtn = root.querySelector("[data-yun-import]");
      const fileInput = root.querySelector("[data-yun-file]");
      const codeInput = root.querySelector("[data-yun-cloud-code]");
      const cloudSave = root.querySelector("[data-yun-cloud-save]");
      const cloudLoad = root.querySelector("[data-yun-cloud-load]");
      const cloudCopy = root.querySelector("[data-yun-cloud-copy]");
      const cloudDelete = root.querySelector("[data-yun-cloud-delete]");
      const CODE_KEY = "yun-letter-cloud-code-v1";
      const API = "/api/yun-letter";
      const validCode = (value) => /^[0-9a-f]{48}$/.test(value);
      const getCode = () => codeInput.value.trim().toLowerCase();
      const setCode = (value) => {
        codeInput.value = value;
        try { if (value) localStorage.setItem(CODE_KEY,value); else localStorage.removeItem(CODE_KEY); } catch(e) {}
      };
      const show = (message) => { status.textContent = message; };
      const cloudButtons = [cloudSave,cloudLoad,cloudCopy,cloudDelete].filter(Boolean);
      const withBusy = async (job) => {
        cloudButtons.forEach(b=>{b.disabled=true;});
        try { await job(); }
        catch(e) { show(e && e.message ? e.message : "操作失败，请稍后重试。"); }
        finally { cloudButtons.forEach(b=>{b.disabled=false;}); }
      };
      if (codeInput) {
        try { codeInput.value = localStorage.getItem(CODE_KEY) || ""; } catch(e) {}
      }
      if (exportBtn) exportBtn.addEventListener("click", () => {
        const content = input.value.trim();
        if (!content) { show("请先写下内容，再下载备份。"); return; }
        const objectURL = URL.createObjectURL(new Blob(["\uFEFF"+content],{type:"text/plain;charset=utf-8"}));
        const link = document.createElement("a");
        link.href = objectURL;
        link.download = "给未来的自己-"+new Date().toISOString().slice(0,10)+".txt";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectURL),1000);
        show("已发起 TXT 下载；请在手机“下载”目录检查文件。");
      });
      if (importBtn && fileInput) {
        importBtn.addEventListener("click",()=>fileInput.click());
        fileInput.addEventListener("change",async()=>{
          const file = fileInput.files && fileInput.files[0];
          if (!file) return;
          try {
            if (file.size > 8192) throw new Error("文件过大，请选择不超过 8 KB 的 TXT 备份。");
            const value = (await file.text()).replace(/^\uFEFF/,"").trim();
            if (!value || value.length > 240) throw new Error("导入内容必须是 1～240 字。");
            input.value = value;
            show("已导入到输入框；点击“存到当前浏览器”才会保存。");
          } catch(e) { show(e.message || "TXT 文件读取失败。"); }
          finally { fileInput.value = ""; }
        });
      }
      async function callCloud(action,extra) {
        let response;
        try {
          response = await fetch(API,{
            method:"POST",credentials:"same-origin",
            headers:{"content-type":"application/json"},
            body:JSON.stringify({action,...extra}),
            cache:"no-store"
          });
        } catch (e) { throw new Error("无法连接云端接口，请确认 Cloudflare Pages Functions 已部署。"); }
        let result;
        try { result = await response.json(); } catch(e) { throw new Error("云端返回了非 JSON 内容，请检查 Pages Functions 部署。"); }
        if (!response.ok) throw new Error(result.error || "云端请求失败（"+response.status+"）。");
        return result;
      }
      if (cloudSave) cloudSave.addEventListener("click",()=>withBusy(async()=>{
        const text = input.value.trim();
        if (!text || text.length > 240) throw new Error("云端留言必须是 1～240 字。");
        const code = getCode();
        if (code && !validCode(code)) throw new Error("取回码必须是 48 位十六进制字符；若需要新建，请清空取回码。");
        const response = await callCloud(code?"update":"create",{code,content:text});
        if (response.code) {
          setCode(response.code);
          show("云端保存成功！已生成取回码，请立即复制或记下来，换设备时需要它。");
        } else {
          setCode(code);
          show("云端记录已更新。请继续保管原取回码。");
        }
      }));
      if (cloudLoad) cloudLoad.addEventListener("click",()=>withBusy(async()=>{
        const code = getCode();
        if (!validCode(code)) throw new Error("请输入有效的 48 位取回码。");
        const response = await callCloud("load",{code});
        if (input.value.trim() && input.value.trim() !== response.content) {
          if (!window.confirm("取回云端内容会覆盖当前输入框文字，确定继续吗？")) return;
        }
        input.value = response.content;
        setCode(code);
        show("已从云端取回，点击本地保存可另外存到当前浏览器。");
      }));
      if (cloudCopy) cloudCopy.addEventListener("click",()=>withBusy(async()=>{
        const code = getCode();
        if (!validCode(code)) throw new Error("还没有有效的取回码。请先上传云端。");
        try {
          await navigator.clipboard.writeText(code);
          show("取回码已复制到剪贴板，请妥善保存。");
        } catch (e) {
          codeInput.focus();
          codeInput.select();
          show("浏览器禁止自动复制，已选中取回码，请手动复制。");
        }
      }));
      if (cloudDelete) cloudDelete.addEventListener("click",()=>withBusy(async()=>{
        const code = getCode();
        if (!validCode(code)) throw new Error("请输入有效的取回码。");
        if (!window.confirm("确定永久删除这条云端记录吗？删除后无法使用取回码恢复。")) return;
        await callCloud("delete",{code});
        setCode("");
        show("云端记录已删除；当前输入框和本地保存内容未更改。");
      }));
    }

    let scheduled = false;
    function updateProgress() {
      scheduled = false;
      if (!bar || !root.isConnected) return;
      const rect = root.getBoundingClientRect();
      const visibleLength = rect.height + window.innerHeight;
      const progress = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / visibleLength));
      bar.style.transform = "scaleX(" + progress.toFixed(4) + ")";
    }
    window.addEventListener("scroll", () => {
      if (!scheduled) {
        scheduled = true;
        window.requestAnimationFrame(updateProgress);
      }
    }, { passive:true });
    window.addEventListener("resize", updateProgress, { passive:true });
    updateProgress();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  document.addEventListener("pjax:complete", init);
})();
