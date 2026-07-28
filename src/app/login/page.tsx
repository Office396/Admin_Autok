'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();
    const supabase = createClient();

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                throw error;
            }

            router.push('/');
            router.refresh(); // Refresh middleware
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden">
            {/* Dynamic Background */}
            <div className="absolute inset-0 z-0">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-900/30 rounded-full blur-[120px] animate-pulse"></div>
                <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-900/30 rounded-full blur-[120px] animate-pulse delay-1000"></div>
            </div>

            {/* Login Card */}
            <div className="relative z-10 w-full max-w-md bg-gray-900/40 backdrop-blur-xl border border-gray-800 rounded-3xl p-8 shadow-2xl overflow-hidden group">

                {/* Shine Effect */}
                <div className="absolute inset-0 -translate-x-full group-hover:animate-shine bg-gradient-to-r from-transparent via-white/5 to-transparent z-20 pointer-events-none" />

                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-xl mx-auto mb-4 flex items-center justify-center shadow-lg shadow-blue-500/20">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-white">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Welcome Back</h1>
                    <p className="text-gray-400 text-sm">Sign in to access the Secure Command Center</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6 relative z-30">
                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1 ml-1" htmlFor="email">EMAIL ADDRESS</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-gray-800/50 border border-gray-700 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder-gray-600"
                            placeholder="admin@example.com"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1 ml-1" htmlFor="password">PASSWORD</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-gray-800/50 border border-gray-700 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder-gray-600"
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    {error && (
                        <div className="bg-red-900/20 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm text-center animate-shake">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold py-3.5 rounded-xl hover:shadow-lg hover:shadow-blue-500/30 active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            'Sign In'
                        )}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <p className="text-gray-500 text-xs">
                        Secure System • v2.4.0 • <span className="hover:text-blue-400 cursor-pointer transition-colors">Privacy</span>
                    </p>
                </div>
            </div>

            {/* Animated Particles/Dots (CSS only) */}
            <style jsx global>{`
        @keyframes shine {
          100% { left: 125%; }
        }
        .animate-shine {
          animation: shine 2s infinite;
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
        }
      `}</style>
        </div>
    );
}
