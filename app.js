// 貓狗牛羊 QR 互動遊戲：
// 1 = 狗、2 = 貓、3 = 牛、4 = 羊，隨機出題共 10 題。
(() => {
  const $ = (id) => document.getElementById(id);

  const scoreEl = $("score");
  const promptEl = $("prompt");
  const targetImageEl = $("targetImage");
  const overlayEl = $("overlay");
  const scanHintEl = $("scanHint");

  const btnStart = $("btnStart");
  const btnNext = $("btnNext");
  const btnReset = $("btnReset");

  const video = $("video");
  const canvas = $("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const dogImage = "dog.png";
  const catImage = "cat.png";
  const cowImage = "cow.png";
  const sheepImage = "sheep.png";

  const dogSound = "dog.mp3";
  const catSound = "cat.mp3";
  const cowSound = "cow.mp3";
  const sheepSound = "sheep.mp3";

  let score = 0;
  let expected = 1; // 1: 狗, 2: 貓, 3: 牛, 4: 羊
  let roundLocked = false;
  let timer = null;
  let stream = null;

  const totalRounds = 10;
  let currentRound = 0;

  const audioByExpected = new Map();
  let audioEnabled = false;

  // 掃描模式：優先用 BarcodeDetector，沒有的話改用 jsQR
  let detectorMode = "barcode"; // "barcode" 或 "jsqr"
  let detector = null;
  let detectorReady = false;

  function randExpected() {
    // 1~4 之間隨機一種動物
    const v = Math.floor(Math.random() * 4) + 1;
    return v;
  }

  function imageForExpected(v) {
    switch (v) {
      case 1:
        return dogImage;
      case 2:
        return catImage;
      case 3:
        return cowImage;
      case 4:
      default:
        return sheepImage;
    }
  }

  function soundForExpected(v) {
    switch (v) {
      case 1:
        return dogSound;
      case 2:
        return catSound;
      case 3:
        return cowSound;
      case 4:
      default:
        return sheepSound;
    }
  }

  function initAudio() {
    if (audioEnabled) return;
    audioEnabled = true;

    // 預先建立 Audio 物件，後續切題播放更即時
    audioByExpected.set(1, new Audio(dogSound));
    audioByExpected.set(2, new Audio(catSound));
    audioByExpected.set(3, new Audio(cowSound));
    audioByExpected.set(4, new Audio(sheepSound));

    for (const a of audioByExpected.values()) {
      a.preload = "auto";
      a.volume = 1.0;
    }
  }

  async function playSoundForExpected(v) {
    if (!audioEnabled) return;
    const a = audioByExpected.get(v);
    if (!a) return;
    try {
      a.currentTime = 0;
    } catch {
      // ignore
    }
    try {
      await a.play();
    } catch {
      // 常見：瀏覽器自動播放限制或權限問題
      setScanHint("聲音可能被瀏覽器阻擋，請點一下頁面後再試。");
    }
  }

  function setOverlay(type, text) {
    overlayEl.classList.remove("hidden", "ok", "bad");
    if (!type) {
      overlayEl.classList.add("hidden");
      overlayEl.textContent = "";
      return;
    }
    overlayEl.textContent = text;
    overlayEl.classList.add(type);
  }

  function setPrompt(text) {
    promptEl.textContent = text;
  }

  function setScanHint(text) {
    scanHintEl.textContent = text;
  }

  function normalizeQrValue(raw) {
    // 允許 QR raw 值可能帶空白/換行或附帶字串，只要能抽出 1~4 就判定
    if (raw == null) return null;
    const s = String(raw).trim();
    if (s === "1" || s === "2" || s === "3" || s === "4") return Number(s);
    const m = s.match(/[1-4]/);
    if (!m) return null;
    const n = Number(m[0]);
    return n >= 1 && n <= 4 ? n : null;
  }

  async function ensureDetector() {
    if (detectorReady) return detector;

    // 1) 優先使用瀏覽器原生 BarcodeDetector
    if ("BarcodeDetector" in window) {
      detectorMode = "barcode";
      detector = new BarcodeDetector({ formats: ["qr_code"] });
      detectorReady = true;
      return detector;
    }

    // 2) 若沒有 BarcodeDetector，但有載入 jsQR，就用 jsQR 模式
    if (typeof window.jsQR === "function") {
      detectorMode = "jsqr";
      detector = { jsqr: window.jsQR };
      detectorReady = true;
      return detector;
    }

    // 兩種都沒有，回傳 null
    return null;
  }

  async function startCamera() {
    if (stream) return;
    setScanHint("正在申請鏡頭授權…");
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
  }

  function stopCamera() {
    if (!stream) return;
    try {
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      // ignore
    }
    stream = null;
    video.srcObject = null;
  }

  function startScanLoop() {
    if (timer) return;
    timer = setInterval(async () => {
      if (roundLocked) return;
      if (!detector) return;
      if (video.readyState < 2) return; // 尚未有足夠畫面

      try {
        // 先把畫面畫到 canvas，兩種模式都用得到
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        if (detectorMode === "barcode") {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

          // BarcodeDetector 支援 ImageData 在部分環境；若失敗會落到 catch 裡用替代策略
          let barcodes = null;
          try {
            barcodes = await detector.detect(canvas);
          } catch {
            barcodes = await detector.detect(imageData);
          }

          if (!barcodes || barcodes.length === 0) return;

          for (const bc of barcodes) {
            const val = normalizeQrValue(bc.rawValue);
            if (val == null) continue;

            roundLocked = true;
            handleAnswer(val);
            break;
          }
        } else if (detectorMode === "jsqr" && detector.jsqr) {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const result = detector.jsqr(
            imageData.data,
            imageData.width,
            imageData.height
          );
          if (!result || !result.data) return;

          const val = normalizeQrValue(result.data);
          if (val == null) return;

          roundLocked = true;
          handleAnswer(val);
        }
      } catch (e) {
        // 掃描失敗不要中斷遊戲
      }
    }, 250);
  }

  function stopScanLoop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function updateScore(delta) {
    score += delta;
    scoreEl.textContent = String(score);
  }

  function handleAnswer(scanned) {
    const correct = scanned === expected;
    if (correct) {
      updateScore(1);
      setOverlay("ok", "○");
      setPrompt(`第 ${currentRound}/${totalRounds} 題：答對！掃描到「${scanned}」。`);
    } else {
      setOverlay("bad", "×");
      setPrompt(
        `第 ${currentRound}/${totalRounds} 題：答錯！你掃到「${scanned}」，本題正確是「${expected}」。`
      );
    }

    btnNext.disabled = true;
    btnReset.disabled = false;
    stopScanLoop(); // 避免同一回合多次觸發

    // 小延遲後自動判斷是否進入下一題或結束
    setTimeout(() => {
      if (currentRound >= totalRounds) {
        endGame();
      } else {
        nextRound();
      }
    }, 900);
  }

  function labelForExpected(v) {
    switch (v) {
      case 1:
        return "狗";
      case 2:
        return "貓";
      case 3:
        return "牛";
      case 4:
      default:
        return "羊";
    }
  }

  async function nextRound() {
    roundLocked = false;
    setOverlay(null, "");
    btnNext.disabled = true;
    btnReset.disabled = false;

    currentRound += 1;
    expected = randExpected();
    targetImageEl.src = imageForExpected(expected);
    playSoundForExpected(expected);
    setPrompt(
      `第 ${currentRound}/${totalRounds} 題：請掃描 QR（1=狗、2=貓、3=牛、4=羊）。`
    );

    // 確保 detector/鏡頭/掃描迴圈已就緒
    if (!detector) {
      detector = await ensureDetector();
    }
    if (!detector) {
      setScanHint("此瀏覽器沒有 BarcodeDetector/jsQR，請確認可以存取 jsQR CDN。");
      return;
    }
    try {
      if (!stream) await startCamera();
    } catch (e) {
      setScanHint("鏡頭授權失敗，請確認瀏覽器允許存取鏡頭。");
      return;
    }

    setScanHint("掃描中…");
    startScanLoop();
  }

  function resetGame() {
    stopScanLoop();
    stopCamera();

    score = 0;
    scoreEl.textContent = "0";
    roundLocked = false;
    expected = 1;
    currentRound = 0;
    setOverlay(null, "");

    btnReset.disabled = true;
    btnNext.disabled = true;
    setPrompt("按下「開始遊戲」並授權鏡頭，掃描 QR。共 10 題。");
    targetImageEl.removeAttribute("src");
    setScanHint("等待授權鏡頭…");
  }

  async function startGame() {
    btnStart.disabled = true;
    btnReset.disabled = true;
    btnNext.disabled = true;
    setPrompt("等待鏡頭授權…");
    currentRound = 0;

    // 必須在使用者手勢（點擊開始）裡初始化，才能降低音效被阻擋機率
    initAudio();

    detector = await ensureDetector();
    if (!detector) {
      setScanHint("此瀏覽器沒有 BarcodeDetector/jsQR，請確認網路允許載入 jsQR。");
      btnStart.disabled = false;
      return;
    }

    try {
      await startCamera();
    } catch (e) {
      setScanHint("鏡頭授權失敗，請確認瀏覽器允許存取鏡頭。");
      btnStart.disabled = false;
      return;
    }

    await nextRound();
  }

  function endGame() {
    stopScanLoop();
    stopCamera();
    roundLocked = true;

    setOverlay(null, "");
    setScanHint("");

    setPrompt(`遊戲結束！總得分：${score} / ${totalRounds}。按「重設」可重新開始。`);

    btnNext.disabled = true;
    btnReset.disabled = false;
    // 允許重新開始新的一輪
    btnStart.disabled = false;
  }

  btnStart.addEventListener("click", startGame);
  btnReset.addEventListener("click", resetGame);
  // A方案不需要手動下一題，但保留按鈕避免誤觸
  btnNext.addEventListener("click", nextRound);

  // 初始化
  setOverlay(null, "");
  setScanHint("等待授權鏡頭…");
  targetImageEl.removeAttribute("src");
})();

