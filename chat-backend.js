// ===========================
// CHAT SYSTEM BACKEND
// Node.js + Express + Socket.io + PostgreSQL
// ===========================

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const redis = require('redis');
const dotenv = require('dotenv');

dotenv.config();

// ===========================
// CONFIGURATION
// ===========================

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling']
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database
const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'chat_system',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

// Redis - for cache and presence
const redisClient = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379
});
redisClient.connect();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// ===========================
// DATABASE INITIALIZATION
// ===========================

async function initializeDatabase() {
  const client = await db.connect();
  try {
    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        avatar_url VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Conversations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR(255),
        type VARCHAR(50) DEFAULT 'direct',
        created_by BIGINT REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Conversation members
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversation_members (
        id BIGSERIAL PRIMARY KEY,
        conversation_id BIGINT REFERENCES conversations(id) ON DELETE CASCADE,
        user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(conversation_id, user_id)
      );
    `);

    // Messages table
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id BIGSERIAL PRIMARY KEY,
        conversation_id BIGINT REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id BIGINT REFERENCES users(id),
        content TEXT NOT NULL,
        message_type VARCHAR(50) DEFAULT 'text',
        is_deleted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Message status (delivered, read)
    await client.query(`
      CREATE TABLE IF NOT EXISTS message_status (
        id BIGSERIAL PRIMARY KEY,
        message_id BIGINT REFERENCES messages(id) ON DELETE CASCADE,
        user_id BIGINT REFERENCES users(id),
        status VARCHAR(50) DEFAULT 'sent',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(message_id, user_id)
      );
    `);

    // Indexes for fast access
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_created 
      ON messages(conversation_id, created_at DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversation_members_user 
      ON conversation_members(user_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_message_status_user 
      ON message_status(user_id);
    `);

    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  } finally {
    client.release();
  }
}

// ===========================
// UTILS & HELPERS
// ===========================

// JWT Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'No token provided' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
};

// Hash password
const hashPassword = async (password) => {
  return await bcrypt.hash(password, 10);
};

// Verify password
const verifyPassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

// ===========================
// REST API ENDPOINTS
// ===========================

// 1. AUTHENTICATION

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const passwordHash = await hashPassword(password);

    const result = await db.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, email, passwordHash]
    );

    const user = result.rows[0];
    const token = generateToken(user.id);

    res.status(201).json({
      message: 'User created successfully',
      user,
      token
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Missing credentials' });
    }

    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await verifyPassword(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user.id);

    res.json({
      message: 'Login successful',
      user: { id: user.id, username: user.username, email: user.email },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. USERS

// Get user profile
app.get('/api/users/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Try Redis cache first
    const cached = await redisClient.get(`user:${userId}`);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const result = await db.query(
      'SELECT id, username, email, avatar_url, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Cache for 1 hour
    await redisClient.setEx(`user:${userId}`, 3600, JSON.stringify(user));

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. CONVERSATIONS

// Create direct conversation
app.post('/api/conversations/direct', authenticateToken, async (req, res) => {
  try {
    const { participantId } = req.body;
    const userId = req.user.userId;

    if (!participantId) {
      return res.status(400).json({ error: 'participantId required' });
    }

    if (userId === parseInt(participantId)) {
      return res.status(400).json({ error: 'Cannot chat with yourself' });
    }

    // Check if conversation already exists
    const existingConv = await db.query(`
      SELECT c.id FROM conversations c
      JOIN conversation_members cm1 ON c.id = cm1.conversation_id
      JOIN conversation_members cm2 ON c.id = cm2.conversation_id
      WHERE c.type = 'direct'
      AND cm1.user_id = $1 AND cm2.user_id = $2
    `, [userId, participantId]);

    if (existingConv.rows.length > 0) {
      return res.json({ id: existingConv.rows[0].id });
    }

    // Create new conversation
    const convResult = await db.query(
      'INSERT INTO conversations (type, created_by) VALUES ($1, $2) RETURNING id',
      ['direct', userId]
    );

    const conversationId = convResult.rows[0].id;

    // Add members
    await db.query(
      'INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2)',
      [conversationId, userId]
    );

    await db.query(
      'INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2)',
      [conversationId, participantId]
    );

    res.status(201).json({ id: conversationId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create group conversation
app.post('/api/conversations/group', authenticateToken, async (req, res) => {
  try {
    const { name, memberIds } = req.body;
    const userId = req.user.userId;

    if (!name || !Array.isArray(memberIds)) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    const convResult = await db.query(
      'INSERT INTO conversations (name, type, created_by) VALUES ($1, $2, $3) RETURNING id',
      [name, 'group', userId]
    );

    const conversationId = convResult.rows[0].id;

    // Add creator as member
    await db.query(
      'INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2)',
      [conversationId, userId]
    );

    // Add other members
    for (const memberId of memberIds) {
      await db.query(
        'INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2)',
        [conversationId, memberId]
      );
    }

    res.status(201).json({ id: conversationId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user conversations
app.get('/api/conversations', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await db.query(`
      SELECT c.id, c.name, c.type, c.created_at,
             (SELECT json_agg(json_build_object('id', u.id, 'username', u.username))
              FROM conversation_members cm
              JOIN users u ON cm.user_id = u.id
              WHERE cm.conversation_id = c.id) as members
      FROM conversations c
      JOIN conversation_members cm ON c.id = cm.conversation_id
      WHERE cm.user_id = $1
      ORDER BY c.updated_at DESC
    `, [userId]);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get conversation messages
app.get('/api/conversations/:conversationId/messages', authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    const userId = req.user.userId;

    // Check if user is member of conversation
    const memberCheck = await db.query(
      'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, userId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await db.query(`
      SELECT m.id, m.conversation_id, m.sender_id, m.content, m.message_type,
             m.created_at, u.username,
             (SELECT json_agg(json_build_object('user_id', user_id, 'status', status))
              FROM message_status WHERE message_id = m.id) as status
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = $1 AND m.is_deleted = FALSE
      ORDER BY m.created_at DESC
      LIMIT $2 OFFSET $3
    `, [conversationId, limit, offset]);

    res.json(result.rows.reverse());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. MESSAGES

// Send message (REST)
app.post('/api/conversations/:conversationId/messages', authenticateToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content } = req.body;
    const userId = req.user.userId;

    if (!content) {
      return res.status(400).json({ error: 'Content required' });
    }

    const result = await db.query(`
      INSERT INTO messages (conversation_id, sender_id, content)
      VALUES ($1, $2, $3)
      RETURNING id, sender_id, content, created_at
    `, [conversationId, userId, content]);

    const message = result.rows[0];

    // Get conversation members to mark as delivered
    const members = await db.query(
      'SELECT user_id FROM conversation_members WHERE conversation_id = $1',
      [conversationId]
    );

    // Mark as sent/delivered for all members
    for (const member of members.rows) {
      await db.query(
        'INSERT INTO message_status (message_id, user_id, status) VALUES ($1, $2, $3)',
        [message.id, member.user_id, 'delivered']
      );
    }

    // Emit via Socket.IO
    io.to(`conv:${conversationId}`).emit('new_message', {
      id: message.id,
      conversation_id: conversationId,
      sender_id: userId,
      content,
      created_at: message.created_at
    });

    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Edit message
app.put('/api/messages/:messageId', authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const userId = req.user.userId;

    if (!content) {
      return res.status(400).json({ error: 'Content required' });
    }

    // Check ownership
    const msgCheck = await db.query(
      'SELECT conversation_id FROM messages WHERE id = $1 AND sender_id = $2',
      [messageId, userId]
    );

    if (msgCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Cannot edit this message' });
    }

    const conversationId = msgCheck.rows[0].conversation_id;

    const result = await db.query(
      'UPDATE messages SET content = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [content, messageId]
    );

    // Emit edit event
    io.to(`conv:${conversationId}`).emit('message_edited', {
      id: messageId,
      content,
      updated_at: new Date()
    });

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete message
app.delete('/api/messages/:messageId', authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.userId;

    // Check ownership
    const msgCheck = await db.query(
      'SELECT conversation_id FROM messages WHERE id = $1 AND sender_id = $2',
      [messageId, userId]
    );

    if (msgCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Cannot delete this message' });
    }

    const conversationId = msgCheck.rows[0].conversation_id;

    await db.query(
      'UPDATE messages SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [messageId]
    );

    // Emit delete event
    io.to(`conv:${conversationId}`).emit('message_deleted', { id: messageId });

    res.json({ message: 'Message deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark message as read
app.post('/api/messages/:messageId/mark-as-read', authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.userId;

    const result = await db.query(
      'UPDATE message_status SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE message_id = $2 AND user_id = $3 RETURNING *',
      ['read', messageId, userId]
    );

    // Get conversation to emit to
    const msg = await db.query(
      'SELECT conversation_id FROM messages WHERE id = $1',
      [messageId]
    );

    if (msg.rows.length > 0) {
      io.to(`conv:${msg.rows[0].conversation_id}`).emit('message_read', {
        message_id: messageId,
        user_id: userId
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===========================
// WEBSOCKET (Socket.IO) EVENTS
// ===========================

// Map of userId -> socketId for easy lookup
const userSockets = new Map();

io.on('connection', (socket) => {
  console.log(`👤 User connected: ${socket.id}`);

  // Authenticate user
  socket.on('authenticate', async (token) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const userId = decoded.userId;

      socket.userId = userId;
      userSockets.set(userId, socket.id);

      // Store presence in Redis
      await redisClient.setEx(`user:${userId}:online`, 3600, 'true');

      // Emit user online to all connected users
      io.emit('user_online', { userId, timestamp: new Date() });

      socket.emit('authenticated', { userId });
      console.log(`✅ User ${userId} authenticated`);
    } catch (error) {
      socket.emit('auth_error', { error: 'Invalid token' });
      socket.disconnect();
    }
  });

  // Join conversation room
  socket.on('join_conversation', (conversationId) => {
    socket.join(`conv:${conversationId}`);
    console.log(`📍 User ${socket.userId} joined conversation ${conversationId}`);

    io.to(`conv:${conversationId}`).emit('user_joined', {
      userId: socket.userId,
      conversationId,
      timestamp: new Date()
    });
  });

  // Leave conversation room
  socket.on('leave_conversation', (conversationId) => {
    socket.leave(`conv:${conversationId}`);
    console.log(`🚪 User ${socket.userId} left conversation ${conversationId}`);
  });

  // Send message via WebSocket
  socket.on('send_message', async (data) => {
    try {
      const { conversationId, content, messageId } = data;
      const userId = socket.userId;

      // Save to database
      const result = await db.query(`
        INSERT INTO messages (conversation_id, sender_id, content)
        VALUES ($1, $2, $3)
        RETURNING id, created_at
      `, [conversationId, userId, content]);

      const dbMessageId = result.rows[0].id;
      const createdAt = result.rows[0].created_at;

      // Mark as delivered
      const members = await db.query(
        'SELECT user_id FROM conversation_members WHERE conversation_id = $1',
        [conversationId]
      );

      for (const member of members.rows) {
        await db.query(
          'INSERT INTO message_status (message_id, user_id, status) VALUES ($1, $2, $3)',
          [dbMessageId, member.user_id, 'delivered']
        );
      }

      // Emit to room
      io.to(`conv:${conversationId}`).emit('new_message', {
        id: dbMessageId,
        conversation_id: conversationId,
        sender_id: userId,
        content,
        created_at: createdAt,
        clientMessageId: messageId // For client deduplication
      });

      // Send ack
      socket.emit('message_sent', { clientMessageId: messageId, id: dbMessageId });
    } catch (error) {
      socket.emit('message_error', { error: error.message });
    }
  });

  // Typing indicator
  socket.on('user_typing', (data) => {
    const { conversationId } = data;
    socket.to(`conv:${conversationId}`).emit('user_typing', {
      userId: socket.userId,
      conversationId
    });
  });

  socket.on('user_stop_typing', (data) => {
    const { conversationId } = data;
    socket.to(`conv:${conversationId}`).emit('user_stop_typing', {
      userId: socket.userId,
      conversationId
    });
  });

  // Mark as read
  socket.on('mark_as_read', async (data) => {
    try {
      const { messageId, conversationId } = data;
      const userId = socket.userId;

      await db.query(
        'UPDATE message_status SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE message_id = $2 AND user_id = $3',
        ['read', messageId, userId]
      );

      io.to(`conv:${conversationId}`).emit('message_read', {
        message_id: messageId,
        user_id: userId
      });
    } catch (error) {
      console.error('Mark as read error:', error);
    }
  });

  // Disconnect
  socket.on('disconnect', async () => {
    if (socket.userId) {
      userSockets.delete(socket.userId);
      await redisClient.del(`user:${socket.userId}:online`);

      io.emit('user_offline', {
        userId: socket.userId,
        timestamp: new Date()
      });

      console.log(`👋 User ${socket.userId} disconnected`);
    }
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// ===========================
// HEALTH CHECK
// ===========================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// ===========================
// SERVER START
// ===========================

const PORT = process.env.PORT || 3000;

server.listen(PORT, async () => {
  try {
    await initializeDatabase();
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
});

module.exports = { app, io, db };
