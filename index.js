const express = require('express');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

// Crear la base de datos SQLite (si no existe) y añadir columna `room` si no existe
async function setupDatabase() {
  const db = await open({
    filename: 'chat.db',
    driver: sqlite3.Database
  });

  // Crear tabla de mensajes si no existe
  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      content TEXT,
      room TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return db;
}

async function main() {
  const db = await setupDatabase();

  const app = express();
  const server = createServer(app);
  const io = new Server(server);

  // Servir los archivos estáticos (HTML, CSS, JS) desde el directorio raíz
  app.use(express.static(path.join(__dirname))); // Servir archivos estáticos desde el directorio actual

  // Ruta para eliminar todos los datos de la tabla `messages`
  app.get('/delete-messages', async (req, res) => {
    try {
      await db.exec('DELETE FROM messages');
      res.send('All messages have been deleted.');
    } catch (err) {
      res.status(500).send('Error deleting messages.');
    }
  });

  // Manejar la conexión de los clientes
  io.on('connection', (socket) => {
    console.log('A user connected');

    let username = '';
    let room = '';

    // Escuchar cuando el cliente se identifique con su nombre de usuario y sala
    socket.on('join room', async ({ name, roomName }) => {
      username = name;
      room = roomName;
      socket.join(room);
      console.log(`${username} ha ingresado a la sala ${room}`);

      try {
        // Recuperar todos los mensajes de la sala desde la base de datos
        const rows = await db.all('SELECT * FROM messages WHERE room = ? ORDER BY timestamp ASC', [room]);

        // Enviar todos los mensajes al cliente conectado
        rows.forEach((message) => {
          socket.emit('chat message', {
            username: message.username,
            message: message.content
          });
        });
      } catch (err) {
        console.error('Error retrieving messages:', err);
      }
    });

    // Recibir y enviar mensajes
    socket.on('chat message', async (data) => {
      try {
        // Guardar mensaje en la base de datos asociado al usuario y a la sala
        await db.run('INSERT INTO messages (username, content, room) VALUES (?, ?, ?)', [data.username, data.message, room]);
        console.log('Mensaje guardado:', data);

        // Enviar el mensaje solo a la sala especificada
        io.to(room).emit('chat message', data);
      } catch (error) {
        console.error('Error al guardar el mensaje:', error);
      }
    });

    // Manejar "escribiendo..."
    socket.on('typing', (username) => {
      socket.broadcast.to(room).emit('typing', username);
    });

    // Manejar desconexión
    socket.on('disconnect', () => {
      console.log('User disconnected');
      socket.broadcast.to(room).emit('chat message', { username: 'System', message: `${username} ha salido del chat.` });
    });
  });

  // Iniciar el servidor
  server.listen(4000, () => {
    console.log('Server running at http://localhost:4000');
  });
}

main();
