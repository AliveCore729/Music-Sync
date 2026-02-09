alert("script.js loaded");
console.log("PAGE LOADED:", window.location.pathname, "ROOM:", window.location.search);

const socket = io();
const audio = document.getElementById("audio");
const room = new URLSearchParams(window.location.search).get("room");

if (!room) {
    alert("Invalid or missing room link. Please use the link given by the host.");
    throw new Error("Room ID missing");
}

let unlocked = false;

socket.emit("join-room", room);

let offset = 0;
socket.emit("get-time", serverTime => {
    offset = serverTime - Date.now();
});
function testClick() {
    alert("Button click works");
}


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
    if (!unlocked) return;

    const delay = time - getServerTime();
    if (delay <= 0) {
        audio.play();
    } else {
        setTimeout(() => audio.play(), delay);
    }
}

function unlock() {
    audio.play().then(() => {
        audio.pause();
        unlocked = true;
        alert("Joined successfully. Waiting for host...");
    });
}
