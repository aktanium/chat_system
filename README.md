# 💬 Chat System - Real-time Messaging Platform

Полнофункциональная система чатов с поддержкой real-time доставки сообщений, группировки, редактирования и многого другого.

## 📋 Функции

✅ **Аутентификация** - Регистрация и вход через JWT
✅ **One-to-one чаты** - Прямые сообщения между пользователями
✅ **Групповые чаты** - Чаты с несколькими участниками
✅ **Real-time доставка** - WebSocket + Socket.IO
✅ **Typing indicator** - Показать, когда пользователь печатает
✅ **Статус сообщений** - sent, delivered, read
✅ **Редактирование сообщений** - Изменить отправленное сообщение
✅ **Удаление сообщений** - Удалить сообщение из истории
✅ **История сообщений** - Загрузка старых сообщений
✅ **Presence** - Статус онлайн/офлайн

## 🏗️ Архитектура

```
Frontend (React)
    ↓
Socket.IO / REST API
    ↓
Express.js Backend
    ↓ ↓
PostgreSQL  Redis
```

### Компоненты

| Компонент | Задача |
|-----------|--------|
| **React Frontend** | UI, пользовательское взаимодействие |
| **Express.js Backend** | REST API, бизнес-логика |
| **Socket.IO** | Real-time WebSocket соединения |
| **PostgreSQL** | Хранилище пользователей, сообщений |
| **Redis** | Кеш, presence, pub/sub |

## 🚀 Быстрый старт

### Вариант 1: Docker Compose (Рекомендуется)

```bash
# 1. Установить Docker и Docker Compose
# https://www.docker.com/products/docker-desktop

# 2. Клонировать репозиторий
git clone <repo-url>
cd chat-system

# 3. Запустить все сервисы
docker-compose up -d

# Backend будет на http://localhost:3000
# Frontend будет на http://localhost:3001

# 4. Проверить логи
docker-compose logs -f backend
```

### Вариант 2: Локальный запуск

#### Предусловия
- Node.js 16+
- PostgreSQL 14+
- Redis 7+

#### Шаг 1: Установить зависимости

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

#### Шаг 2: Запустить PostgreSQL

```bash
# macOS
brew services start postgresql@14

# Linux
sudo systemctl start postgresql

# Windows
# Использовать PostgreSQL installer или WSL
```

#### Шаг 3: Создать БД

```bash
createdb chat_system
```

#### Шаг 4: Запустить Redis

```bash
# macOS
brew services start redis

# Linux
sudo systemctl start redis

# Docker
docker run -d -p 6379:6379 redis:7-alpine
```

#### Шаг 5: Запустить Backend

```bash
cd backend
npm run dev
# Server запустится на http://localhost:3000
```

#### Шаг 6: Запустить Frontend

```bash
cd frontend
npm start
# App откроется на http://localhost:3000
```

## 📡 API Endpoints

### Authentication

```
POST /api/auth/register
  Body: { username, email, password }
  Response: { user, token }

POST /api/auth/login
  Body: { email, password }
  Response: { user, token }
```

### Conversations

```
GET /api/conversations
  Headers: Authorization: Bearer <token>
  Response: [{ id, name, type, members, created_at }]

POST /api/conversations/direct
  Body: { participantId }
  Response: { id }

POST /api/conversations/group
  Body: { name, memberIds }
  Response: { id }

GET /api/conversations/:conversationId/messages
  Query: ?limit=50&offset=0
  Response: [{ id, sender_id, content, created_at, status }]
```

### Messages

```
POST /api/conversations/:conversationId/messages
  Body: { content }
  Response: { id, sender_id, content, created_at }

PUT /api/messages/:messageId
  Body: { content }
  Response: { id, content, updated_at }

DELETE /api/messages/:messageId
  Response: { message }

POST /api/messages/:messageId/mark-as-read
  Response: { message_id, user_id, status }
```

### Users

```
GET /api/users/:userId
  Response: { id, username, email, avatar_url, created_at }
```

## 🔌 WebSocket Events

### Client → Server

```javascript
// Аутентификация
socket.emit('authenticate', token);

// Присоединиться к чату
socket.emit('join_conversation', conversationId);

// Отправить сообщение
socket.emit('send_message', {
  conversationId,
  content,
  messageId  // для deduplication
});

// Typing indicator
socket.emit('user_typing', { conversationId });
socket.emit('user_stop_typing', { conversationId });

// Mark as read
socket.emit('mark_as_read', { messageId, conversationId });
```

### Server → Client

```javascript
// Аутентификация успешна
socket.on('authenticated', { userId });

// Новое сообщение
socket.on('new_message', {
  id,
  conversation_id,
  sender_id,
  content,
  created_at,
  clientMessageId  // для matching
});

// Сообщение отредактировано
socket.on('message_edited', { id, content, updated_at });

// Сообщение удалено
socket.on('message_deleted', { id });

// Сообщение прочитано
socket.on('message_read', { message_id, user_id });

// Пользователь печатает
socket.on('user_typing', { userId, conversationId });
socket.on('user_stop_typing', { userId, conversationId });

// Присутствие
socket.on('user_online', { userId, timestamp });
socket.on('user_offline', { userId, timestamp });
```

## 🗄️ Database Schema

### Users Table
```sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  avatar_url VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Conversations Table
```sql
CREATE TABLE conversations (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255),
  type VARCHAR(50) DEFAULT 'direct',
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Messages Table
```sql
CREATE TABLE messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id BIGINT REFERENCES users(id),
  content TEXT NOT NULL,
  message_type VARCHAR(50) DEFAULT 'text',
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Message Status Table
```sql
CREATE TABLE message_status (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT REFERENCES messages(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'sent',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 🔐 Безопасность

- ✅ JWT токены для аутентификации
- ✅ Bcrypt хеширование паролей
- ✅ CORS защита
- ✅ SQL injection protection (prepared statements)
- ✅ Rate limiting (рекомендуется добавить)
- ✅ Input validation

### Рекомендации для Production

1. **Переменные окружения** - Использовать переменные для всех secrets
```bash
JWT_SECRET=<очень-длинная-случайная-строка>
DB_PASSWORD=<надежный-пароль>
```

2. **HTTPS/TLS** - Всегда использовать SSL в production
3. **CORS** - Установить конкретный origin вместо '*'
4. **Rate limiting** - Добавить middleware для защиты от DDoS
5. **Database backups** - Настроить регулярные бэкапы

## 📊 Масштабирование

### Текущие ограничения (для одного сервера)

| Метрика | Значение |
|---------|----------|
| Одновременных соединений | ~10,000 |
| Сообщений в сек | ~1,000 |
| Хранилище | 100 GB |

### Для масштабирования на миллионы пользователей

1. **Несколько Backend инстансов**
   ```
   Load Balancer
   ├── Backend #1
   ├── Backend #2
   └── Backend #3
   ```

2. **Message Queue** (Kafka/RabbitMQ)
   - Для асинхронной обработки
   - Гарантия доставки

3. **Replicated Database**
   - Master-Slave репликация
   - Read replicas для запросов

4. **Distributed Redis**
   - Redis Cluster
   - Pub/Sub для broadcast

5. **CDN для статики**
   - CloudFlare, AWS CloudFront

## 🧪 Тестирование

### Unit Tests
```bash
npm test
```

### API Testing (с Postman)
```
1. POST /api/auth/register
   Получить token

2. POST /api/conversations/direct
   Создать чат

3. POST /api/conversations/:id/messages
   Отправить сообщение
```

### Load Testing (с Apache Bench)
```bash
# 1000 requests с 100 concurrent
ab -n 1000 -c 100 http://localhost:3000/health
```

## 🐛 Debugging

### Backend logs
```bash
docker-compose logs -f backend
```

### Database queries
```bash
psql -U postgres -d chat_system
\dt  # List tables
SELECT * FROM messages LIMIT 10;
```

### Redis inspection
```bash
redis-cli
KEYS *
GET user:1:online
```

### Browser DevTools
- Network tab - следить за WebSocket соединением
- Console - смотреть JS ошибки

## 📚 Дополнительно

### Улучшения для Production

1. **Authentication**
   - OAuth2 (Google, GitHub)
   - Two-factor authentication

2. **Features**
   - File uploads
   - Image thumbnails
   - Search с Elasticsearch
   - Voice messages

3. **Performance**
   - Message pagination
   - Conversation caching
   - Database indexing

4. **Monitoring**
   - Prometheus metrics
   - ELK stack логирование
   - Distributed tracing (Jaeger)

## 📄 Лицензия

MIT

## 🤝 Контрибьютинг

Приветствуются pull requests!

---

**Создано для системного дизайна чата** 🚀

Вопросы? Создай issue или свяжись!
