"use client";

import React from "react";
import { useAuth } from "@/context/AuthContext";
import { Sparkles } from "lucide-react";

export default function Home() {
  const { loading } = useAuth();

  return (
    <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-neutral-950 text-neutral-100 font-sans">
      <div className="flex flex-col items-center select-none text-center animate-pulse">
        <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-xl flex justify-center items-center mb-4">
          <Sparkles className="w-8 h-8 text-emerald-400" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-100">
          Paper<span className="text-emerald-400">Mind</span>
        </h1>
        <p className="text-neutral-500 mt-1 text-xs">
          Loading secure workspace...
        </p>
      </div>
    </div>
  );
}
