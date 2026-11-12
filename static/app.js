// Semua kode browser ada di file ini agar mudah diikuti.

const app = document.querySelector("#app");
const roomPattern = /^[A-Z0-9-]{4,32}$/;
const SIGNAL_BIT_WIDTH = 34;
const SIGNAL_LEFT_MARGIN = 20;
// Kecepatan sinyal terbentuk: tiap bit digambar dalam SIGNAL_BIT_MS milidetik.
// Pesan yang sangat panjang dipercepat agar total animasi tidak lebih dari
// SIGNAL_MAX_MS, sehingga antrean pesan berikutnya tidak menunggu terlalu lama.
const SIGNAL_BIT_MS = 10000;
const SIGNAL_MAX_MS = 20000;

let username = "";
let closeActiveRoom = null;
let signalImageCount = 0;

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character]));
}

function normalizeRoomId(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

// Teks diubah menjadi bilangan Extended ASCII (kode 0-255, tabel Windows-1252
// seperti di ascii-code.com), satu karakter = satu byte (8 bit data).
// Contoh: "€" = 128 (0x80), "é" = 233 (0xE9). Emoji tidak ada di tabel ini.
const extendedAsciiDecoder = new TextDecoder("windows-1252");
const characterToByte = new Map(
  Array.from({ length: 256 }, (_, byte) => [
    extendedAsciiDecoder.decode(Uint8Array.of(byte)),
    byte,
  ]),
);

function isAscii(text) {
  return [...text].every((character) => characterToByte.has(character));
}

function asciiToBytes(text) {
  return Uint8Array.from([...text], (character) => characterToByte.get(character));
}

function bytesToText(bytes) {
  return extendedAsciiDecoder.decode(bytes);
}

// XOR bekerja pada kode ASCII setiap karakter dan kunci (Room ID).
function xorBytes(bytes, key) {
  const keyBytes = asciiToBytes(key);
  const result = new Uint8Array(bytes.length);

  bytes.forEach((value, index) => {
    result[index] = value ^ keyBytes[index % keyBytes.length];
  });

  return result;
}

function encrypt(text, roomId) {
  return xorBytes(asciiToBytes(text), roomId);
}

function decryptBytes(bytes, roomId) {
  return xorBytes(bytes, roomId);
}

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function bytesToBinary(bytes) {
  return [...bytes]
    .map((value) => value.toString(2).padStart(8, "0"))
    .join("");
}

function createSignalFrame(bytes) {
  const dataBits = bytesToBinary(bytes);
  const byteBits = dataBits.match(/.{8}/g) || [];
  const frames = byteBits.map((byte) => {
    const parityBit = [...byte].filter((bit) => bit === "1").length % 2 === 0 ? "0" : "1";
    const startBit = "1";
    const endBit = byte[7] === "1" ? "0" : "1";

    return `${startBit}${byte}${parityBit}${endBit}`;
  });

  return {
    bits: frames.join(""),
    dataBits,
  };
}

// Frame bit (START + DATA 8 bit + PARITY + END per byte) yang disimpan
// apa adanya di kolom `pesan` tabel `chat`.
function encodeStoredMessage(bytes) {
  return createSignalFrame(bytes).bits;
}

// Mengembalikan elemen <svg> sebagai teks HTML.
// ISI GAMBAR POLOS: hanya grafik sinyal + garis bantu. TIDAK ADA TEKS APA PUN.
// Jika `animate` bernilai true, garis sinyal disembunyikan lebih dulu lalu
// digambar bertahap oleh animateSignal() sampai bit terakhir.
function createSignalImage(frameBits, animate = false) {
  const bitWidth = SIGNAL_BIT_WIDTH;
  const leftMargin = SIGNAL_LEFT_MARGIN;
  const signalWidth = frameBits.length * bitWidth;
  const signalEnd = leftMargin + signalWidth;
  const imageWidth = signalEnd + 20;
  const imageHeight = 110;
  const high = 30;
  const low = 80;
  const gridTop = 12;
  const gridBottom = 98;
  const clipId = `signal-clip-${signalImageCount++}`;
  let level = 0;

  // Jika bit pertama (START) bernilai 0, level dibalik di awal
  // supaya tidak ada garis vertikal paling awal (konsisten dengan START 1).
  if (frameBits[0] === "0") level ^= 1;

  let path = `M ${leftMargin} ${level ? high : low}`;
  let gridLines = "";

  frameBits.split("").forEach((bit, index) => {
    const left = leftMargin + index * bitWidth;
    const middle = left + bitWidth / 2;
    const right = left + bitWidth;

    // Differential Manchester: bit 0 berubah di awal, bit 1 tidak.
    // Bit pertama (index 0) tidak digambar transisinya, karena
    // sudah diterapkan lewat level awal di atas.
    if (bit === "0" && index !== 0) {
      level ^= 1;
      path += ` L ${left} ${level ? high : low}`;
    }

    path += ` L ${middle} ${level ? high : low}`;
    level ^= 1;
    path += ` L ${middle} ${level ? high : low} L ${right} ${level ? high : low}`;

    if (index !== 0) {
      gridLines += `<line x1="${left}" y1="${gridTop}" x2="${left}" y2="${gridBottom}" class="grid"/>`;
    }
  });

  return `
    <svg class="signal-svg" xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}"
         viewBox="0 0 ${imageWidth} ${imageHeight}" role="img" aria-label="Sinyal">
      <style>
        .signal-svg .grid { stroke: #d99ae155; stroke-dasharray: 3 3; }
        .signal-svg .guide { stroke: #d99ae155; stroke-dasharray: 2 4; }
        .signal-svg .signal { stroke: #f8d8fa; stroke-width: 3; stroke-linejoin: round; }
      </style>
      <defs>
        <clipPath id="${clipId}">
          <rect class="signal-clip-rect" x="0" y="0" width="${animate ? leftMargin : imageWidth}" height="${imageHeight}"/>
        </clipPath>
      </defs>
      <rect width="100%" height="100%" fill="#61006f"/>
      <line x1="0" y1="${high}" x2="${imageWidth}" y2="${high}" class="guide"/>
      <line x1="0" y1="${(high + low) / 2}" x2="${imageWidth}" y2="${(high + low) / 2}" class="guide"/>
      <line x1="0" y1="${low}" x2="${imageWidth}" y2="${low}" class="guide"/>
      <g clip-path="url(#${clipId})">
        ${gridLines}
        <path d="${path}" class="signal" fill="none"/>
      </g>
    </svg>`;
}

// Sinyal TERBENTUK OTOMATIS begitu pesan terkirim / diterima: garis digambar
// bertahap dari bit pertama sampai bit terakhir (seperti pena menulis), dan
// layar mengikuti ujung pena. Tidak perlu digeser manual.
// Promise selesai ketika seluruh sinyal sudah terbentuk (dipakai antrean FIFO).
function animateSignal(svg, scroller, bitCount) {
  return new Promise((resolve) => {
    const signalPath = svg.querySelector(".signal");
    const clipRect = svg.querySelector(".signal-clip-rect");
    const totalWidth = Number(svg.getAttribute("width"));
    const length = signalPath.getTotalLength();
    const duration = Math.min(bitCount * SIGNAL_BIT_MS, SIGNAL_MAX_MS);
    const startTime = performance.now();

    // Awalnya garis belum terlihat sama sekali.
    signalPath.style.strokeDasharray = length;
    signalPath.style.strokeDashoffset = length;
    scroller.style.overflowX = "hidden"; // dikunci selama sinyal terbentuk
    scroller.scrollLeft = 0;

    function finish() {
      signalPath.style.strokeDasharray = "";
      signalPath.style.strokeDashoffset = "";
      clipRect.setAttribute("width", totalWidth);
      scroller.style.overflowX = "auto";
      resolve();
    }

    function step(now) {
      // Halaman room sudah ditutup atau pesan dihapus: hentikan animasi.
      if (!svg.isConnected) {
        resolve();
        return;
      }

      const progress = duration > 0 ? Math.min((now - startTime) / duration, 1) : 1;
      const drawn = length * progress;
      const pen = signalPath.getPointAtLength(drawn);

      // Garis digambar sepanjang `drawn`; garis bantu ikut terbuka sampai ujung pena.
      signalPath.style.strokeDashoffset = length - drawn;
      clipRect.setAttribute("width", pen.x + 2);
      // Layar mengikuti ujung pena.
      scroller.scrollLeft = Math.max(0, pen.x - scroller.clientWidth + 40);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        finish();
      }
    }

    requestAnimationFrame(step);
  });
}

function navigation(activePage) {
  return `
    <header class="navigation">
      <div class="navigation-inner">
        <a href="#/home">P2P Chat</a>
        <nav>
          <a href="#/home">Beranda</a>
          <a href="#/profile">Profil</a>
        </nav>
      </div>
    </header>`;
}

async function api(path, options = {}) {
  const requestOptions = { credentials: "include", ...options };
  const headers = { ...requestOptions.headers };
  if (requestOptions.body) headers["Content-Type"] = "application/json";

  const response = await fetch(path, {
    ...requestOptions,
    headers,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Permintaan gagal.");
  return data;
}

function showEntryPage(mode = "login", message = "") {
  const isLogin = mode === "login";
  app.innerHTML = `
    <main class="center">
      <section class="card small-card">
        <div class="logo">P2P</div>
        <h1>${isLogin ? "Masuk" : "Daftar"} ke P2P Chat</h1>
        <p class="muted">Pesan dikirim langsung antar-browser melalui WebRTC.</p>
        <form id="auth-form" class="form">
          <label>
            Username
            <input id="username-input" maxlength="100" required autofocus>
          </label>
          <label>
            Password
            <input id="password-input" type="password" minlength="8" maxlength="72" required>
          </label>
          <div id="auth-error" class="error">${escapeHtml(message)}</div>
          <button type="submit">${isLogin ? "Masuk" : "Daftar"}</button>
        </form>
        <p class="muted">${isLogin ? "Belum punya akun?" : "Sudah punya akun?"}
          <a href="#/${isLogin ? "register" : "login"}">${isLogin ? "Daftar" : "Masuk"}</a>
        </p>
      </section>
    </main>`;

  document.querySelector("#auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const error = document.querySelector("#auth-error");
    try {
      const data = await api(`/api/${isLogin ? "login" : "register"}`, {
        method: "POST",
        body: JSON.stringify({
          username: document.querySelector("#username-input").value.trim(),
          password: document.querySelector("#password-input").value,
        }),
      });
      username = data.username;
      location.hash = "#/home";
    } catch (requestError) {
      error.textContent = requestError.message;
    }
  });
}

function showHomePage() {
  app.innerHTML = `
    ${navigation("home")}
    <main class="content">
      <h1>Selamat datang, ${escapeHtml(username)}!</h1>
      <p class="muted">Satu room dapat digunakan oleh maksimal dua orang.</p>
      <div class="columns">
        <section class="card">
          <h2>Buat room baru</h2>
          <p class="muted">Room ID juga menjadi kunci XOR.</p>
          <button id="generate-room">Buat Room ID</button>
          <div id="new-room"></div>
        </section>
        <section class="card">
          <h2>Gabung ke room</h2>
          <form id="join-form" class="form">
            <input id="room-input" maxlength="32" placeholder="Contoh: ABCD-2345">
            <div id="join-error" class="error"></div>
            <button type="submit">Gabung</button>
          </form>
        </section>
      </div>
    </main>`;

  document.querySelector("#generate-room").addEventListener("click", async (event) => {
    // Room ID dibuat di server agar dicek dulu ke database (tidak duplikat).
    const button = event.currentTarget;
    const output = document.querySelector("#new-room");
    button.disabled = true;
    let newRoom;
    try {
      ({ roomId: newRoom } = await api("/api/rooms", { method: "POST" }));
    } catch (requestError) {
      output.innerHTML = `<div class="error">${escapeHtml(requestError.message)}</div>`;
      return;
    } finally {
      button.disabled = false;
    }
    output.innerHTML = `
      <p><code>${escapeHtml(newRoom)}</code></p>
      <button id="open-room" class="secondary">Masuk ke room</button>`;
    document.querySelector("#open-room").addEventListener("click", () => {
      location.hash = `#/room/${newRoom}`;
    });
  });

  document.querySelector("#join-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const roomId = normalizeRoomId(document.querySelector("#room-input").value);
    const error = document.querySelector("#join-error");

    if (!roomPattern.test(roomId)) {
      error.textContent = "Room ID harus 4-32 karakter.";
      return;
    }

    location.hash = `#/room/${roomId}`;
  });
}

function showProfilePage() {
  app.innerHTML = `
    ${navigation("profile")}
    <main class="content">
      <section class="card small-card">
        <div class="logo">${escapeHtml(username[0].toUpperCase())}</div>
        <p class="muted">USERNAME</p>
        <h1>${escapeHtml(username)}</h1>
        <button id="logout">Reset / Keluar</button>
        <div id="logout-error" class="error"></div>
      </section>
    </main>`;

  document.querySelector("#logout").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const error = document.querySelector("#logout-error");
    button.disabled = true;
    try {
      await api("/api/logout", { method: "POST" });
      username = "";
      location.hash = "#/login";
    } catch (requestError) {
      error.textContent = requestError.message;
      button.disabled = false;
    }
  });
}

function statusLabel(name, value) {
  const goodValues = ["connected", "open", "completed"];
  const badValues = ["failed", "error", "closed", "room-full", "disconnected"];
  const className = goodValues.includes(value) ? "good" : badValues.includes(value) ? "bad" : "";
  return `<span class="${className}">${name}: ${value}</span>`;
}

function showRoomPage(roomId) {
  app.innerHTML = `
    <div class="room">
      <header class="room-header">
        <div class="room-header-inner">
          <a href="#/home" id="back-home">← Beranda</a>
          <h1>Room <code>${roomId}</code></h1>
          <div class="muted">Kamu: ${escapeHtml(username)} · Lawan: <b id="peer-name">menunggu...</b></div>
          <div id="statuses" class="status"></div>
          <div id="room-error" class="error"></div>
        </div>
      </header>
      <main id="messages" class="messages"></main>
      <footer class="composer">
        <form id="message-form">
          <input id="message-input" disabled placeholder="Menunggu koneksi P2P...">
          <button disabled>Kirim</button>
        </form>
      </footer>
    </div>`;

  closeActiveRoom = startWebRTC(roomId);

  document.querySelector("#back-home").addEventListener("click", (event) => {
    event.preventDefault();

    // Putuskan session room sebelum berpindah ke halaman beranda.
    closeActiveRoom?.();
    closeActiveRoom = null;
    location.hash = "#/home";
  });
}

function startWebRTC(roomId) {
  const socket = io();
  const statuses = { signaling: "connecting", peer: "waiting", ice: "new", channel: "closed" };
  const messages = document.querySelector("#messages");
  const input = document.querySelector("#message-input");
  const sendButton = document.querySelector("#message-form button");
  let peerConnection = null;
  let dataChannel = null;
  let remoteSocketId = null;
  let waitingCandidates = [];
  let isClosed = false;

  // Antrean FIFO untuk pesan masuk: pesan yang datang lebih dulu ditampilkan
  // (dan sinyalnya selesai terbentuk) lebih dulu. Pesan berikutnya menunggu
  // di belakang antrean, tidak boleh menyalip.
  const incomingQueue = [];
  let isPlayingQueue = false;

  function enqueueIncoming(item) {
    incomingQueue.push(item); // masuk dari belakang
    if (!isPlayingQueue) playIncomingQueue();
  }

  async function playIncomingQueue() {
    isPlayingQueue = true;
    while (incomingQueue.length > 0 && !isClosed) {
      const item = incomingQueue.shift(); // keluar dari depan (yang paling lama)
      await showChatMessage(item.dataBytes, item.sender, false, item.timestamp, true);
    }
    isPlayingQueue = false;
  }

  function updateStatus() {
    document.querySelector("#statuses").innerHTML = [
      statusLabel("Signaling", statuses.signaling),
      statusLabel("Peer", statuses.peer),
      statusLabel("ICE", statuses.ice),
      statusLabel("DataChannel", statuses.channel),
    ].join("");

    const ready = statuses.channel === "open";
    input.disabled = !ready;
    sendButton.disabled = !ready;
  }

  function showSystemMessage(text) {
    messages.insertAdjacentHTML("beforeend", `<div class="system">${escapeHtml(text)}</div>`);
  }

  // Kartu pesan hanya berisi gambar sinyal polos (tanpa tulisan).
  // Teks asli hanya ditampilkan setelah pengguna memverifikasi password akunnya.
  // Mengembalikan Promise yang selesai setelah sinyal selesai terbentuk
  // (langsung selesai bila animate = false, misalnya untuk riwayat).
  function showChatMessage(dataBytes, sender, outgoing, timestamp, animate = false) {
    const signal = createSignalFrame(dataBytes);
    messages.insertAdjacentHTML("beforeend", `
      <article class="message ${outgoing ? "outgoing" : ""}">
        <div class="meta">${escapeHtml(sender)} · ${new Date(timestamp).toLocaleTimeString("id-ID")}</div>
        <div class="signal-card">
          <div class="signal-scroll">
            ${createSignalImage(signal.bits, animate)}
          </div>
          <button type="button" class="translate-button secondary">Terjemahkan</button>
          <form class="translation-form form" hidden>
            <label>
              Password akun
              <input type="password" name="password" minlength="8" maxlength="72"
                     autocomplete="current-password" required>
            </label>
            <div class="translation-error error" role="alert"></div>
            <button type="submit">Buka teks asli</button>
          </form>
          <div class="translated-text" hidden></div>
        </div>
      </article>`);

    const message = messages.lastElementChild;
    const translateButton = message.querySelector(".translate-button");
    const form = message.querySelector(".translation-form");
    const passwordInput = form.elements.password;
    const error = message.querySelector(".translation-error");
    const translatedText = message.querySelector(".translated-text");

    translateButton.addEventListener("click", () => {
      translateButton.hidden = true;
      form.hidden = false;
      passwordInput.focus();
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitButton = form.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      error.textContent = "";
      try {
        await api("/api/verify-password", {
          method: "POST",
          body: JSON.stringify({ password: passwordInput.value }),
        });
        translatedText.textContent = bytesToText(dataBytes);
        translatedText.hidden = false;
        form.hidden = true;
      } catch (requestError) {
        error.textContent = requestError.message;
      } finally {
        passwordInput.value = "";
        submitButton.disabled = false;
      }
    });

    messages.scrollTop = messages.scrollHeight;

    if (!animate) return Promise.resolve();
    return animateSignal(
      message.querySelector(".signal-svg"),
      message.querySelector(".signal-scroll"),
      signal.bits.length,
    );
  }

  function setupDataChannel(channel) {
    dataChannel = channel;
    statuses.channel = channel.readyState;
    updateStatus();

    channel.onopen = () => {
      statuses.channel = "open";
      updateStatus();
      showSystemMessage("DataChannel terbuka. Pesan dikirim langsung.");
      channel.send(JSON.stringify({ type: "hello", username }));
    };

    channel.onclose = () => {
      statuses.channel = "closed";
      updateStatus();
    };

    channel.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "hello") {
        document.querySelector("#peer-name").textContent = message.username;
      }
      if (message.type === "chat") {
        const bytes = base64ToBytes(message.cipher);
        const dataBytes = decryptBytes(bytes, roomId);
        // Masuk antrean FIFO, bukan langsung ditampilkan.
        enqueueIncoming({
          dataBytes,
          sender: message.sender,
          timestamp: message.timestamp,
        });
      }
    };
  }

  function createPeerConnection(peerId) {
    peerConnection?.close();
    remoteSocketId = peerId;
    waitingCandidates = [];

    peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", {
          to: peerId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    peerConnection.onconnectionstatechange = () => {
      statuses.peer = peerConnection.connectionState;
      updateStatus();
    };

    peerConnection.oniceconnectionstatechange = () => {
      statuses.ice = peerConnection.iceConnectionState;
      updateStatus();
    };

    peerConnection.ondatachannel = (event) => setupDataChannel(event.channel);
    statuses.peer = "new";
    updateStatus();
    return peerConnection;
  }

  async function addWaitingCandidates() {
    for (const candidate of waitingCandidates) {
      await peerConnection.addIceCandidate(candidate);
    }
    waitingCandidates = [];
  }

  socket.on("connect", () => {
    statuses.signaling = "connected";
    updateStatus();
    socket.emit("join-room", { roomId, username });
  });

  socket.on("connect_error", () => {
    statuses.signaling = "error";
    document.querySelector("#room-error").textContent = "Gagal terhubung ke server.";
    updateStatus();
  });

  // Server mengirim riwayat chat dari database saat kita masuk (atau tersambung
  // ulang ke) room. Tampilan dikosongkan dulu agar pesan tidak dobel.
  // Riwayat langsung ditampilkan utuh tanpa animasi.
  socket.on("room-joined", ({ history = [] }) => {
    messages.innerHTML = "";
    incomingQueue.length = 0;
    history.forEach((item) => {
      showChatMessage(
        Uint8Array.from(item.bytes),
        item.sender,
        item.outgoing,
        item.timestamp,
      );
    });
    showSystemMessage(
      history.length
        ? `Riwayat dimuat (${history.length} pesan terakhir).`
        : "Belum ada riwayat chat di room ini.",
    );
  });

  socket.on("room-full", () => {
    statuses.peer = "room-full";
    document.querySelector("#room-error").textContent = "Room sudah penuh.";
    updateStatus();
  });

  socket.on("peer-joined", async ({ socketId, username: peerName }) => {
    document.querySelector("#peer-name").textContent = peerName;
    const connection = createPeerConnection(socketId);
    setupDataChannel(connection.createDataChannel("chat"));
    await connection.setLocalDescription(await connection.createOffer());
    socket.emit("offer", { to: socketId, sdp: connection.localDescription.toJSON() });
  });

  socket.on("offer", async ({ from, sdp, username: peerName }) => {
    document.querySelector("#peer-name").textContent = peerName;
    const connection = createPeerConnection(from);
    await connection.setRemoteDescription(sdp);
    await addWaitingCandidates();
    await connection.setLocalDescription(await connection.createAnswer());
    socket.emit("answer", { to: from, sdp: connection.localDescription.toJSON() });
  });

  socket.on("answer", async ({ from, sdp }) => {
    if (peerConnection && remoteSocketId === from) {
      await peerConnection.setRemoteDescription(sdp);
      await addWaitingCandidates();
    }
  });

  socket.on("ice-candidate", async ({ from, candidate }) => {
    if (!peerConnection || remoteSocketId !== from) return;
    if (!peerConnection.remoteDescription) {
      waitingCandidates.push(candidate);
      return;
    }
    await peerConnection.addIceCandidate(candidate);
  });

  socket.on("peer-left", ({ username: peerName }) => {
    peerConnection?.close();
    statuses.peer = "waiting";
    statuses.channel = "closed";
    document.querySelector("#peer-name").textContent = "menunggu...";
    showSystemMessage(`${peerName || "Lawan bicara"} keluar dari room.`);
    updateStatus();
  });

  function closeRoom() {
    if (isClosed) return;
    isClosed = true;
    incomingQueue.length = 0;

    // Beri tahu server sebelum memutus Socket.IO.
    socket.emit("leave-room");
    socket.removeAllListeners();
    socket.disconnect();

    dataChannel?.close();
    peerConnection?.close();
    dataChannel = null;
    peerConnection = null;
    remoteSocketId = null;
    waitingCandidates = [];
  }

  document.querySelector("#message-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || !dataChannel || dataChannel.readyState !== "open") return;

    if (!isAscii(text)) {
      showSystemMessage("Pesan hanya boleh berisi karakter Extended ASCII (kode 0-255, mis. € é ©). Emoji tidak didukung.");
      return;
    }

    const bytes = encrypt(text, roomId);
    const dataBytes = asciiToBytes(text);
    const frame = encodeStoredMessage(dataBytes);
    if (frame.length > 65535) {
      showSystemMessage("Pesan terlalu panjang untuk disimpan (maksimal 5957 karakter).");
      return;
    }
    const message = {
      type: "chat",
      sender: username,
      cipher: bytesToBase64(bytes),
      timestamp: Date.now(),
    };

    // Kirim dulu agar lawan bicara langsung menerima, baru gambar sinyal sendiri.
    dataChannel.send(JSON.stringify(message));
    socket.emit("save-chat", { frame });
    showChatMessage(dataBytes, username, true, message.timestamp, true);
    input.value = "";
  });

  updateStatus();
  return closeRoom;
}

function routePage() {
  const parts = location.hash.slice(2).split("/");

  // Route lama harus dibersihkan sebelum halaman baru dibuat.
  closeActiveRoom?.();
  closeActiveRoom = null;

  if (!username) {
    showEntryPage(parts[0] === "register" ? "register" : "login");
    return;
  }

  if (parts[0] === "profile") {
    showProfilePage();
  } else if (parts[0] === "room" && roomPattern.test(normalizeRoomId(parts[1]))) {
    showRoomPage(normalizeRoomId(parts[1]));
  } else {
    showHomePage();
  }
}

window.addEventListener("hashchange", routePage);
window.addEventListener("pagehide", () => closeActiveRoom?.());

api("/api/me")
  .then((data) => {
    username = data.authenticated ? data.username : "";
    routePage();
  })
  .catch((requestError) => {
    username = "";
    showEntryPage("login", requestError.message);
  });