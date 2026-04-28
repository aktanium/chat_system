// ===========================
// CHAT SYSTEM FRONTEND
// React + Socket.io client
// ===========================

import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './ChatApp.css';

// ===========================
// API CLIENT
// ===========================

class ChatAPI {
  constructor(baseURL, token) {
    this.baseURL = baseURL;
    this.token = token;
  }

  async request(method, endpoint, body = null) {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseURL}${endpoint}`, options);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'API error');
    }

    return await response.json();
  }

  // Auth
  async register(username, email, password) {
    return this.request('POST', '/api/auth/register', { username, email, password });
  }

  async login(email, password) {
    return this.request('POST', '/api/auth/login', { email, password });
  }

  // Conversations
  async getConversations() {
    return this.request('GET', '/api/conversations');
  }

  async createDirectConversation(participantId) {
    return this.request('POST', '/api/conversations/direct', { participantId });
  }

  async createGroupConversation(name, memberIds) {
    return this.request('POST', '/api/conversations/group', { name, memberIds });
  }

  // Messages
  async getMessages(conversationId, limit = 50, offset = 0) {
    return this.request('GET', `/api/conversations/${conversationId}/messages?limit=${limit}&offset=${offset}`);
  }

  async sendMessage(conversationId, content) {
    return this.request('POST', `/api/conversations/${conversationId}/messages`, { content });
  }

  async editMessage(messageId, content) {
    return this.request('PUT', `/api/messages/${messageId}`, { content });
  }

  async deleteMessage(messageId) {
    return this.request('DELETE', `/api/messages/${messageId}`);
  }

  async markAsRead(messageId) {
    return this.request('POST', `/api/messages/${messageId}/mark-as-read`);
  }

  // Users
  async getUser(userId) {
    return this.request('GET', `/api/users/${userId}`);
  }
}

// ===========================
// AUTH COMPONENT
// ===========================

function AuthPage({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const api = new ChatAPI('http://localhost:3000', '');

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let result;
      if (isLogin) {
        result = await api.login(formData.email, formData.password);
      } else {
        result = await api.register(formData.username, formData.email, formData.password);
      }

      localStorage.setItem('token', result.token);
      localStorage.setItem('user', JSON.stringify(result.user));

      onLogin(result.user, result.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>💬 Chat System</h1>
        <h2>{isLogin ? 'Sign In' : 'Sign Up'}</h2>

        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <input
              type="text"
              name="username"
              placeholder="Username"
              value={formData.username}
              onChange={handleChange}
              required
            />
          )}

          <input
            type="email"
            name="email"
            placeholder="Email"
            value={formData.email}
            onChange={handleChange}
            required
          />

          <input
            type="password"
            name="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleChange}
            required
          />

          {error && <div className="error-message">{error}</div>}

          <button type="submit" disabled={loading}>
            {loading ? 'Loading...' : isLogin ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <p>
          {isLogin ? "Don't have an account?" : 'Already have an account?'}
          <button
            type="button"
            className="toggle-button"
            onClick={() => setIsLogin(!isLogin)}
          >
            {isLogin ? 'Sign Up' : 'Sign In'}
          </button>
        </p>
      </div>
    </div>
  );
}

// ===========================
// MESSAGE COMPONENT
// ===========================

function Message({ message, currentUserId, onEdit, onDelete, onRead }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content);
  const isOwn = message.sender_id === currentUserId;

  const handleEdit = () => {
    onEdit(message.id, editedContent);
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (window.confirm('Delete this message?')) {
      onDelete(message.id);
    }
  };

  useEffect(() => {
    const readStatuses = message.status || [];
    const isRead = readStatuses.some(s => s.user_id === currentUserId && s.status === 'read');

    if (!isRead) {
      onRead(message.id);
    }
  }, [message.id, currentUserId, message.status, onRead]);

  const time = new Date(message.created_at).toLocaleTimeString();
  const readStatus = message.status?.find(s => s.user_id === currentUserId)?.status || 'sent';

  return (
    <div className={`message ${isOwn ? 'own' : 'other'}`}>
      <div className="message-header">
        <strong>{message.username}</strong>
        <span className="time">{time}</span>
      </div>

      {isEditing ? (
        <div className="edit-form">
          <input
            type="text"
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            autoFocus
          />
          <button onClick={handleEdit}>Save</button>
          <button onClick={() => setIsEditing(false)}>Cancel</button>
        </div>
      ) : (
        <div className="message-content">{message.content}</div>
      )}

      <div className="message-actions">
        {isOwn && (
          <>
            <button onClick={() => setIsEditing(true)} className="edit-btn">
              ✏️
            </button>
            <button onClick={handleDelete} className="delete-btn">
              🗑️
            </button>
          </>
        )}
        {isOwn && <span className="read-status">{readStatus}</span>}
      </div>
    </div>
  );
}

// ===========================
// CONVERSATION COMPONENT
// ===========================

function ConversationView({
  conversation,
  messages,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onMarkAsRead,
  currentUserId,
  typingUsers
}) {
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleInputChange = (e) => {
    setInputValue(e.target.value);

    // Send typing indicator
    if (!isTyping) {
      setIsTyping(true);
      window.socket.emit('user_typing', { conversationId: conversation.id });
    }

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      window.socket.emit('user_stop_typing', { conversationId: conversation.id });
    }, 3000);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();

    if (!inputValue.trim()) return;

    const messageId = `${Date.now()}-${Math.random()}`;
    onSendMessage(conversation.id, inputValue, messageId);
    setInputValue('');
    setIsTyping(false);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    window.socket.emit('user_stop_typing', { conversationId: conversation.id });
  };

  const otherUserTyping = typingUsers.filter(uid => uid !== currentUserId);

  return (
    <div className="conversation-view">
      <div className="conversation-header">
        <h2>{conversation.name || 'Direct Message'}</h2>
        <p className="members-count">
          👥 {conversation.members?.length || 0} members
        </p>
      </div>

      <div className="messages-list">
        {messages.map((msg) => (
          <Message
            key={msg.id}
            message={msg}
            currentUserId={currentUserId}
            onEdit={onEditMessage}
            onDelete={onDeleteMessage}
            onRead={onMarkAsRead}
          />
        ))}

        {otherUserTyping.length > 0 && (
          <div className="typing-indicator">
            {otherUserTyping.length} user(s) typing
            <span className="dots">
              <span>.</span><span>.</span><span>.</span>
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form className="message-input-form" onSubmit={handleSendMessage}>
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          placeholder="Type a message..."
          className="message-input"
        />
        <button type="submit" className="send-button">
          Send
        </button>
      </form>
    </div>
  );
}

// ===========================
// CONVERSATIONS LIST COMPONENT
// ===========================

function ConversationsList({ conversations, activeConversationId, onSelectConversation, onNewConversation }) {
  return (
    <div className="conversations-sidebar">
      <div className="sidebar-header">
        <h2>💬 Chats</h2>
        <button className="new-chat-btn" onClick={onNewConversation} title="New conversation">
          ➕
        </button>
      </div>

      <div className="conversations-list">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`conversation-item ${activeConversationId === conv.id ? 'active' : ''}`}
            onClick={() => onSelectConversation(conv.id)}
          >
            <div className="conv-name">
              {conv.name || conv.members?.[0]?.username || 'Chat'}
            </div>
            <div className="conv-type">{conv.type}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===========================
// MAIN CHAT APP COMPONENT
// ===========================

function ChatApp({ user, token }) {
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const api = new ChatAPI('http://localhost:3000', token);
  const socketRef = useRef(null);
  const messageMapRef = useRef(new Map()); // Map clientMessageId -> dbMessageId

  // Initialize Socket.IO
  useEffect(() => {
    const socket = io('http://localhost:3000', {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    socketRef.current = socket;
    window.socket = socket; // For typing indicators

    socket.on('connect', () => {
      console.log('Connected to socket server');
      socket.emit('authenticate', token);
    });

    socket.on('authenticated', (data) => {
      console.log('Socket authenticated:', data);
    });

    socket.on('new_message', (message) => {
      setMessages((prev) => {
        // Check for duplicate (from messageId map)
        const isDuplicate = prev.some(m => m.id === message.id);
        if (isDuplicate) return prev;

        // Map client ID to DB ID
        if (message.clientMessageId) {
          messageMapRef.current.set(message.clientMessageId, message.id);
        }

        return [...prev, message];
      });
    });

    socket.on('message_edited', (data) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === data.id ? { ...m, content: data.content } : m))
      );
    });

    socket.on('message_deleted', (data) => {
      setMessages((prev) => prev.filter((m) => m.id !== data.id));
    });

    socket.on('message_read', (data) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === data.message_id) {
            const status = m.status || [];
            return {
              ...m,
              status: status.map((s) =>
                s.user_id === data.user_id ? { ...s, status: 'read' } : s
              )
            };
          }
          return m;
        })
      );
    });

    socket.on('user_typing', (data) => {
      setTypingUsers((prev) => [...new Set([...prev, data.userId])]);
    });

    socket.on('user_stop_typing', (data) => {
      setTypingUsers((prev) => prev.filter((id) => id !== data.userId));
    });

    socket.on('user_online', (data) => {
      console.log('User online:', data);
    });

    socket.on('user_offline', (data) => {
      console.log('User offline:', data);
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    return () => {
      socket.disconnect();
    };
  }, [token]);

  // Load conversations
  useEffect(() => {
    const loadConversations = async () => {
      try {
        setLoading(true);
        const data = await api.getConversations();
        setConversations(data);

        if (data.length > 0) {
          setActiveConversationId(data[0].id);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadConversations();
  }, []);

  // Load messages when conversation changes
  useEffect(() => {
    if (!activeConversationId) return;

    const loadMessages = async () => {
      try {
        const data = await api.getMessages(activeConversationId);
        setMessages(data);

        // Join socket room
        socketRef.current?.emit('join_conversation', activeConversationId);
      } catch (err) {
        setError(err.message);
      }
    };

    loadMessages();

    return () => {
      socketRef.current?.emit('leave_conversation', activeConversationId);
    };
  }, [activeConversationId]);

  const handleSendMessage = async (conversationId, content, messageId) => {
    try {
      // Send via socket for real-time
      socketRef.current?.emit('send_message', {
        conversationId,
        content,
        messageId
      });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEditMessage = async (messageId, content) => {
    try {
      await api.editMessage(messageId, content);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteMessage = async (messageId) => {
    try {
      await api.deleteMessage(messageId);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleMarkAsRead = (messageId) => {
    socketRef.current?.emit('mark_as_read', {
      messageId,
      conversationId: activeConversationId
    });
  };

  const handleSelectConversation = (conversationId) => {
    setActiveConversationId(conversationId);
  };

  const handleNewConversation = () => {
    alert('Feature to create new conversation');
  };

  const activeConversation = conversations.find(c => c.id === activeConversationId);

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="chat-app">
      <ConversationsList
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
      />

      {activeConversation && (
        <ConversationView
          conversation={activeConversation}
          messages={messages}
          onSendMessage={handleSendMessage}
          onEditMessage={handleEditMessage}
          onDeleteMessage={handleDeleteMessage}
          onMarkAsRead={handleMarkAsRead}
          currentUserId={user.id}
          typingUsers={typingUsers}
        />
      )}

      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}

// ===========================
// MAIN APP COMPONENT
// ===========================

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = (user, token) => {
    setUser(user);
    setToken(token);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setToken(null);
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <AuthPage onLogin={handleLogin} />;
  }

  return (
    <div className="app-container">
      <ChatApp user={user} token={token} />
      <button className="logout-btn" onClick={handleLogout}>
        Logout
      </button>
    </div>
  );
}
