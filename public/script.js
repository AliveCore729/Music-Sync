const socket = io();
const audio = document.getElementById("audio");
const room = new URLSearchParams(window.location.search).get("room");

socket.emit("join-room", room);

let offset = 0;

socket.emit("get-time", serverTime => {
    offset = serverTime - Date.now();
});

function getServerTime() {
    return Date.now() + offset;
}

function play() {
    const startAt = getServerTime() + 1000;
    socket.emit("sync-event", {
        room,
        action: "play",
        time: startAt
    });
    schedulePlay(startAt);
}

function pause() {
    socket.emit("sync-event", {
        room,
        action: "pause"
    });
    audio.pause();
}

socket.on("sync-event", data => {
    if (data.action === "play") {
        schedulePlay(data.time);
    }
    if (data.action === "pause") {
        audio.pause();
    }
});

function schedulePlay(time) {
    const delay = time - getServerTime();
    setTimeout(() => audio.play(), delay);
}

function unlock() {
    audio.play().then(() => audio.pause());
}
