'use client';

import { supabase } from '@/lib/supabase';
import { Trophy } from 'lucide-react';

export default function AuthPage() {
  const handleGoogleSignIn = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`
        },
      });
      if (error) throw error;
    } catch (error) {
      console.error('Error signing in with Google:', error);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center overflow-hidden relative" style={{ background: 'linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 25%, #16213e 50%, #0f172a 75%, #0a0a0f 100%)' }}>
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-500/5 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl animate-pulse animation-delay-1000"></div>
        <div className="absolute top-3/4 left-1/2 w-48 h-48 bg-yellow-500/5 rounded-full blur-3xl animate-pulse animation-delay-2000"></div>

        {/* Floating Particles */}
        <div className="absolute top-1/3 left-1/5 w-2 h-2 bg-orange-400/30 rounded-full animate-bounce animation-delay-500"></div>
        <div className="absolute top-2/3 right-1/3 w-1 h-1 bg-blue-400/40 rounded-full animate-ping animation-delay-1500"></div>
        <div className="absolute bottom-1/3 left-2/3 w-1.5 h-1.5 bg-yellow-400/35 rounded-full animate-pulse animation-delay-3000"></div>
        <div className="absolute top-1/2 left-1/3 w-1 h-1 bg-purple-400/35 rounded-full animate-ping animation-delay-2500"></div>
      </div>

      <div className="container mx-auto px-8 relative z-10">
        <div className="grid grid-cols-2 items-center gap-16 h-screen">

          {/* Left Side - Enhanced Branding */}
          <div className="flex flex-col justify-center space-y-12">
            {/* Brand */}
            <div className="flex items-center gap-4 group">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-orange-400 to-yellow-400 rounded-3xl blur-lg opacity-50 group-hover:opacity-75 transition-opacity duration-300"></div>
                <div
                  className="relative w-14 h-14 rounded-3xl flex items-center justify-center shadow-2xl transform group-hover:scale-105 transition-transform duration-300"
                  style={{
                    background: 'linear-gradient(135deg, #ff6b35 0%, #f7931e 50%, #ffd700 100%)',
                    boxShadow: '0 12px 40px rgba(255, 107, 53, 0.4)'
                  }}
                >
                  <Trophy className="w-7 h-7 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-4xl font-black text-white tracking-tight">CrickRush</h1>
                <p className="text-orange-400 font-semibold text-lg">Live Cricket Auction Game</p>
              </div>
            </div>

            {/* Headline */}
            <div className="space-y-6">
              <h2 className="text-5xl font-black text-white leading-tight">
                Master the Art of
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-yellow-400 to-red-400">
                  Cricket Domination
                </span>
              </h2>
              <p className="text-xl text-gray-300 leading-relaxed max-w-lg font-medium">
                Enter the elite world of strategic cricket auctions. Build your dream team and compete with the best.
              </p>
            </div>

            {/* Subtle Accent Elements */}
            <div className="flex items-center gap-6 opacity-60">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-green-400 text-sm font-medium">Live Auctions</span>
              </div>
              <div className="w-px h-4 bg-gray-600"></div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse animation-delay-1000"></div>
                <span className="text-blue-400 text-sm font-medium">Global Players</span>
              </div>
              <div className="w-px h-4 bg-gray-600"></div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse animation-delay-2000"></div>
                <span className="text-yellow-400 text-sm font-medium">Real-time</span>
              </div>
            </div>
          </div>

          {/* Right Side - Auth Form */}
          <div className="flex justify-center items-center">
            <div className="card card-lg w-full max-w-md">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold mb-3 text-primary">Welcome Back</h2>
                <p style={{ color: 'var(--text-muted)' }}>
                  Sign in with Google to start your auction journey
                </p>
              </div>

              <button
                onClick={handleGoogleSignIn}
                className="btn btn-primary btn-lg w-full"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>

              <p className="text-center mt-6 text-sm" style={{ color: 'var(--text-disabled)' }}>
                By signing in, you agree to our Terms of Service and Privacy Policy
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
