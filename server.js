const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static("public"));

io.on("connection", socket => {
    socket.on("join-room", roomId => {
        socket.join(roomId);
    });

    socket.on("sync-event", data => {
        socket.to(data.room).emit("sync-event", data);
    });

    socket.on("get-time", callback => {
        callback(Date.now());
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log("Server running on port", PORT);
});

