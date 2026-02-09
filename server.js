const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const rooms = new Map();

app.use(express.static("public"));

io.on("connection", (socket) => {
    socket.on("join-room", ({ roomId, role }) => {
        if (!roomId) {
            return;
        }

        socket.join(roomId);
        socket.data.roomId = roomId;
        socket.data.role = role;

        if (!rooms.has(roomId)) {
            rooms.set(roomId, { hostId: null, state: null });
        }

        const room = rooms.get(roomId);

        if (role === "host") {
            room.hostId = socket.id;
        }

        socket.emit("joined-room", {
            roomId,
            role,
            hasHost: Boolean(room.hostId),
            state: room.state,
        });
    });

    socket.on("request-room-state", ({ roomId }) => {
        const room = rooms.get(roomId);
        if (room?.state) {
            socket.emit("room-state", room.state);
        }
    });

    socket.on("host-state-update", ({ roomId, state }) => {
        if (!roomId || !state) {
            return;
        }

        const room = rooms.get(roomId);
        if (!room || room.hostId !== socket.id) {
            return;
        }

        room.state = {
            isPlaying: Boolean(state.isPlaying),
            position: Number(state.position) || 0,
            at: Number(state.at) || Date.now(),
        };

        socket.to(roomId).emit("room-state", room.state);
    });

    socket.on("get-time", (callback) => {
        callback(Date.now());
    });

    socket.on("disconnect", () => {
        const roomId = socket.data.roomId;
        if (!roomId || !rooms.has(roomId)) {
            return;
        }

        const room = rooms.get(roomId);
        if (room.hostId === socket.id) {
            room.hostId = null;
        }

        const socketsInRoom = io.sockets.adapter.rooms.get(roomId)?.size || 0;
        if (socketsInRoom === 0) {
            rooms.delete(roomId);
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log("Server running on port", PORT);
});
