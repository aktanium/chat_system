// ===========================
// CHAT SYSTEM TESTS
// Jest + Supertest
// ===========================

const request = require('supertest');
const { app, db } = require('../chat-backend');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// ===========================
// TEST DATA
// ===========================

const testUser1 = {
  username: 'testuser1',
  email: 'test1@example.com',
  password: 'password123'
};

const testUser2 = {
  username: 'testuser2',
  email: 'test2@example.com',
  password: 'password123'
};

let user1Token, user2Token;
let user1Id, user2Id;
let conversationId;

// ===========================
// SETUP & TEARDOWN
// ===========================

beforeAll(async () => {
  // Clear database
  await db.query('DELETE FROM message_status');
  await db.query('DELETE FROM messages');
  await db.query('DELETE FROM conversation_members');
  await db.query('DELETE FROM conversations');
  await db.query('DELETE FROM users');
});

afterAll(async () => {
  await db.end();
});

// ===========================
// TESTS
// ===========================

describe('Chat System API', () => {
  // ===========================
  // AUTHENTICATION TESTS
  // ===========================

  describe('Authentication', () => {
    test('Register user should create account', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send(testUser1);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('token');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user.username).toBe(testUser1.username);

      user1Token = response.body.token;
      user1Id = response.body.user.id;
    });

    test('Register with duplicate email should fail', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send(testUser1);

      expect(response.status).toBe(500);
    });

    test('Login with correct credentials should succeed', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser1.email,
          password: testUser1.password
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body.user.email).toBe(testUser1.email);
    });

    test('Login with wrong password should fail', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser1.email,
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
    });

    test('Register second user', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send(testUser2);

      expect(response.status).toBe(201);
      user2Token = response.body.token;
      user2Id = response.body.user.id;
    });
  });

  // ===========================
  // USER TESTS
  // ===========================

  describe('Users', () => {
    test('Get user profile', async () => {
      const response = await request(app)
        .get(`/api/users/${user1Id}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(user1Id);
      expect(response.body.username).toBe(testUser1.username);
    });

    test('Get non-existent user should return 404', async () => {
      const response = await request(app)
        .get('/api/users/99999')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(response.status).toBe(404);
    });

    test('Unauthorized request should fail', async () => {
      const response = await request(app)
        .get(`/api/users/${user1Id}`)
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(403);
    });
  });

  // ===========================
  // CONVERSATION TESTS
  // ===========================

  describe('Conversations', () => {
    test('Create direct conversation', async () => {
      const response = await request(app)
        .post('/api/conversations/direct')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ participantId: user2Id });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      conversationId = response.body.id;
    });

    test('Cannot create conversation with self', async () => {
      const response = await request(app)
        .post('/api/conversations/direct')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ participantId: user1Id });

      expect(response.status).toBe(400);
    });

    test('Creating same conversation twice returns existing', async () => {
      const response = await request(app)
        .post('/api/conversations/direct')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ participantId: user2Id });

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(conversationId);
    });

    test('Get user conversations', async () => {
      const response = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });

    test('Create group conversation', async () => {
      const response = await request(app)
        .post('/api/conversations/group')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          name: 'Test Group',
          memberIds: [user2Id]
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
    });
  });

  // ===========================
  // MESSAGE TESTS
  // ===========================

  describe('Messages', () => {
    test('Send message to conversation', async () => {
      const response = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ content: 'Hello, World!' });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.content).toBe('Hello, World!');
      expect(response.body.sender_id).toBe(user1Id);
    });

    test('Send empty message should fail', async () => {
      const response = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ content: '' });

      expect(response.status).toBe(400);
    });

    test('Get conversation messages', async () => {
      const response = await request(app)
        .get(`/api/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });

    test('Get messages with pagination', async () => {
      // Send multiple messages
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post(`/api/conversations/${conversationId}/messages`)
          .set('Authorization', `Bearer ${user1Token}`)
          .send({ content: `Message ${i}` });
      }

      const response = await request(app)
        .get(`/api/conversations/${conversationId}/messages?limit=2&offset=0`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(response.status).toBe(200);
      expect(response.body.length).toBeLessThanOrEqual(2);
    });

    test('Edit own message', async () => {
      // Get a message ID first
      const getResponse = await request(app)
        .get(`/api/conversations/${conversationId}/messages?limit=1`)
        .set('Authorization', `Bearer ${user1Token}`);

      const messageId = getResponse.body[0].id;

      const response = await request(app)
        .put(`/api/messages/${messageId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ content: 'Edited message' });

      expect(response.status).toBe(200);
      expect(response.body.content).toBe('Edited message');
    });

    test('Cannot edit other user message', async () => {
      const getResponse = await request(app)
        .get(`/api/conversations/${conversationId}/messages?limit=1`)
        .set('Authorization', `Bearer ${user1Token}`);

      const messageId = getResponse.body[0].id;

      const response = await request(app)
        .put(`/api/messages/${messageId}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ content: 'Hacked' });

      expect(response.status).toBe(403);
    });

    test('Delete message', async () => {
      const getResponse = await request(app)
        .get(`/api/conversations/${conversationId}/messages?limit=1`)
        .set('Authorization', `Bearer ${user1Token}`);

      const messageId = getResponse.body[0].id;

      const response = await request(app)
        .delete(`/api/messages/${messageId}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(response.status).toBe(200);
    });

    test('Mark message as read', async () => {
      const getResponse = await request(app)
        .get(`/api/conversations/${conversationId}/messages?limit=1`)
        .set('Authorization', `Bearer ${user2Token}`);

      if (getResponse.body.length > 0) {
        const messageId = getResponse.body[0].id;

        const response = await request(app)
          .post(`/api/messages/${messageId}/mark-as-read`)
          .set('Authorization', `Bearer ${user2Token}`);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('read');
      }
    });
  });

  // ===========================
  // PERMISSION TESTS
  // ===========================

  describe('Permissions', () => {
    test('User not in conversation cannot see messages', async () => {
      // Create conversation without user3
      const user3Token = jwt.sign({ userId: 99999 }, JWT_SECRET);

      const response = await request(app)
        .get(`/api/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${user3Token}`);

      // Should fail due to auth or permission
      expect([403, 401]).toContain(response.status);
    });
  });

  // ===========================
  // HEALTH CHECK
  // ===========================

  describe('Health', () => {
    test('Health check endpoint', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('ok');
    });
  });
});

// ===========================
// SOCKET.IO TESTS
// ===========================

describe('Socket.IO', () => {
  const io = require('socket.io-client');
  let socket1, socket2;

  beforeAll((done) => {
    socket1 = io('http://localhost:3000', { reconnection: false });
    socket2 = io('http://localhost:3000', { reconnection: false });

    // Wait for connection
    Promise.all([
      new Promise(resolve => socket1.on('connect', resolve)),
      new Promise(resolve => socket2.on('connect', resolve))
    ]).then(done);
  });

  afterAll(() => {
    socket1.disconnect();
    socket2.disconnect();
  });

  test('Socket connection', (done) => {
    expect(socket1.connected).toBe(true);
    done();
  });

  test('Authentication via socket', (done) => {
    socket1.emit('authenticate', user1Token);
    socket1.once('authenticated', (data) => {
      expect(data).toHaveProperty('userId');
      done();
    });
  });

  test('Join conversation', (done) => {
    socket1.emit('authenticate', user1Token);
    socket1.once('authenticated', () => {
      socket1.emit('join_conversation', conversationId);
      // Should not error
      done();
    });
  });
});

// ===========================
// INTEGRATION TESTS
// ===========================

describe('Integration Tests', () => {
  test('Complete conversation flow', async () => {
    // 1. Register users
    const user1Res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'inttest1',
        email: 'inttest1@test.com',
        password: 'pass123'
      });

    const user2Res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'inttest2',
        email: 'inttest2@test.com',
        password: 'pass123'
      });

    const token1 = user1Res.body.token;
    const token2 = user2Res.body.token;
    const id2 = user2Res.body.user.id;

    // 2. Create conversation
    const convRes = await request(app)
      .post('/api/conversations/direct')
      .set('Authorization', `Bearer ${token1}`)
      .send({ participantId: id2 });

    const convId = convRes.body.id;

    // 3. Send message
    const msgRes = await request(app)
      .post(`/api/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${token1}`)
      .send({ content: 'Integration test message' });

    expect(msgRes.status).toBe(201);

    // 4. Read messages
    const getRes = await request(app)
      .get(`/api/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${token2}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.length).toBeGreaterThan(0);

    // 5. Mark as read
    const messageId = getRes.body[0].id;
    const readRes = await request(app)
      .post(`/api/messages/${messageId}/mark-as-read`)
      .set('Authorization', `Bearer ${token2}`);

    expect(readRes.status).toBe(200);
    expect(readRes.body.status).toBe('read');
  });
});
