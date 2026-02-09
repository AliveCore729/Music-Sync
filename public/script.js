const socket = io();
const room = new URLSearchParams(window.location.search).get("room");
const statusText = document.getElementById("status");
const shareLink = document.getElementById("shareLink");
const joinBtn = document.getElementById("joinBtn");
const startBtn = document.getElementById("startStreamBtn");
const stopBtn = document.getElementById("stopStreamBtn");
const audio = document.getElementById("audio");
const isHost = window.location.pathname.includes("host.html");

let mediaRecorder = null;
let captureStream = null;
let sourceOpen = false;
let sourceBuffer = null;
let mediaSource = null;
let chunkQueue = [];
let userJoined = false;

if (!room) {
  showStatus("Invalid or missing room link.");
  throw new Error("Room ID missing");
}

socket.emit("join-room", {
  roomId: room,
  role: isHost ? "host" : "guest",
});

if (shareLink && isHost) {
  const guestUrl = `${window.location.origin}/client.html?room=${room}`;
  shareLink.textContent = guestUrl;
  shareLink.href = guestUrl;
}

if (joinBtn) {
  joinBtn.addEventListener("click", () => {
    userJoined = true;
    showStatus("Joined room. Waiting for host stream...");
    if (audio) {
      audio.muted = false;
      audio.play().catch(() => {
        // A later stream-start normally succeeds after this user gesture.
      });
    }
  });
}

if (startBtn) {
  startBtn.addEventListener("click", startHostStream);
}

if (stopBtn) {
  stopBtn.addEventListener("click", stopHostStream);
}

socket.on("joined-room", ({ hasHost, stream }) => {
  if (isHost) {
    showStatus("Host connected. Click Start Streaming and share your screen/tab audio.");
    return;
  }

  if (!hasHost) {
    showStatus("Waiting for host to connect...");
    return;
  }

  if (stream?.active && stream?.mimeType) {
    setupGuestPipeline(stream.mimeType);
    showStatus("Host stream is live. Tap Join Session to hear audio.");
  } else {
    showStatus("Connected. Waiting for host to start stream.");
  }
});

socket.on("stream-start", ({ mimeType }) => {
  if (isHost) {
    return;
  }

  setupGuestPipeline(mimeType);
  if (userJoined) {
    audio.play().catch(() => {
      showStatus("Tap Join Session again to allow playback.");
    });
  } else {
    showStatus("Host stream started. Tap Join Session to hear audio.");
  }
});

socket.on("audio-chunk", (chunk) => {
  if (isHost || !sourceBuffer) {
    return;
  }

  const normalizedChunk = normalizeChunk(chunk);
  if (!normalizedChunk) {
    return;
  }

  chunkQueue.push(normalizedChunk);
  appendNextChunk();
});

socket.on("stream-stop", () => {
  if (isHost) {
    showStatus("Stream stopped.");
    return;
  }

  resetGuestPipeline();
  showStatus("Host stopped streaming.");
});

async function startHostStream() {
  if (!isHost || mediaRecorder) {
    return;
  }

  try {
    captureStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });

    const audioTracks = captureStream.getAudioTracks();
    if (!audioTracks.length) {
      showStatus("No share-audio selected. Restart and tick share audio.");
      stopTracks(captureStream);
      captureStream = null;
      return;
    }

    const audioOnlyStream = new MediaStream(audioTracks);
    const mimeType = pickSupportedMimeType();
    if (!mimeType) {
      showStatus("This browser does not support required live audio codec.");
      stopTracks(captureStream);
      captureStream = null;
      return;
    }

    mediaRecorder = new MediaRecorder(audioOnlyStream, { mimeType });
    mediaRecorder.ondataavailable = async (event) => {
      if (!event.data || event.data.size === 0) {
        return;
      }

      const chunk = await event.data.arrayBuffer();
      socket.emit("audio-chunk", { roomId: room, chunk });
    };

    mediaRecorder.onstop = () => {
      socket.emit("host-stop-stream", { roomId: room });
      mediaRecorder = null;
      if (captureStream) {
        stopTracks(captureStream);
        captureStream = null;
      }
      updateHostButtons(false);
    };

    captureStream.getVideoTracks().forEach((track) => {
      track.onended = () => {
        stopHostStream();
      };
    });

    socket.emit("host-start-stream", { roomId: room, mimeType });
    mediaRecorder.start(250);
    updateHostButtons(true);
    showStatus("Streaming live laptop audio to guests.");
  } catch (error) {
    showStatus("Screen/audio share cancelled or blocked.");
  }
}

function stopHostStream() {
  if (!mediaRecorder) {
    return;
  }

  mediaRecorder.stop();
}

function pickSupportedMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];

  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  return null;
}

function setupGuestPipeline(mimeType) {
  if (!audio) {
    return;
  }

  resetGuestPipeline();

  mediaSource = new MediaSource();
  audio.src = URL.createObjectURL(mediaSource);

  mediaSource.addEventListener("sourceopen", () => {
    try {
      sourceBuffer = mediaSource.addSourceBuffer(mimeType);
      sourceBuffer.mode = "sequence";
      sourceOpen = true;
      sourceBuffer.addEventListener("updateend", appendNextChunk);
      appendNextChunk();
    } catch (error) {
      showStatus("Guest browser cannot play this stream format.");
    }
  });
}

function appendNextChunk() {
  if (!sourceOpen || !sourceBuffer || sourceBuffer.updating || !chunkQueue.length) {
    return;
  }

  const next = chunkQueue.shift();
  try {
    sourceBuffer.appendBuffer(next);
  } catch (error) {
    showStatus("Playback buffer error. Rejoin the room.");
    resetGuestPipeline();
  }
}

function resetGuestPipeline() {
  chunkQueue = [];
  sourceOpen = false;

  if (sourceBuffer) {
    sourceBuffer.removeEventListener("updateend", appendNextChunk);
  }

  sourceBuffer = null;

  if (audio) {
    audio.removeAttribute("src");
    audio.load();
  }

  mediaSource = null;
}

function normalizeChunk(chunk) {
  if (chunk instanceof ArrayBuffer) {
    return new Uint8Array(chunk);
  }

  if (ArrayBuffer.isView(chunk)) {
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }

  return null;
}

function updateHostButtons(streaming) {
  if (!startBtn || !stopBtn) {
    return;
  }

  startBtn.disabled = streaming;
  stopBtn.disabled = !streaming;
}

function stopTracks(stream) {
  stream.getTracks().forEach((track) => track.stop());
}

function showStatus(message) {
  if (statusText) {
    statusText.textContent = message;
  }
}
