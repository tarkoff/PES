import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, AuthContext } from '../context/AuthContext';
import type { ReactNode } from 'react';

// Mock the auth API
vi.mock('../api/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
  getProfile: vi.fn(),
}));

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  BrowserRouter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Mail: () => <div data-testid="mail-icon" />,
  Lock: () => <div data-testid="lock-icon" />,
  AlertCircle: () => <div data-testid="alert-icon" />,
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

describe('Login Component', () => {
  const mockLogin = vi.fn();

  const renderWithAuth = (ui: ReactNode) => {
    return render(
      <AuthProvider value={{
        user: null,
        token: null,
        login: mockLogin,
        register: vi.fn(),
        logout: vi.fn(),
        isAuthenticated: false,
        loading: false,
      }}>
        {ui}
      </AuthProvider>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login form', () => {
    // Dynamically import to avoid Vite-specific imports
    const Login = require('../pages/auth/Login').default;
    renderWithAuth(<Login />);

    expect(screen.getByText('Вхід в систему')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
  });

  it('updates email input on change', async () => {
    const Login = require('../pages/auth/Login').default;
    renderWithAuth(<Login />);

    const emailInput = screen.getByPlaceholderText('you@example.com');
    await userEvent.type(emailInput, 'test@example.com');

    expect(emailInput).toHaveValue('test@example.com');
  });

  it('updates password input on change', async () => {
    const Login = require('../pages/auth/Login').default;
    renderWithAuth(<Login />);

    const passwordInput = screen.getByPlaceholderText('••••••••');
    await userEvent.type(passwordInput, 'password123');

    expect(passwordInput).toHaveValue('password123');
  });

  it('shows loading state when submitting', async () => {
    const Login = require('../pages/auth/Login').default;
    mockLogin.mockResolvedValueOnce({ access_token: 'token', user: {} });

    renderWithAuth(<Login />);

    const emailInput = screen.getByPlaceholderText('you@example.com');
    const passwordInput = screen.getByPlaceholderText('••••••••');
    const submitButton = screen.getByRole('button', { name: /Увійти/i });

    await userEvent.type(emailInput, 'test@example.com');
    await userEvent.type(passwordInput, 'password123');
    fireEvent.click(submitButton);

    expect(submitButton).toHaveTextContent('Вхід...');
  });
});
