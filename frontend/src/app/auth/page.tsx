"use client";

import React, { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Mail, Lock, UserPlus, LogIn, Sparkles, AlertCircle } from "lucide-react";

export default function AuthPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      if (isSignUp) {
        // Sign Up
        const { error, data } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
          },
        });
        if (error) throw error;
        
        // If email confirmation is required, Supabase returns a user but session is null
        if (data?.user && !data.session) {
          setSuccessMsg("Signup successful! Please check your email for confirmation link.");
        } else {
          setSuccessMsg("Signup successful! Redirecting...");
        }
      } else {
        // Sign In
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      setErrorMsg(err.message || "An authentication error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen bg-neutral-950 flex flex-col justify-center items-center px-4 overflow-hidden selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Visual background accents */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-500/5 blur-[120px]" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-500/5 blur-[120px]" />

      {/* Decorative center ring */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full border border-neutral-900/40 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full border border-neutral-900/60 pointer-events-none border-dashed" />

      {/* Brand logo header */}
      <div className="z-10 mb-8 flex flex-col items-center select-none text-center">
        <div className="relative p-3 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-xl flex justify-center items-center group mb-4">
          <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/20 to-cyan-500/20 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <Sparkles className="w-8 h-8 text-emerald-400 animate-pulse relative z-10" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-neutral-100 font-sans">
          Paper<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Mind</span>
        </h1>
        <p className="text-neutral-500 mt-1.5 text-sm max-w-[280px]">
          Your Intelligent AI PDF Research & Citation Companion
        </p>
      </div>

      {/* Card container */}
      <div className="z-10 w-full max-w-[420px] bg-neutral-900/50 backdrop-blur-xl border border-neutral-800/80 p-8 rounded-3xl shadow-2xl relative">
        <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/10 to-cyan-500/10 rounded-3xl pointer-events-none opacity-50" />
        
        <div className="relative z-10">
          <h2 className="text-xl font-semibold text-neutral-200 text-center mb-6">
            {isSignUp ? "Create your account" : "Welcome back"}
          </h2>

          <form onSubmit={handleAuth} className="space-y-4">
            {isSignUp && (
              <div>
                <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                  Full Name
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-4 text-neutral-500">
                    <LogIn className="w-4 h-4 opacity-50" />
                  </span>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full bg-neutral-950/80 border border-neutral-800 rounded-xl py-3 pl-11 pr-4 text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/40 transition duration-300"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-4 text-neutral-500">
                  <Mail className="w-4 h-4" />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full bg-neutral-950/80 border border-neutral-800 rounded-xl py-3 pl-11 pr-4 text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/40 transition duration-300"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-4 text-neutral-500">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-neutral-950/80 border border-neutral-800 rounded-xl py-3 pl-11 pr-4 text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/40 transition duration-300"
                />
              </div>
            </div>

            {errorMsg && (
              <div className="flex items-center gap-2.5 bg-red-950/30 border border-red-900/50 p-3 rounded-xl text-red-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="flex items-center gap-2.5 bg-emerald-950/30 border border-emerald-900/50 p-3 rounded-xl text-emerald-400 text-xs animate-fade-in">
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full relative mt-6 flex justify-center items-center py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 text-neutral-950 font-bold tracking-wide rounded-xl shadow-lg transition duration-300 cursor-pointer overflow-hidden"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <span className="flex items-center gap-2">
                  {isSignUp ? (
                    <>
                      <UserPlus className="w-4 h-4" /> Sign Up
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" /> Sign In
                    </>
                  )}
                </span>
              )}
            </button>
          </form>

          {/* Toggle mode */}
          <div className="mt-6 text-center text-xs text-neutral-500">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setErrorMsg("");
                setSuccessMsg("");
              }}
              className="text-emerald-400 hover:text-emerald-300 font-semibold transition ml-1 cursor-pointer focus:outline-none"
            >
              {isSignUp ? "Sign In" : "Sign Up"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
