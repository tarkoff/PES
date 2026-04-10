# Швидкий старт - Автентифікація та Ролі

## Виправлення застосовані ✅

1. **API URL виправлено** - додано префікс `/api` до всіх ендпоінтів
2. **Стилі полів введення** - змінено на світлий фон з темним текстом
3. **Рольова система** - додано ролі `admin` та `user`
4. **Публічна домашня сторінка** - доступна всім без авторизації
5. **Адмін-панель** - доступна тільки користувачам з роллю `admin`

## Як запустити

### 1. Сервер (Backend):
```bash
cd d:\PROJECTS\PES2\server
npm run start:dev
```

### 2. Клієнт (Frontend):
```bash
cd d:\PROJECTS\PES2\client
npm run dev
```

### 3. Створення адміністратора (перший запуск):
```bash
cd d:\PROJECTS\PES2\server
npm run seed
```

### 4. Відкрити:
- Публічна домашня сторінка: http://localhost:5173/
- Вхід адміністратора: http://localhost:5173/login
  - Email: `admin`
  - Password: `admin`
- Реєстрація нового користувача: http://localhost:5173/register

## Доступні маршрути

### Публічні (доступні всім):
- `GET http://localhost:5173/` - домашня сторінка з пошуком датасетів
- `GET http://localhost:5173/datasets/:id/records` - перегляд записів датасету

### Адмін-панель (потрібна роль `admin`):
- `GET http://localhost:5173/admin/dashboard` - панель керування
- `GET http://localhost:5173/admin/datasets` - керування датасетами
- `GET http://localhost:5173/admin/users` - керування користувачами

### API ендпоінти

Всі ендпоінти тепер доступні за адресою:
- `POST http://localhost:3000/api/auth/register` - реєстрація
- `POST http://localhost:3000/api/auth/login` - вхід
- `GET http://localhost:3000/api/auth/profile` - профіль (потрібен JWT)
- `GET http://localhost:3000/api/auth/google` - Google OAuth
- `GET http://localhost:3000/api/auth/facebook` - Facebook OAuth
- `GET http://localhost:3000/api/users` - список користувачів (адмін)
- `POST http://localhost:3000/api/users` - створити користувача (адмін)
- `PATCH http://localhost:3000/api/users/:id` - оновити користувача (адмін)
- `DELETE http://localhost:3000/api/users/:id` - видалити користувача (адмін)

## Ролі користувачів

### Admin (Адміністратор)
- Повний доступ до адмін-панелі
- Може керувати датасетами та імпортом даних
- Може керувати користувачами та призначати ролі

### User (Користувач)
- Може авторизуватися в системі
- Має доступ до публічних сторінок
- Не має доступу до адмін-панелі

## Налаштування OAuth (опціонально)

Для Google та Facebook авторизації потрібно налаштувати OAuth credentials в `server/.env`:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Facebook OAuth
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
```

Детальна інструкція в файлі `AUTH_GUIDE.md`
