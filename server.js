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
            rooms.set(roomId, {
                hostId: null,
                stream: {
                    active: false,
                    mimeType: null,
                },
            });
        }

        const room = rooms.get(roomId);

        if (role === "host") {
            room.hostId = socket.id;
        }

        socket.emit("joined-room", {
            roomId,
            role,
            hasHost: Boolean(room.hostId),
            stream: room.stream,
        });
    });

    socket.on("host-start-stream", ({ roomId, mimeType }) => {
        if (!roomId || !mimeType) {
            return;
        }

        const room = rooms.get(roomId);
        if (!room || room.hostId !== socket.id) {
            return;
        }

        room.stream = {
            active: true,
            mimeType,
        };

        socket.to(roomId).emit("stream-start", room.stream);
    });

    socket.on("audio-chunk", ({ roomId, chunk }) => {
        if (!roomId || !chunk) {
            return;
        }

        const room = rooms.get(roomId);
        if (!room || room.hostId !== socket.id) {
            return;
        }

        if (!room.stream.active) {
            return;
        }

        socket.to(roomId).emit("audio-chunk", chunk);
    });

    socket.on("host-stop-stream", ({ roomId }) => {
        if (!roomId) {
            return;
        }

        const room = rooms.get(roomId);
        if (!room || room.hostId !== socket.id) {
            return;
        }

        room.stream = {
            active: false,
            mimeType: null,
        };

        socket.to(roomId).emit("stream-stop");
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
            room.stream = {
                active: false,
                mimeType: null,
            };
            socket.to(roomId).emit("stream-stop");
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
