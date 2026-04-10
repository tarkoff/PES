# Authentication Setup Guide

This project now has a complete authentication system with support for:
- Email/Password registration and login
- Google OAuth2 login
- Facebook OAuth2 login

## Backend Setup (NestJS)

### Environment Variables

Update your `server/.env` file with the following:

```env
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Facebook OAuth
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
FACEBOOK_CALLBACK_URL=http://localhost:3000/auth/facebook/callback

# Frontend URL
FRONTEND_URL=http://localhost:5173
```

### Setting up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API
4. Go to "Credentials" and create OAuth 2.0 credentials
5. Set authorized redirect URIs: `http://localhost:3000/auth/google/callback`
6. Copy the Client ID and Client Secret to your `.env` file

### Setting up Facebook OAuth

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app
3. Add "Facebook Login" product
4. Set valid OAuth redirect URIs: `http://localhost:3000/auth/facebook/callback`
5. Copy the App ID and App Secret to your `.env` file

### Database Migration

The User model has been added to the Prisma schema. The migration should already be applied. If not, run:

```bash
cd server
npx prisma migrate dev
```

### Default Admin User

A default admin user is automatically created when you run the seed script:

- **Email**: `admin`
- **Password**: `admin`
- **Role**: `admin`

To create the admin user, run:

```bash
cd server
npm run seed
```

**Note**: The seed script checks if the admin user already exists, so it's safe to run multiple times without creating duplicates.

### User Roles

The system now supports two user roles:
- **`admin`**: Full access to administrative features (dataset management, user management, dashboard)
- **`user`**: Basic authenticated access (can view public datasets)

Admin users can:
- Access the admin dashboard at `/admin/dashboard`
- Manage datasets at `/admin/datasets`
- Manage users at `/admin/users`
- View and configure dataset records

Regular users and guests can:
- View the public homepage at `/`
- Search and browse available datasets
- View dataset records (read-only)

## Frontend Setup (React)

### Environment Variables

Create a `client/.env` file (optional, defaults are set):

```env
VITE_API_URL=http://localhost:3000
```

## API Endpoints

### Authentication

- `POST /auth/register` - Register with email/password
  ```json
  {
    "email": "user@example.com",
    "password": "password123",
    "first_name": "John",
    "last_name": "Doe"
  }
  ```

- `POST /auth/login` - Login with email/password
  ```json
  {
    "email": "user@example.com",
    "password": "password123"
  }
  ```

- `GET /auth/profile` - Get current user profile (requires JWT token)
  - Headers: `Authorization: Bearer <token>`

- `GET /auth/google` - Initiate Google OAuth login
  - Redirects to Google login page

- `GET /auth/google/callback` - Google OAuth callback
  - Handles redirect from Google

- `GET /auth/facebook` - Initiate Facebook OAuth login
  - Redirects to Facebook login page

- `GET /auth/facebook/callback` - Facebook OAuth callback
  - Handles redirect from Facebook

## Frontend Routes

### Public Routes (accessible to everyone)
- `/` - Public homepage with dataset search
- `/datasets/:id/records` - Dataset record viewer (read-only)
- `/login` - Login page
- `/register` - Registration page
- `/auth/callback` - OAuth callback handler

### Admin Routes (requires admin role)
- `/admin/dashboard` - Admin dashboard with statistics
- `/admin/datasets` - Dataset management (create, edit, import)
- `/admin/users` - User management (create, edit, delete, assign roles)

## Features

### User Model
- Email and password authentication
- OAuth provider tracking (Google, Facebook)
- User profile fields (first name, last name, avatar URL)
- **Role-based access control** (`admin` or `user`)
- Active/inactive status

### Security
- Passwords hashed with bcrypt
- JWT tokens with 7-day expiration
- Protected routes on the frontend
- Passport.js strategies for authentication

### Frontend
- Beautiful dark-themed login/register pages
- Google and Facebook login buttons
- User menu with profile and logout
- Protected routes redirect to login
- Persistent authentication via localStorage

## Testing

### Start the backend:
```bash
cd server
npm run start:dev
```

### Start the frontend:
```bash
cd client
npm run dev
```

### Test admin login:
1. Navigate to `http://localhost:5173/login`
2. Enter email: `admin` and password: `admin`
3. Click "Sign In"
4. You should see the "Адмін панель" button on the homepage
5. Click it to access the admin dashboard

### Test email/password registration:
1. Navigate to `http://localhost:5173/register`
2. Fill in email and password (min 6 characters)
3. Click "Sign Up"
4. You should be redirected to the homepage (new users get 'user' role by default)

### Test login:
1. Navigate to `http://localhost:5173/login`
2. Enter your email and password
3. Click "Sign In"
4. You should be redirected to the homepage

### Test OAuth:
1. Click "Google" or "Facebook" button
2. Complete the OAuth flow
3. You should be redirected back to the dashboard with an active session

## Troubleshooting

### OAuth not working?
- Verify your OAuth credentials in `.env`
- Check that redirect URIs match exactly in your OAuth provider settings
- Ensure the callback URLs are correct

### Database errors?
- Make sure PostgreSQL is running
- Run `npx prisma generate` to regenerate the Prisma client
- Run `npx prisma migrate dev` to apply migrations

### CORS issues?
- Ensure your backend CORS is configured to allow requests from the frontend
- In development, NestJS should allow requests from `http://localhost:5173`
