# System Design: Chat System

## Требования

### Функциональные требования
1. **Пользователи могут отправлять сообщения** между собой в real-time
2. **Один-на-один чат** (direct messages)
3. **Групповые чаты** (группа может содержать до 100 000 пользователей)
4. **История сообщений** - сохранение и получение истории
5. **Уведомления** - пользователь должен видеть, что его сообщения доставлены и прочитаны
6. **Поиск** по сообщениям
7. **Удаление/редактирование** сообщений
8. **Typing indicator** - показать, когда пользователь печатает

### Нефункциональные требования
- **Масштабируемость**: система должна поддерживать миллионы одновременных пользователей
- **Низкая задержка**: доставка сообщений < 1 сек
- **Надежность**: гарантия доставки сообщений (at-least-once delivery)
- **Консистентность**: сообщения должны приходить в правильном порядке
- **Высокая доступность**: система должна быть доступна 24/7
- **Безопасность**: шифрование сообщений, аутентификация пользователей

## Масштабируемость

### Предполагаемые метрики
- **1 миллиард активных пользователей** в день (DAU)
- **100 миллионов одновременных соединений** (peak)
- **1 миллион сообщений в секунду** (QPS)
- **Размер сообщения**: в среднем 1 KB
- **Пиковый трафик**: в 2-3 раза выше среднего

## Вопросы для обсуждения

1. **Архитектура**: Какие компоненты будут в системе?
2. **WebSocket vs HTTP polling**: Как обеспечить real-time доставку?
3. **Хранение данных**: Какую БД использовать для истории сообщений?
4. **Масштабирование**: Как масштабировать чат-серверы?
5. **Кеширование**: Где использовать кеш (Redis)?
6. **Message queue**: Нужна ли очередь сообщений (Kafka)?
7. **Load balancing**: Как распределить нагрузку?
8. **Гарантия доставки**: Как обеспечить at-least-once delivery?
9. **Типы сообщений**: Текст, изображения, видео, файлы?
10. **Шифрование**: End-to-end или на уровне транспорта?

## High-level архитектура

```
[Clients] 
    ↓
[Load Balancer]
    ↓
[Chat Servers] (WebSocket/TCP)
    ↓
[Message Queue] (Kafka)
    ↓
[Database] (Message Store)
[Cache] (Redis)
    ↓
[Notification Service]
[Search Service]
```

## Ключевые компоненты

### 1. Presentation Layer
- Мобильные приложения (iOS/Android)
- Web клиент
- Desktop приложение

### 2. API Gateway / Load Balancer
- Маршрутизация запросов
- SSL/TLS termination
- Rate limiting

### 3. Chat Service (stateful)
- WebSocket соединения
- Message routing
- Presence tracking (кто онлайн)

### 4. Message Service
- Сохранение сообщений
- Retrieve историю
- Message deduplication

### 5. Storage
- **OLTP DB** (PostgreSQL/MySQL) - для пользователей, чатов
- **Time-series DB** (Cassandra/ClickHouse) - для истории сообщений
- **Cache** (Redis) - для горячих данных
- **Object Storage** (S3) - для файлов/изображений

### 6. Message Queue
- Асинхронная обработка
- Гарантия доставки
- Масштабируемость

### 7. Notification Service
- Push уведомления
- Email уведомления
- SMS (опционально)

### 8. Search Service
- Elasticsearch/Solr
- Полнотекстовый поиск

## Детальная архитектура

### Database Schema

```sql
-- Users
CREATE TABLE users (
    id BIGINT PRIMARY KEY,
    username VARCHAR(255) UNIQUE,
    email VARCHAR(255),
    password_hash VARCHAR(255),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Conversations/Chats
CREATE TABLE conversations (
    id BIGINT PRIMARY KEY,
    name VARCHAR(255),
    type ENUM('direct', 'group'),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Conversation Members
CREATE TABLE conversation_members (
    conversation_id BIGINT,
    user_id BIGINT,
    joined_at TIMESTAMP,
    PRIMARY KEY (conversation_id, user_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Messages (Time-series DB - Cassandra)
CREATE TABLE messages (
    conversation_id BIGINT,
    message_id BIGINT,
    sender_id BIGINT,
    content TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    is_deleted BOOLEAN,
    PRIMARY KEY ((conversation_id), created_at, message_id)
) WITH CLUSTERING ORDER BY (created_at DESC);

-- Message Status
CREATE TABLE message_status (
    message_id BIGINT,
    user_id BIGINT,
    status ENUM('sent', 'delivered', 'read'),
    updated_at TIMESTAMP,
    PRIMARY KEY (message_id, user_id)
);

-- User Sessions/Presence
CREATE TABLE user_presence (
    user_id BIGINT PRIMARY KEY,
    status ENUM('online', 'offline', 'away'),
    last_seen TIMESTAMP,
    updated_at TIMESTAMP
);
```

### API Endpoints

```
POST /api/v1/auth/login
POST /api/v1/auth/register
GET /api/v1/users/:user_id
POST /api/v1/conversations
GET /api/v1/conversations/:conversation_id
POST /api/v1/conversations/:conversation_id/messages
GET /api/v1/conversations/:conversation_id/messages?limit=50&offset=0
PUT /api/v1/messages/:message_id
DELETE /api/v1/messages/:message_id
POST /api/v1/messages/:message_id/status (delivered/read)
GET /api/v1/search/messages?q=query
WebSocket /ws/chat/:user_id
```

### WebSocket Protocol

```json
// Client to Server
{
    "type": "send_message",
    "conversation_id": "conv_123",
    "content": "Hello!",
    "message_id": "msg_123"
}

{
    "type": "typing",
    "conversation_id": "conv_123"
}

{
    "type": "mark_as_read",
    "message_id": "msg_123"
}

// Server to Client
{
    "type": "message",
    "conversation_id": "conv_123",
    "message_id": "msg_123",
    "sender_id": "user_456",
    "content": "Hello!",
    "created_at": "2024-01-01T12:00:00Z"
}

{
    "type": "user_typing",
    "conversation_id": "conv_123",
    "user_id": "user_456"
}

{
    "type": "message_status",
    "message_id": "msg_123",
    "status": "delivered"
}

{
    "type": "user_presence",
    "user_id": "user_456",
    "status": "online"
}
```

## Проблемы и решения

### 1. Real-time доставка
**Проблема**: Как обеспечить быструю доставку?
**Решение**: 
- WebSocket для persistent connections
- Message queue (Kafka) для асинхронной обработки
- Кеш (Redis) для горячих данных

### 2. Масштабируемость Chat Servers
**Проблема**: One chat server может обработать только ~10k-50k соединений
**Решение**:
- Горизонтальное масштабирование (много серверов)
- Consistent hashing для маршрутизации
- Service discovery (Consul, ZooKeeper)

### 3. Гарантия доставки
**Проблема**: Что если сервер упадет, а сообщение не доставлено?
**Решение**:
- Message IDs для deduplication
- Message queue обеспечивает at-least-once delivery
- Client переподключается и запрашивает недостающие сообщения

### 4. Message Ordering
**Проблема**: Сообщения должны приходить в порядке отправки
**Решение**:
- Timestamp + message ID для сортировки
- Cassandra хранит с clustering by created_at

### 5. Presence/Status
**Проблема**: Как узнать, кто онлайн?
**Решение**:
- Redis pub/sub для broadcast presence changes
- Heartbeat с timeouts
- WebSocket disconnect detection

### 6. Поиск сообщений
**Проблема**: Поиск по TB данных медленный
**Решение**:
- Elasticsearch для полнотекстового поиска
- Асинхронная индексация (Kafka → Elasticsearch)
- TTL на индексах (хранить последние 6 месяцев)

## Схема базы данных с индексами

```sql
-- Для быстрого доступа
CREATE INDEX idx_messages_conversation_created 
ON messages (conversation_id, created_at DESC);

CREATE INDEX idx_conversation_members_user 
ON conversation_members (user_id);

CREATE INDEX idx_message_status_user 
ON message_status (user_id, updated_at DESC);

-- Для presence
CREATE INDEX idx_user_presence_status 
ON user_presence (status);
```

## Оценка пропускной способности

### Хранилище
- **Сообщение**: ~1 KB
- **100 миллионов DAU × 50 сообщений/день = 5 миллиардов сообщений/день**
- **5 млрд × 1 KB = 5 PB/день = ~2 EB/год**
- **С репликацией (3x): ~6 EB/год**

### Пропускная способность сети
- **1 миллион QPS × 1 KB = 1 GB/sec**
- **С пиком (3x): 3 GB/sec входящего трафика**

## Масштабирование пошагово

### Phase 1: MVP (100K users)
- Single chat server + Database
- Redis cache
- Simple REST API

### Phase 2: Growth (1M users)
- Несколько chat servers за load balancer'ом
- Message queue (Kafka)
- Cassandra вместо PostgreSQL для истории

### Phase 3: Scale (100M users)
- Service mesh (Istio)
- Advanced caching strategies
- Elasticsearch для поиска
- Geo-distributed servers

## Безопасность

1. **TLS/SSL** для всех соединений
2. **JWT tokens** для аутентификации
3. **Rate limiting** - защита от DDoS
4. **Input validation** - защита от injection attacks
5. **End-to-end encryption** (опционально)
6. **Audit logs** для compliance

## Мониторинг и логирование

1. **Metrics**: Latency, QPS, error rate
2. **Logs**: Structured logging (ELK stack)
3. **Tracing**: Distributed tracing (Jaeger/Zipkin)
4. **Alerts**: PagerDuty/Alertmanager

## Примеры вопросов на интервью

1. Как бы ты скалировал систему на 1 миллиард пользователей?
2. Как обеспечить гарантию доставки сообщений?
3. Как сделать поиск эффективным на таком объеме данных?
4. Как обрабатывать случаи, когда пользователь офлайн?
5. Как обеспечить правильный порядок сообщений?
6. Какую базу данных использовать и почему?
7. Как масштабировать WebSocket соединения?
8. Как обработать сбой во время доставки сообщения?
9. Как реализовать typing indicator без перегрузки сервера?
10. Как защитить систему от DDoS атак?
