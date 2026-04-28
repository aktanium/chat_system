-- ===========================
-- CHAT SYSTEM DATABASE SCHEMA
-- PostgreSQL 14+
-- ===========================

-- ===========================
-- 1. USERS TABLE
-- ===========================

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(255),
    bio TEXT,
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast search by email and username
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_is_active ON users(is_active);

-- ===========================
-- 2. CONVERSATIONS TABLE
-- ===========================

CREATE TABLE IF NOT EXISTS conversations (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255),
    description TEXT,
    type VARCHAR(50) NOT NULL DEFAULT 'direct', -- 'direct' or 'group'
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    avatar_url VARCHAR(255),
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_conversations_type ON conversations(type);
CREATE INDEX idx_conversations_created_by ON conversations(created_by);
CREATE INDEX idx_conversations_created_at ON conversations(created_at DESC);

-- ===========================
-- 3. CONVERSATION MEMBERS TABLE
-- ===========================

CREATE TABLE IF NOT EXISTS conversation_members (
    id BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_read_message_id BIGINT,
    is_muted BOOLEAN DEFAULT FALSE,
    UNIQUE(conversation_id, user_id)
);

-- Indexes
CREATE INDEX idx_conversation_members_user_id ON conversation_members(user_id);
CREATE INDEX idx_conversation_members_conversation_id ON conversation_members(conversation_id);
CREATE INDEX idx_conversation_members_joined_at ON conversation_members(joined_at DESC);

-- ===========================
-- 4. MESSAGES TABLE
-- ===========================

CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    message_type VARCHAR(50) DEFAULT 'text', -- 'text', 'image', 'file', 'video'
    file_url VARCHAR(255),
    file_name VARCHAR(255),
    file_size BIGINT,
    media_type VARCHAR(100),
    is_deleted BOOLEAN DEFAULT FALSE,
    is_edited BOOLEAN DEFAULT FALSE,
    edit_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast access
CREATE INDEX idx_messages_conversation_created ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_messages_is_deleted ON messages(is_deleted);

-- ===========================
-- 5. MESSAGE STATUS TABLE
-- ===========================

CREATE TABLE IF NOT EXISTS message_status (
    id BIGSERIAL PRIMARY KEY,
    message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'sent', -- 'sent', 'delivered', 'read'
    status_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id)
);

-- Indexes
CREATE INDEX idx_message_status_message_id ON message_status(message_id);
CREATE INDEX idx_message_status_user_id ON message_status(user_id);
CREATE INDEX idx_message_status_status ON message_status(status);

-- ===========================
-- 6. MESSAGE REACTIONS TABLE (For emojis)
-- ===========================

CREATE TABLE IF NOT EXISTS message_reactions (
    id BIGSERIAL PRIMARY KEY,
    message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reaction VARCHAR(10) NOT NULL, -- '👍', '❤️', '😂' etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id, reaction)
);

-- Indexes
CREATE INDEX idx_message_reactions_message_id ON message_reactions(message_id);
CREATE INDEX idx_message_reactions_user_id ON message_reactions(user_id);

-- ===========================
-- 7. USER PRESENCE TABLE (Redis sync)
-- ===========================

CREATE TABLE IF NOT EXISTS user_presence (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'offline', -- 'online', 'offline', 'away'
    current_conversation_id BIGINT,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_user_presence_status ON user_presence(status);

-- ===========================
-- 8. BLOCKED USERS TABLE
-- ===========================

CREATE TABLE IF NOT EXISTS blocked_users (
    id BIGSERIAL PRIMARY KEY,
    blocker_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT,
    blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(blocker_id, blocked_id)
);

-- Indexes
CREATE INDEX idx_blocked_users_blocker_id ON blocked_users(blocker_id);
CREATE INDEX idx_blocked_users_blocked_id ON blocked_users(blocked_id);

-- ===========================
-- 9. USER SESSIONS TABLE
-- ===========================

CREATE TABLE IF NOT EXISTS user_sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) NOT NULL UNIQUE,
    ip_address VARCHAR(45),
    user_agent TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token ON user_sessions(token);
CREATE INDEX idx_user_sessions_is_active ON user_sessions(is_active);

-- ===========================
-- 10. AUDIT LOG TABLE
-- ===========================

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL, -- 'LOGIN', 'LOGOUT', 'CREATE_MESSAGE', 'DELETE_MESSAGE' etc.
    resource_type VARCHAR(50), -- 'message', 'conversation', 'user'
    resource_id BIGINT,
    details JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ===========================
-- VIEWS
-- ===========================

-- View для получения последнего сообщения в каждом чате
CREATE OR REPLACE VIEW conversation_last_message AS
SELECT 
    c.id as conversation_id,
    m.id as message_id,
    m.content,
    m.created_at,
    u.username as sender_username
FROM conversations c
LEFT JOIN LATERAL (
    SELECT * FROM messages 
    WHERE conversation_id = c.id AND is_deleted = FALSE
    ORDER BY created_at DESC
    LIMIT 1
) m ON TRUE
LEFT JOIN users u ON m.sender_id = u.id;

-- View для unread message count
CREATE OR REPLACE VIEW unread_message_count AS
SELECT 
    cm.user_id,
    cm.conversation_id,
    COUNT(CASE WHEN ms.status != 'read' THEN 1 END) as unread_count
FROM conversation_members cm
LEFT JOIN messages m ON m.conversation_id = cm.conversation_id
LEFT JOIN message_status ms ON ms.message_id = m.id AND ms.user_id = cm.user_id
WHERE m.is_deleted = FALSE
GROUP BY cm.user_id, cm.conversation_id;

-- ===========================
-- FUNCTIONS
-- ===========================

-- Function для обновления updated_at timestamp
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers для автоматического обновления timestamp
CREATE TRIGGER update_users_timestamp BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_conversations_timestamp BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_messages_timestamp BEFORE UPDATE ON messages
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ===========================
-- SAMPLE DATA (для тестирования)
-- ===========================

-- Создать тестовых пользователей
INSERT INTO users (username, email, password_hash, bio) VALUES
    ('alice', 'alice@example.com', '$2b$10$..hash..', 'Hello, I am Alice'),
    ('bob', 'bob@example.com', '$2b$10$..hash..', 'Hey, this is Bob'),
    ('charlie', 'charlie@example.com', '$2b$10$..hash..', 'Charlie here')
ON CONFLICT (email) DO NOTHING;

-- ===========================
-- STATISTICS & MAINTENANCE
-- ===========================

-- VACUUM для оптимизации
-- VACUUM ANALYZE;

-- Проверить размер таблиц
-- SELECT 
--     schemaname,
--     tablename,
--     pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
-- FROM pg_tables
-- ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- ===========================
-- SECURITY: ROLES & PERMISSIONS
-- ===========================

-- Создать role для приложения (для production)
-- CREATE ROLE chat_app WITH LOGIN PASSWORD 'secure_password';

-- GRANT CONNECT ON DATABASE chat_system TO chat_app;
-- GRANT USAGE ON SCHEMA public TO chat_app;
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO chat_app;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO chat_app;

-- ===========================
-- BACKUP SCRIPTS
-- ===========================

-- Backup (в терминале):
-- pg_dump -U postgres chat_system > backup_$(date +%Y%m%d).sql

-- Restore (в терминале):
-- psql -U postgres chat_system < backup_20240101.sql

-- ===========================
-- PERFORMANCE OPTIMIZATION
-- ===========================

-- Для быстрого поиска сообщений по содержанию
-- CREATE INDEX idx_messages_content_gin ON messages USING gin(to_tsvector('english', content));

-- Для быстрого доступа к последним сообщениям
-- CREATE INDEX idx_messages_conversation_latest ON messages(conversation_id, created_at DESC) 
--     WHERE is_deleted = FALSE;

-- ===========================
-- DONE!
-- ===========================

-- Проверить структуру
-- \dt              -- List all tables
-- \d users         -- Describe users table
-- \di              -- List all indexes

-- Все таблицы созданы и готовы к использованию! ✅
