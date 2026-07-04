"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { getToken } from "@/lib/supabaseClient";
import {
  Plus,
  Trash2,
  Send,
  FileText,
  Sparkles,
  LogOut,
  UploadCloud,
  MessageSquare,
  CheckSquare,
  Square,
  BookOpen,
  User,
  AlertCircle,
  X,
  ChevronRight,
  Loader2,
  FileUp,
  Hash,
  Pencil,
  Check,
  Menu,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocumentMeta {
  id: string;
  filename: string;
  file_path: string;
  file_size: number;
  created_at: string;
}

interface ChatMeta {
  id: string;
  title: string;
  created_at: string;
}

interface Citation {
  source_number: number;
  document_id: string;
  filename: string;
  page_number: number;
  content: string;
}

interface Message {
  id: string;
  sender: "user" | "assistant";
  content: string;
  citations?: Citation[];
  created_at: string;
}

// ─── API helper ───────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function apiFetch(path: string, init: RequestInit = {}) {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API}${path}`, { ...init, headers });
  return res;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function relativeDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user, signOut } = useAuth();

  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [chats, setChats] = useState<ChatMeta[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");

  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [docsLoaded, setDocsLoaded] = useState(false);
  // Pending delete IDs for inline confirmation (avoids blocked confirm() dialogs)
  const [pendingDeleteChat, setPendingDeleteChat] = useState<string | null>(null);
  const [pendingDeleteDoc, setPendingDeleteDoc] = useState<string | null>(null);
  // Mobile menu drawers
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isMobileDocPanelOpen, setIsMobileDocPanelOpen] = useState(false);
  // Inline rename state
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await apiFetch("/api/documents");
      if (res.ok) {
        const data: DocumentMeta[] = await res.json();
        setDocuments(data);
      }
    } catch (e) {
      console.error("Fetch documents failed:", e);
    } finally {
      setDocsLoaded(true);
    }
  }, []);

  const fetchChats = useCallback(async () => {
    try {
      const res = await apiFetch("/api/chats");
      if (res.ok) {
        const data: ChatMeta[] = await res.json();
        setChats(data);
        if (data.length > 0 && !currentChatId) {
          setCurrentChatId(data[0].id);
        }
      }
    } catch (e) {
      console.error("Fetch chats failed:", e);
    }
  }, [currentChatId]);

  const fetchMessages = useCallback(async (chatId: string) => {
    setChatLoading(true);
    try {
      const res = await apiFetch(`/api/chats/${chatId}/messages`);
      if (res.ok) {
        const data: Message[] = await res.json();
        setMessages(data);
      }
    } catch (e) {
      console.error("Fetch messages failed:", e);
    } finally {
      setChatLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchDocuments();
    fetchChats();
  }, []);

  // Load messages when chat changes
  useEffect(() => {
    if (currentChatId) {
      fetchMessages(currentChatId);
    } else {
      setMessages([]);
    }
    setActiveCitation(null);
  }, [currentChatId]);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sendingMessage]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleCreateChat = async () => {
    try {
      const title = `Chat ${chats.length + 1}`;
      const res = await apiFetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        const newChat: ChatMeta = await res.json();
        setChats((prev) => [newChat, ...prev]);
        setCurrentChatId(newChat.id);
        setIsMobileSidebarOpen(false);
      }
    } catch (e) {
      console.error("Create chat failed:", e);
    }
  };

  const handleDeleteChatClick = (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setPendingDeleteChat(chatId);
  };

  const confirmDeleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setPendingDeleteChat(null);
    try {
      const res = await apiFetch(`/api/chats/${chatId}`, { method: "DELETE" });
      if (res.ok) {
        setChats((prev) => prev.filter((c) => c.id !== chatId));
        if (currentChatId === chatId) {
          const remaining = chats.filter((c) => c.id !== chatId);
          setCurrentChatId(remaining[0]?.id ?? null);
        }
      } else {
        console.error("Delete chat failed:", res.status, await res.text());
      }
    } catch (err) {
      console.error("Delete chat error:", err);
    }
  };

  const startRenaming = (chatId: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setPendingDeleteChat(null);
    setRenamingChatId(chatId);
    setRenameValue(currentTitle);
    // Focus input on next tick
    setTimeout(() => renameInputRef.current?.focus(), 0);
  };

  const submitRename = async (chatId: string) => {
    const newTitle = renameValue.trim();
    if (!newTitle || newTitle === chats.find((c) => c.id === chatId)?.title) {
      setRenamingChatId(null);
      return;
    }
    try {
      const res = await apiFetch(`/api/chats/${chatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
      if (res.ok) {
        setChats((prev) =>
          prev.map((c) => (c.id === chatId ? { ...c, title: newTitle } : c))
        );
      } else {
        console.error("Rename chat failed:", res.status, await res.text());
      }
    } catch (err) {
      console.error("Rename chat error:", err);
    } finally {
      setRenamingChatId(null);
    }
  };

  const cancelRename = () => {
    setRenamingChatId(null);
    setRenameValue("");
  };


  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError("");
    setUploadSuccess("");

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setUploadError("Only PDF files are supported.");
      return;
    }

    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      const res = await fetch(`${API}/api/documents/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setUploadSuccess(`"${file.name}" uploaded — ${data.chunks_count} chunks indexed.`);
        await fetchDocuments();
        if (fileInputRef.current) fileInputRef.current.value = "";
        setTimeout(() => setUploadSuccess(""), 4000);
      } else {
        const err = await res.json().catch(() => ({}));
        setUploadError(err.detail ?? `Upload failed (${res.status})`);
      }
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocumentClick = (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setPendingDeleteDoc(docId);
  };

  const confirmDeleteDocument = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setPendingDeleteDoc(null);
    try {
      const res = await apiFetch(`/api/documents/${docId}`, { method: "DELETE" });
      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== docId));
        setSelectedDocIds((prev) => prev.filter((id) => id !== docId));
      } else {
        console.error("Delete document failed:", res.status, await res.text());
      }
    } catch (err) {
      console.error("Delete document error:", err);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !currentChatId || sendingMessage) return;

    const text = inputText.trim();
    setInputText("");
    setSendingMessage(true);

    // Optimistic user bubble
    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      sender: "user",
      content: text,
      citations: [],
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await apiFetch(`/api/chats/${currentChatId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          document_ids: selectedDocIds.length > 0 ? selectedDocIds : null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) =>
          prev
            .filter((m) => m.id !== tempId)
            .concat([data.user_message, data.assistant_message])
        );
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        alert("Failed to get a response. Please try again.");
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSendingMessage(false);
    }
  };

  const toggleDoc = (id: string) =>
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );

  // ── Citation rendering ───────────────────────────────────────────────────

  const renderContent = (msg: Message) => {
    if (msg.sender === "user") {
      return (
        <p className="text-sm text-neutral-200 whitespace-pre-wrap leading-relaxed">
          {msg.content}
        </p>
      );
    }

    const citations = msg.citations ?? [];
    if (citations.length === 0) {
      return (
        <div className="text-sm text-neutral-300 leading-relaxed prose prose-invert prose-sm max-w-none">
          <ReactMarkdown>{msg.content}</ReactMarkdown>
        </div>
      );
    }

    // Replace [N] with clickable badge
    const parts = msg.content.split(/(\[\d+\])/g);
    return (
      <div className="text-sm text-neutral-300 leading-relaxed">
        {parts.map((part, i) => {
          const match = part.match(/^\[(\d+)\]$/);
          if (match) {
            const num = parseInt(match[1], 10);
            const cit = citations.find((c) => c.source_number === num);
            if (cit) {
              return (
                <button
                  key={i}
                  onClick={() => setActiveCitation(cit)}
                  title={`${cit.filename} · p.${cit.page_number}`}
                  className="inline-flex items-center gap-0.5 mx-0.5 px-1.5 py-0.5 rounded text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/30 transition cursor-pointer"
                >
                  <Hash className="w-2.5 h-2.5" />
                  {num}
                </button>
              );
            }
          }
          return <ReactMarkdown key={i} components={{ p: "span" }}>{part}</ReactMarkdown>;
        })}
      </div>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const currentChat = chats.find((c) => c.id === currentChatId);

  return (
    <div className="flex h-screen w-screen bg-[#0a0a0f] text-neutral-100 overflow-hidden font-sans">
      {/* Ambient gradient blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-emerald-600/8 blur-[100px]" />
        <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] rounded-full bg-cyan-600/6 blur-[100px]" />
      </div>

      {/* Mobile Sidebar backdrop */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* ── LEFT SIDEBAR: CHAT LIST ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 flex flex-col border-r border-white/5 bg-[#0a0a0f] transition-transform duration-300 transform lg:translate-x-0 lg:static lg:z-10 lg:flex ${
          isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand */}
        <div className="px-5 py-5 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-sm tracking-tight text-white">
                Paper<span className="text-emerald-400">Mind</span>
              </p>
              <p className="text-[9px] text-neutral-500 font-medium uppercase tracking-widest">
                AI Research
              </p>
            </div>
          </div>
        </div>

        {/* New Chat */}
        <div className="px-3 py-3">
          <button
            onClick={handleCreateChat}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/8 bg-white/4 hover:bg-white/8 text-neutral-300 hover:text-white text-xs font-semibold transition-all duration-200 cursor-pointer group"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-400 group-hover:rotate-90 transition-transform duration-200" />
            New Chat Session
          </button>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto px-3 space-y-1 pb-3 scrollbar-hide">
          {chats.length === 0 ? (
            <div className="text-center pt-8 text-neutral-600 text-xs">
              No chats yet
            </div>
          ) : (
            chats.map((c) => (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (pendingDeleteChat !== c.id && renamingChatId !== c.id) {
                    setCurrentChatId(c.id);
                    setIsMobileSidebarOpen(false);
                  }
                }}
                onKeyDown={(e) => e.key === "Enter" && renamingChatId !== c.id && setCurrentChatId(c.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-all duration-150 group cursor-pointer ${
                  currentChatId === c.id
                    ? "bg-emerald-500/10 border border-emerald-500/20 text-neutral-100"
                    : "hover:bg-white/4 border border-transparent text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {renamingChatId === c.id ? (
                  // Inline rename input
                  <div className="flex items-center gap-1.5 w-full" onClick={(e) => e.stopPropagation()}>
                    <input
                      ref={renameInputRef}
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitRename(c.id);
                        if (e.key === "Escape") cancelRename();
                      }}
                      className="flex-1 min-w-0 bg-neutral-950 border border-emerald-500/40 rounded-lg px-2 py-1 text-xs text-neutral-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                    />
                    <button
                      onClick={() => submitRename(c.id)}
                      className="p-1 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30 cursor-pointer transition shrink-0"
                      title="Save"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      onClick={cancelRename}
                      className="p-1 rounded-lg bg-neutral-800 border border-white/8 text-neutral-400 hover:bg-neutral-700 cursor-pointer transition shrink-0"
                      title="Cancel"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : pendingDeleteChat === c.id ? (
                  // Inline delete confirmation row
                  <div className="flex items-center gap-1.5 w-full" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[10px] text-red-400 font-semibold flex-1">Delete chat?</span>
                    <button
                      onClick={(e) => confirmDeleteChat(c.id, e)}
                      className="px-2 py-0.5 rounded-md bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] font-bold hover:bg-red-500/30 cursor-pointer transition"
                    >
                      Yes
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setPendingDeleteChat(null); }}
                      className="px-2 py-0.5 rounded-md bg-neutral-800 border border-white/8 text-neutral-400 text-[10px] font-bold hover:bg-neutral-700 cursor-pointer transition"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 min-w-0 pointer-events-none">
                      <MessageSquare
                        className={`w-3.5 h-3.5 shrink-0 ${
                          currentChatId === c.id ? "text-emerald-400" : "text-neutral-500"
                        }`}
                      />
                      <span className="text-xs font-medium truncate">{c.title}</span>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                      <button
                        onClick={(e) => startRenaming(c.id, c.title, e)}
                        className="p-1 rounded-lg hover:text-emerald-400 hover:bg-white/5 transition cursor-pointer"
                        title="Rename"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteChatClick(c.id, e)}
                        className="p-1 rounded-lg hover:text-red-400 hover:bg-white/5 transition cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* User footer */}
        <div className="px-3 py-3 border-t border-white/5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-neutral-800 border border-white/10 flex items-center justify-center shrink-0">
                <User className="w-3.5 h-3.5 text-neutral-400" />
              </div>
              <p className="text-[11px] text-neutral-400 truncate">{user?.email}</p>
            </div>
            <button
              onClick={signOut}
              title="Sign Out"
              className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-white/5 transition cursor-pointer shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Document Panel backdrop */}
      {isMobileDocPanelOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setIsMobileDocPanelOpen(false)}
        />
      )}

      {/* ── DOCUMENT PANEL ── */}
      <div
        className={`fixed inset-y-0 right-0 z-40 w-72 flex flex-col border-l lg:border-l-0 lg:border-r border-white/5 bg-[#0a0a0f] transition-transform duration-300 transform lg:translate-x-0 lg:static lg:z-10 lg:flex ${
          isMobileDocPanelOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="px-4 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Documents
            </span>
          </div>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-neutral-800 text-neutral-400 border border-white/5">
            {documents.length}
          </span>
        </div>

        {/* Upload zone */}
        <div className="p-3 border-b border-white/5">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".pdf"
            className="hidden"
            id="pdf-upload"
            disabled={uploading}
          />
          <label
            htmlFor="pdf-upload"
            className={`flex flex-col items-center justify-center gap-2 w-full rounded-2xl border border-dashed p-5 cursor-pointer transition-all duration-300 ${
              uploading
                ? "border-neutral-700 bg-neutral-900/30 cursor-not-allowed"
                : "border-neutral-700 hover:border-emerald-500/50 bg-neutral-900/20 hover:bg-emerald-500/5"
            }`}
          >
            {uploading ? (
              <>
                <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
                <p className="text-[11px] text-neutral-400 font-semibold text-center">
                  Processing & indexing...
                </p>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-2xl bg-neutral-800/80 border border-white/8 flex items-center justify-center">
                  <UploadCloud className="w-5 h-5 text-neutral-400" />
                </div>
                <div className="text-center">
                  <p className="text-[12px] font-semibold text-neutral-300">Upload PDF</p>
                  <p className="text-[10px] text-neutral-600 mt-0.5">
                    Chunked & vector-indexed
                  </p>
                </div>
              </>
            )}
          </label>

          {/* Upload error */}
          {uploadError && (
            <div className="mt-2 flex items-start gap-2 p-2.5 rounded-xl bg-red-950/40 border border-red-900/50 text-[11px] text-red-400">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          {/* Upload success */}
          {uploadSuccess && (
            <div className="mt-2 flex items-start gap-2 p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-900/50 text-[11px] text-emerald-400">
              <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{uploadSuccess}</span>
            </div>
          )}
        </div>

        {/* Context selector label */}
        {documents.length > 0 && (
          <div className="px-4 pt-3 pb-1 flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-500">
              Search context
            </span>
            {selectedDocIds.length > 0 && (
              <button
                onClick={() => setSelectedDocIds([])}
                className="text-[9px] text-emerald-400 hover:underline cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* Document list */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 scrollbar-hide">
          {!docsLoaded ? (
            <div className="flex justify-center pt-8">
              <Loader2 className="w-5 h-5 text-neutral-600 animate-spin" />
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center pt-10 text-center text-neutral-600">
              <FileUp className="w-8 h-8 mb-2 stroke-[1.5]" />
              <p className="text-xs font-medium">No documents yet</p>
              <p className="text-[10px] mt-1 text-neutral-700">
                Upload a PDF to get started
              </p>
            </div>
          ) : (
            documents.map((d) => {
              const selected = selectedDocIds.includes(d.id);
              const isPendingDelete = pendingDeleteDoc === d.id;
              return (
                <div
                  key={d.id}
                  onClick={() => { if (!isPendingDelete) toggleDoc(d.id); }}
                  className={`group flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all duration-150 ${
                    isPendingDelete
                      ? "border-red-500/30 bg-red-950/10"
                      : selected
                      ? "border-emerald-500/30 bg-emerald-500/8 text-neutral-100"
                      : "border-white/5 bg-white/2 hover:bg-white/5 text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  {isPendingDelete ? (
                    // Inline confirmation
                    <div className="flex items-center gap-1.5 w-full" onClick={(e) => e.stopPropagation()}>
                      <span className="text-[10px] text-red-400 font-semibold flex-1 leading-tight">Delete document?</span>
                      <button
                        onClick={(e) => confirmDeleteDocument(d.id, e)}
                        className="px-2 py-0.5 rounded-md bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] font-bold hover:bg-red-500/30 cursor-pointer transition shrink-0"
                      >
                        Yes
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setPendingDeleteDoc(null); }}
                        className="px-2 py-0.5 rounded-md bg-neutral-800 border border-white/8 text-neutral-400 text-[10px] font-bold hover:bg-neutral-700 cursor-pointer transition shrink-0"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="mt-0.5 shrink-0">
                        {selected ? (
                          <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Square className="w-3.5 h-3.5 text-neutral-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[11px] font-semibold truncate ${selected ? "text-neutral-200" : ""}`}>
                          {d.filename}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px] text-neutral-600 font-medium">
                            {formatBytes(d.file_size)}
                          </span>
                          <span className="text-[9px] text-neutral-700">·</span>
                          <span className="text-[9px] text-neutral-600">
                            {relativeDate(d.created_at)}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => handleDeleteDocumentClick(d.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-neutral-600 hover:text-red-400 hover:bg-red-950/30 transition cursor-pointer shrink-0 mt-0.5"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}

                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── MAIN CHAT AREA ── */}
      <div className="relative z-10 flex-1 flex flex-col overflow-hidden bg-[#0a0a0f] w-full">
        {/* Chat header */}
        <div className="h-14 px-4 lg:px-6 flex items-center justify-between border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {/* Mobile sidebar toggle button */}
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="lg:hidden p-1.5 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-white/5 transition mr-1 cursor-pointer shrink-0"
              title="Chats"
            >
              <Menu className="w-4.5 h-4.5" />
            </button>

            <MessageSquare className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate text-neutral-200">
                {currentChat?.title ?? "Select a chat"}
              </p>
              <p className="text-[10px] text-neutral-500">
                {selectedDocIds.length > 0
                  ? `Scoped to ${selectedDocIds.length} document${selectedDocIds.length > 1 ? "s" : ""}`
                  : "All documents in context"}
              </p>
            </div>
          </div>

          {/* Mobile Document toggle button */}
          <button
            onClick={() => setIsMobileDocPanelOpen(true)}
            className="lg:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-white/8 bg-white/4 hover:bg-white/8 text-neutral-300 text-xs font-semibold transition cursor-pointer"
            title="Documents"
          >
            <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
            <span>Docs</span>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 scrollbar-hide">
          {!currentChatId ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-14 h-14 rounded-3xl bg-neutral-900 border border-white/8 flex items-center justify-center mb-4 shadow-xl">
                <Sparkles className="w-6 h-6 text-emerald-400" />
              </div>
              <h2 className="text-base font-bold text-neutral-200 mb-1.5">
                Welcome to PaperMind
              </h2>
              <p className="text-xs text-neutral-500 max-w-[300px] leading-relaxed">
                Upload your PDFs on the left, create a chat session, then ask questions — Gemini will answer with exact document citations.
              </p>
              <button
                onClick={handleCreateChat}
                className="mt-5 flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/25 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Create your first chat
              </button>
            </div>
          ) : chatLoading ? (
            <div className="flex justify-center items-center h-full">
              <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-12 h-12 rounded-2xl bg-neutral-900 border border-white/8 flex items-center justify-center mb-3">
                <FileText className="w-5 h-5 text-neutral-500" />
              </div>
              <p className="text-sm font-semibold text-neutral-400 mb-1">
                Start your research
              </p>
              <p className="text-xs text-neutral-600 max-w-[260px] leading-relaxed">
                Ask any question about your uploaded documents. Select specific documents to narrow the search context.
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-3 ${m.sender === "user" ? "flex-row-reverse" : "flex-row"}`}
              >
                {/* Avatar */}
                <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center mt-0.5 ${
                  m.sender === "user"
                    ? "bg-neutral-800 border border-white/10"
                    : "bg-gradient-to-br from-emerald-500 to-cyan-500 shadow-md shadow-emerald-500/20"
                }`}>
                  {m.sender === "user" ? (
                    <User className="w-3.5 h-3.5 text-neutral-400" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  )}
                </div>

                {/* Bubble */}
                <div className={`max-w-[75%] rounded-2xl px-4 py-3 border ${
                  m.sender === "user"
                    ? "bg-neutral-800/80 border-white/8 rounded-tr-sm"
                    : "bg-neutral-900/60 border-white/5 rounded-tl-sm"
                }`}>
                  {renderContent(m)}
                  {m.citations && m.citations.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3 pt-2.5 border-t border-white/5">
                      {m.citations.map((cit) => (
                        <button
                          key={cit.source_number}
                          onClick={() => setActiveCitation(cit)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold bg-neutral-800 border border-white/8 text-neutral-400 hover:text-emerald-400 hover:border-emerald-500/30 hover:bg-emerald-500/8 transition cursor-pointer"
                        >
                          <FileText className="w-2.5 h-2.5" />
                          [{cit.source_number}] {cit.filename.replace(/\.pdf$/i, "")}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {/* Thinking indicator */}
          {sendingMessage && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center mt-0.5 bg-gradient-to-br from-emerald-500 to-cyan-500 shadow-md shadow-emerald-500/20">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="bg-neutral-900/60 border border-white/5 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                <span className="text-xs text-neutral-500 font-medium">Analyzing sources</span>
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:0ms]" />
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:150ms]" />
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t border-white/5 shrink-0">
          <form onSubmit={handleSendMessage} className="flex items-center gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={!currentChatId || sendingMessage}
                placeholder={
                  !currentChatId
                    ? "Create a chat session to start…"
                    : "Ask anything about your documents…"
                }
                className="w-full bg-neutral-900/80 border border-white/8 rounded-2xl px-4 py-3 pr-4 text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all duration-200 disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={!inputText.trim() || !currentChatId || sendingMessage}
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:scale-100 disabled:shadow-none cursor-pointer shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* ── CITATION DRAWER ── */}
      {activeCitation && (
        <>
          {/* Mobile backdrop */}
          <div
            className="fixed inset-0 z-35 bg-black/60 lg:hidden animate-fade-in"
            onClick={() => setActiveCitation(null)}
          />
          <aside className="fixed inset-y-0 right-0 z-40 lg:z-20 flex flex-col w-80 max-w-full border-l border-white/5 bg-[#0a0a0f] lg:bg-black/40 lg:backdrop-blur-xl animate-slide-in shadow-2xl lg:shadow-none">
            {/* Header */}
            <div className="px-4 py-4 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                  <ChevronRight className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <span className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
                  Source [{activeCitation.source_number}]
                </span>
              </div>
              <button
                onClick={() => setActiveCitation(null)}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-200 hover:bg-white/5 transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
              {/* Document */}
              <div>
                <p className="text-[9px] text-neutral-500 font-bold uppercase tracking-widest mb-1.5">
                  Document
                </p>
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-neutral-900/80 border border-white/5">
                  <div className="w-8 h-8 rounded-lg bg-red-950/40 border border-red-900/30 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-red-400" />
                  </div>
                  <p className="text-xs font-semibold text-neutral-300 leading-tight break-all">
                    {activeCitation.filename}
                  </p>
                </div>
              </div>

              {/* Page number */}
              <div>
                <p className="text-[9px] text-neutral-500 font-bold uppercase tracking-widest mb-1.5">
                  Page
                </p>
                <div className="flex items-center justify-center h-12 rounded-xl bg-neutral-900/80 border border-white/5">
                  <span className="text-2xl font-black text-emerald-400">
                    {activeCitation.page_number}
                  </span>
                </div>
              </div>

              {/* Excerpt */}
              <div>
                <p className="text-[9px] text-neutral-500 font-bold uppercase tracking-widest mb-1.5">
                  Extracted Passage
                </p>
                <div className="p-3 rounded-xl bg-neutral-900/80 border border-white/5 border-l-2 border-l-emerald-500/50">
                  <p className="text-[11px] text-neutral-400 leading-relaxed italic">
                    &ldquo;{activeCitation.content}&rdquo;
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
