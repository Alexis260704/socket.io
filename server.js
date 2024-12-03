const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { MongoClient } = require('mongodb');
const path = require('path');

// URI de conexión a MongoDB Atlas
const uri = "mongodb+srv://alexisbravoalan:5714784@javachat.2vy42.mongodb.net/?retryWrites=true&w=majority&appName=javachat";

// Inicializar Express y Socket.IO
const app = express();
const server = createServer(app);
const io = new Server(server);

// Variable para almacenar la conexión a la base de datos
let db;

// Conectar a MongoDB Atlas una vez
const connectToDb = async () => {
  try {
    const client = new MongoClient(uri);
    await client.connect();
    console.log("Conectado a MongoDB Atlas");

    // Accede a la base de datos
    db = client.db('javachat');
  } catch (err) {
    console.error("Error de conexión a MongoDB", err);
  }
};

// Llamar a la función para conectar a la base de datos
connectToDb();

// Servir archivos estáticos (HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

// Ruta para servir el archivo index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Manejar la conexión de los clientes
io.on('connection', (socket) => {
  let username = '';
  let room = '';

  console.log('Un usuario se ha conectado');

  // Unirse a una sala
  socket.on('join room', async ({ name, roomName }) => {
    if (!db) {
      console.error('No se pudo conectar a la base de datos.');
      return;
    }
    username = name;
    room = roomName;
    socket.join(room);
    console.log(`${username} ha ingresado a la sala ${room}`);

    // Recuperar los mensajes de la sala desde MongoDB
    const messagesCollection = db.collection('messages');
    const messages = await messagesCollection.find({ room: room }).sort({ timestamp: 1 }).toArray();

    // Enviar los mensajes al usuario
    messages.forEach((message) => {
      socket.emit('chat message', {
        username: message.username,
        message: message.content
      });
    });

    // Notificar a la sala que un usuario se ha unido
    socket.broadcast.to(room).emit('chat message', {
      username: 'System',
      message: `${username} se ha unido al chat`
    });
  });

  // Recibir y enviar mensajes
  socket.on('chat message', async (data) => {
    if (!db) {
      console.error('No se pudo conectar a la base de datos.');
      return;
    }
    const { username, message, roomName } = data;

    // Guardar el mensaje en MongoDB
    const messagesCollection = db.collection('messages');
    await messagesCollection.insertOne({
      username,
      content: message,
      room: roomName,
      timestamp: new Date()
    });

    // Enviar el mensaje a la sala correspondiente
    io.to(roomName).emit('chat message', data);
  });

  // Manejar "escribiendo..."
  socket.on('typing', (username) => {
    socket.broadcast.to(room).emit('typing', username);
  });

  // Manejar desconexión
  socket.on('disconnect', () => {
    console.log('Usuario desconectado');
    socket.broadcast.to(room).emit('chat message', { username: 'System', message: `${username} ha salido del chat.` });
  });
});

// Iniciar el servidor
server.listen(4000, () => {
  console.log('Servidor corriendo en http://localhost:4000');
});
