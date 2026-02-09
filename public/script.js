const socket = io();
const audio = document.getElementById("audio");
const room = new URLSearchParams(window.location.search).get("room");
const statusText = document.getElementById("status");
const shareLink = document.getElementById("shareLink");
const joinBtn = document.getElementById("joinBtn");
const isHost = window.location.pathname.includes("host.html");

if (!room) {
  showStatus("Invalid or missing room link.");
  throw new Error("Room ID missing");
}

let unlocked = false;
let pendingState = null;
let offset = 0;
let hostBroadcastTimer = null;

socket.emit("get-time", (serverTime) => {
  offset = serverTime - Date.now();
});

socket.emit("join-room", {
  roomId: room,
  role: isHost ? "host" : "guest",
});

if (shareLink && isHost) {
  const guestUrl = `${window.location.origin}/client.html?room=${room}`;
  shareLink.textContent = guestUrl;
  shareLink.href = guestUrl;
}

socket.on("joined-room", ({ hasHost, state }) => {
  if (isHost) {
    showStatus("You are the host. Press play to start synced audio.");
  } else if (!hasHost) {
    showStatus("Waiting for host to connect...");
  } else {
    showStatus("Connected. Tap Join Session once to allow audio.");
  }

  if (state) {
    applyRoomState(state);
  }
});

socket.on("room-state", (state) => {
  applyRoomState(state);
});

if (isHost) {
  audio.addEventListener("play", () => {
    startHostBroadcast();
    sendHostState(true);
  });

  audio.addEventListener("pause", () => {
    stopHostBroadcast();
    sendHostState(false);
  });

  audio.addEventListener("seeking", () => {
    sendHostState(!audio.paused);
  });

  audio.addEventListener("ended", () => {
    stopHostBroadcast();
    sendHostState(false);
  });
}

if (joinBtn && !isHost) {
  joinBtn.addEventListener("click", unlockAudio);
}

function getServerTime() {
  return Date.now() + offset;
}

function play() {
  audio.play().catch(() => {
    showStatus("Playback blocked. Tap Join Session first.");
  });
}

function pause() {
  audio.pause();
}

function sendHostState(isPlaying) {
  if (!isHost) {
    return;
  }

  socket.emit("host-state-update", {
    roomId: room,
    state: {
      isPlaying,
      position: audio.currentTime,
      at: getServerTime(),
    },
  });
}

function startHostBroadcast() {
  stopHostBroadcast();
  hostBroadcastTimer = setInterval(() => {
    sendHostState(!audio.paused);
  }, 2000);
}

function stopHostBroadcast() {
  if (hostBroadcastTimer) {
    clearInterval(hostBroadcastTimer);
    hostBroadcastTimer = null;
  }
}

function applyRoomState(state) {
  if (isHost) {
    return;
  }

  pendingState = state;
  if (!unlocked) {
    return;
  }

  syncToState(state);
}

function syncToState(state) {
  const now = getServerTime();
  const positionAtNow =
    state.position + (state.isPlaying ? Math.max(0, (now - state.at) / 1000) : 0);

  if (Number.isFinite(positionAtNow) && Math.abs(audio.currentTime - positionAtNow) > 0.25) {
    audio.currentTime = positionAtNow;
  }

  if (state.isPlaying) {
    audio.play().catch(() => {
      showStatus("Tap Join Session to allow playback on this phone.");
    });
  } else {
    audio.pause();
  }
}

function unlockAudio() {
  audio
    .play()
    .then(() => {
      audio.pause();
      unlocked = true;
      showStatus("Joined. Waiting for host playback...");
      socket.emit("request-room-state", { roomId: room });
      if (pendingState) {
        syncToState(pendingState);
      }
    })
    .catch(() => {
      showStatus("Could not unlock audio. Try again.");
    });
}

function showStatus(message) {
  if (statusText) {
    statusText.textContent = message;
  }
}
