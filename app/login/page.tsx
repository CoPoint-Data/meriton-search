'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const router = useRouter();

  // Check if user is already logged in
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me');
        if (response.ok) {
          // Already logged in, redirect to home
          router.push('/');
          return;
        }
      } catch (err) {
        // Not logged in, stay on login page
      }
      setCheckingAuth(false);
    };

    checkAuth();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      // Successful login, redirect to home
      router.push('/');
    } catch (err) {
      setError('An error occurred. Please try again.');
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-meriton-charcoal"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="border-b border-meriton-light">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center">
            <Image
              src="/meriton-logo.jpg"
              alt="Meriton"
              width={120}
              height={40}
              className="object-contain"
              priority
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-10">
            <h1 className="text-3xl font-semibold text-meriton-charcoal tracking-tight">
              Sign in
            </h1>
            <p className="text-meriton-gray mt-2">
              Access the Meriton Archive Search system
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-meriton-charcoal mb-2">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-4 py-3 border border-meriton-light bg-white text-meriton-charcoal placeholder-meriton-silver focus:outline-none focus:border-meriton-charcoal transition-colors"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-meriton-charcoal mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-4 py-3 border border-meriton-light bg-white text-meriton-charcoal placeholder-meriton-silver focus:outline-none focus:border-meriton-charcoal transition-colors"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-meriton-charcoal hover:bg-meriton-dark disabled:bg-meriton-silver text-white font-medium py-3 px-4 transition-colors"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-sm text-meriton-silver">
              Need access? Contact your system administrator.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-meriton-light py-6">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-center text-sm text-meriton-silver">
            Meriton Archive Search
          </p>
        </div>
      </footer>
    </div>
  );
}
