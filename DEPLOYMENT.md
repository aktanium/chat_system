# ⚡ Chat System - Быстрый старт

## Вариант 1: Docker (30 секунд) ✅ РЕКОМЕНДУЕТСЯ

### Требования
- Docker и Docker Compose установлены

### Команды

```bash
# 1. Клонировать/скачать файлы
git clone <repo-url>
cd chat-system

# 2. Запустить всё
docker-compose up -d

# 3. Проверить статус
docker-compose ps

# 4. Открыть браузер
# Frontend: http://localhost:3001
# Backend API: http://localhost:3000
```

**Вот и всё!** Система готова к работе.

---

## Вариант 2: Локальный запуск (macOS/Linux)

### Требования

```bash
# Node.js 16+
node --version  # должно быть >= 16

# PostgreSQL
brew install postgresql@14
brew services start postgresql@14

# Redis
brew install redis
brew services start redis
```

### Установка

```bash
# 1. Клонировать репозиторий
git clone <repo-url>
cd chat-system

# 2. Backend
cd backend
npm install
npm run dev

# 3. В другом терминале - Frontend
cd frontend
npm install
npm start
```

**URL:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

---

## Вариант 3: Windows (WSL2)

### Требования

```bash
# 1. WSL2 установлен
wsl --version

# 2. В WSL терминале:
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs postgresql redis-server
```

### Запуск

```bash
# В WSL терминале
sudo service postgresql start
sudo service redis-server start

# Затем следуйте инструкциям из Варианта 2
```

---

## 🧪 Тестирование

### 1. Проверить Backend API

```bash
curl http://localhost:3000/health
# Response: {"status":"ok","timestamp":"..."}
```

### 2. Создать аккаунт

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123"
  }'
```

### 3. Зайти в приложение

```
Откой http://localhost:3001
Email: test@example.com
Password: password123
```

### 4. Создать чат с другим пользователем

1. Зарегистрируй второго пользователя
2. Создай прямой чат
3. Отправь сообщение

---

## 🐛 Troubleshooting

### Port 3000 уже занят

```bash
# macOS/Linux
lsof -i :3000  # Найти процесс
kill -9 <PID>

# Или просто менять PORT в .env
PORT=3001 npm start
```

### PostgreSQL не запускается

```bash
# Проверить статус
brew services list

# Переустановить
brew uninstall postgresql@14
brew install postgresql@14
initdb /usr/local/var/postgres
```

### Redis ошибка

```bash
# Проверить
redis-cli ping  # должно вернуть PONG

# Переустановить
brew uninstall redis
brew install redis
```

### Socket.IO не подключается

```javascript
// В браузере console:
// Если ошибка, проверить:
// 1. Backend запущен
// 2. Правильный URL в .env
// 3. CORS включен в backend
```

---

## 📊 Мониторинг Системы

### Docker контейнеры

```bash
# Все контейнеры
docker-compose ps

# Логи backend
docker-compose logs -f backend

# Логи database
docker-compose logs -f postgres

# Заходить в контейнер
docker-compose exec backend bash
```

### Database

```bash
# Подключиться к PostgreSQL
psql -U postgres -d chat_system

# Полезные команды
\dt              # Список таблиц
\d users         # Структура таблицы
SELECT COUNT(*) FROM messages;  # Кол-во сообщений
```

### Redis

```bash
# Подключиться
redis-cli

# Полезные команды
KEYS *           # Все ключи
GET user:1:online
MONITOR          # Смотреть все команды
```

---

## 🚀 Развертывание в Production

### Вариант 1: Heroku

```bash
# 1. Установить Heroku CLI
# 2. Залогиниться
heroku login

# 3. Создать app
heroku create chat-app

# 4. Добавить PostgreSQL
heroku addons:create heroku-postgresql:standard-0

# 5. Добавить Redis
heroku addons:create heroku-redis:premium-0

# 6. Установить переменные
heroku config:set JWT_SECRET=super-secret-key

# 7. Дeплой
git push heroku main
```

### Вариант 2: DigitalOcean

```bash
# 1. Создать Droplet (Ubuntu 20.04)
# 2. SSH в сервер
ssh root@<IP>

# 3. Установить зависимости
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs postgresql redis-server nginx

# 4. Клонировать код
git clone <repo>
cd chat-system

# 5. Установить зависимости
npm install

# 6. Запустить с PM2
sudo npm install -g pm2
pm2 start chat-backend.js --name "chat-api"
pm2 startup
pm2 save

# 7. Настроить Nginx
# ... (см. конфиг ниже)
```

### Nginx конфиг для DigitalOcean

```nginx
# /etc/nginx/sites-available/default

server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket
    location /socket.io {
        proxy_pass http://localhost:3000/socket.io;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

### Вариант 3: AWS EC2

```bash
# 1. Создать EC2 instance (Ubuntu 20.04)
# 2. Security Group: открыть порты 80, 443, 3000
# 3. SSH в сервер
ssh -i key.pem ubuntu@<IP>

# 4. Установить Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 5. Клонировать и запустить
git clone <repo>
cd chat-system
docker-compose up -d

# 6. Установить SSL (Let's Encrypt)
sudo apt-get install certbot python3-certbot-nginx
sudo certbot certonly --standalone -d yourdomain.com
```

---

## 🔄 CI/CD с GitHub Actions

```yaml
# .github/workflows/deploy.yml

name: Deploy

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Build Docker images
        run: docker-compose build
      
      - name: Push to Docker Hub
        run: |
          docker login -u ${{ secrets.DOCKER_USER }} -p ${{ secrets.DOCKER_PASS }}
          docker-compose push
      
      - name: Deploy to server
        run: |
          ssh -i ${{ secrets.DEPLOY_KEY }} ubuntu@${{ secrets.SERVER_IP }} \
            "cd /app && docker-compose pull && docker-compose up -d"
```

---

## 📈 Масштабирование

### Горизонтальное масштабирование

```bash
# Запустить несколько инстансов backend
docker-compose up -d --scale backend=3

# Nginx будет балансировать нагрузку между ними
```

### Кеширование

```bash
# Увеличить Redis память
docker-compose.yml:
  redis:
    command: redis-server --maxmemory 2gb --maxmemory-policy allkeys-lru
```

---

## 📝 Команды для администратора

```bash
# Перезагрузить контейнеры
docker-compose restart

# Очистить логи
docker-compose logs --tail=100

# Backup database
docker exec chat_postgres pg_dump -U postgres chat_system > backup.sql

# Restore database
docker exec -i chat_postgres psql -U postgres chat_system < backup.sql

# Мониторить ресурсы
docker stats

# Очистить неиспользуемые контейнеры
docker system prune -a
```

---

## 🎯 Чек-лист Production

- [ ] JWT_SECRET изменен на надежный
- [ ] CORS настроен на конкретный домен
- [ ] Database пароли усилены
- [ ] SSL/TLS сертификат установлен
- [ ] Логирование настроено
- [ ] Мониторинг включен
- [ ] Резервные копии включены
- [ ] Rate limiting добавлен
- [ ] DDoS protection включена
- [ ] Обновления безопасности применены

---

## 📞 Помощь

```bash
# Проверить все логи
docker-compose logs

# Проверить определенный сервис
docker-compose logs backend

# Интерактивный режим
docker-compose logs -f backend

# Только последние 50 строк
docker-compose logs --tail=50
```

**Готово!** Твоя Chat System теперь запущена и готова к использованию! 🎉
