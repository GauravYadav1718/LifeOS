"use client";

/**
 * ChatInterface.tsx
 *
 * A self-contained panel that wires up to every relevant endpoint defined in
 * backend/main.py:
 *
 *  POST /api/chat          → SSE stream (pipeline / state / final / error events)
 *  GET  /api/user/:id      → load user profile on mount
 *  POST /api/onboard       → save/update profile inline
 *  GET  /health            → connection status badge
 *
 * Usage (drop into any page):
 *
 *  import ChatInterface from "@/components/ChatInterface";
 *  <ChatInterface userId="someUserId" />
 *
 * If you pass no userId the component will generate a guest UUID and prompt
 * the user to finish onboarding.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { streamAgentChat } from "@/services/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MessageRole = "user" | "assistant" | "system" | "error";

interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  /** when role === "system" this is the node label shown in the pipeline rail */
  node?: string;
}

interface PipelineLog {
  id: string;
  node: string;
  message: string;
  timestamp: string;
}

interface UserProfile {
  user_id: string;
  name: string;
  email?: string;
  degree?: string;
  year?: string;
  batch?: string;
  active_goals?: string[];
  goals?: string[];
}

type CommandDef = {
  label: string;
  description: string;
  command_type: string;
  icon: string;
  color: "mint" | "lavender" | "amber" | "rose";
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = "http://localhost:8000";

const QUICK_COMMANDS: CommandDef[] = [
  {
    label: "Auto-Schedule My Day",
    description: "Optimise your calendar blocks with AI.",
    command_type: "auto_schedule",
    icon: "📅",
    color: "mint",
  },
  {
    label: "Initiate Deep Work",
    description: "Block distractions and enter flow state.",
    command_type: "deep_work",
    icon: "💻",
    color: "lavender",
  },
  {
    label: "What Should I Study Today",
    description: "Instant personalised topic suggestions.",
    command_type: "study_today",
    icon: "📚",
    color: "mint",
  },
  {
    label: "Generate Study Plan",
    description: "Build a comprehensive weekly roadmap.",
    command_type: "study_plan",
    icon: "🎯",
    color: "amber",
  },
  {
    label: "Run Weekly AI Review",
    description: "Analyse your week and surface insights.",
    command_type: "weekly_review",
    icon: "📊",
    color: "rose",
  },
  {
    label: "Reflect & Journal",
    description: "Guided journaling with AI synthesis.",
    command_type: "reflect",
    icon: "🪞",
    color: "lavender",
  },
];

// Colour helpers (uses Tailwind arbitrary-value syntax so no purge issues)
const COLORS: Record<
  CommandDef["color"],
  { border: string; text: string; bg: string }
> = {
  mint: {
    border: "border-emerald-400/30",
    text: "text-emerald-300",
    bg: "hover:bg-emerald-500/10",
  },
  lavender: {
    border: "border-violet-400/30",
    text: "text-violet-300",
    bg: "hover:bg-violet-500/10",
  },
  amber: {
    border: "border-amber-400/30",
    text: "text-amber-300",
    bg: "hover:bg-amber-500/10",
  },
  rose: {
    border: "border-rose-400/30",
    text: "text-rose-300",
    bg: "hover:bg-rose-500/10",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function now() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Small animated status dot + label */
function StatusBadge({ online }: { online: boolean | null }) {
  if (online === null)
    return (
      <span className="flex items-center gap-1.5 text-xs text-white/30">
        <span className="w-1.5 h-1.5 rounded-full bg-white/20 animate-pulse" />
        Checking…
      </span>
    );
  return (
    <span
      className={`flex items-center gap-1.5 text-xs ${online ? "text-emerald-400" : "text-rose-400"}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${online ? "bg-emerald-400 animate-pulse" : "bg-rose-400"}`}
      />
      {online ? "Backend connected" : "Backend offline"}
    </span>
  );
}

/** Single chat bubble */
function Bubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  const isError = msg.role === "error";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap
          ${isUser
            ? "bg-white/10 text-white rounded-br-sm"
            : isError
            ? "bg-rose-500/20 border border-rose-500/30 text-rose-200 rounded-bl-sm"
            : "bg-white/5 border border-white/8 text-gray-200 rounded-bl-sm"
          }`}
      >
        {!isUser && (
          <span className="block text-[10px] text-white/30 mb-1 font-medium uppercase tracking-wider">
            {msg.node ?? "LifeOS"}
          </span>
        )}
        {msg.content}
        <span className="block text-[10px] text-white/20 mt-1 text-right">
          {msg.timestamp}
        </span>
      </div>
    </motion.div>
  );
}

/** One pipeline log row */
function PipelineRow({ log }: { log: PipelineLog }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 350, damping: 25 }}
      className="flex gap-2 items-start"
    >
      <span className="mt-1 w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center">
          <span className="text-[11px] font-semibold text-violet-300 truncate">
            {log.node}
          </span>
          <span className="text-[10px] text-white/25 shrink-0 ml-2">
            {log.timestamp}
          </span>
        </div>
        <p className="text-[12px] text-white/60 leading-snug mt-0.5 break-words">
          {log.message}
        </p>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ChatInterfaceProps {
  userId?: string;
  /** Optional callback fired when a weekly_review response is received */
  onWeeklyReview?: (data: object) => void;
}

export default function ChatInterface({
  userId: propUserId,
  onWeeklyReview,
}: ChatInterfaceProps) {
  // ── State ────────────────────────────────────────────────────────────────
  const [userId, setUserId] = useState<string>(propUserId ?? uid());
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pipelineLogs, setPipelineLogs] = useState<PipelineLog[]>([]);
  const [focusProgress, setFocusProgress] = useState<number>(0);
  const [intent, setIntent] = useState<string>("");

  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeCommand, setActiveCommand] = useState<string | null>(null);

  // panel visibility (mobile-friendly)
  const [showPipeline, setShowPipeline] = useState(false);
  const [showCommands, setShowCommands] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Derived ──────────────────────────────────────────────────────────────

  const pushMessage = useCallback((partial: Omit<ChatMessage, "id" | "timestamp">) => {
    setMessages((prev) => [
      ...prev,
      { ...partial, id: uid(), timestamp: now() },
    ]);
  }, []);

  const pushPipelineLog = useCallback((node: string, message: string) => {
    setPipelineLogs((prev) => [
      ...prev,
      { id: uid(), node, message, timestamp: now() },
    ]);
  }, []);

  // ── Effects ──────────────────────────────────────────────────────────────

  // Health check
  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then((r) => setBackendOnline(r.ok))
      .catch(() => setBackendOnline(false));
  }, []);

  // Load user profile
  useEffect(() => {
    if (!userId) return;
    fetch(`${API_BASE}/api/user/${encodeURIComponent(userId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: UserProfile | null) => {
        if (data) {
          setProfile(data);
          pushMessage({
            role: "system",
            content: `Welcome back, ${data.name}! Your LifeOS agent is ready. Select a quick command or type a message below.`,
            node: "System",
          });
        } else {
          pushMessage({
            role: "system",
            content:
              "No profile found. Please complete onboarding or send a message to get started.",
            node: "System",
          });
        }
      })
      .catch(() => {
        pushMessage({
          role: "system",
          content:
            "Backend unreachable. Check that the FastAPI server is running on port 8000.",
          node: "System",
        });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Stream handler ────────────────────────────────────────────────────────

  const startStream = useCallback(
    async (message: string, commandType: string) => {
      if (isStreaming) return;
      setIsStreaming(true);
      setActiveCommand(commandType || null);
      setShowPipeline(true); // open pipeline panel automatically

      await streamAgentChat(userId, message, commandType, {
        onPipelineLog: (node, msg) => {
          pushPipelineLog(node, msg);
        },
        onStateUpdate: (focus, intentStr) => {
          if (focus > 0) setFocusProgress(Math.round(focus * 100));
          if (intentStr) setIntent(intentStr);
        },
        onFinalResponse: (finalMsg, summary) => {
          // weekly_review arrives as raw JSON string
          if (commandType === "weekly_review") {
            try {
              const parsed = JSON.parse(finalMsg);
              onWeeklyReview?.(parsed);
              pushMessage({
                role: "assistant",
                content: `Weekly Review ready. ${summary || "Check the review panel for detailed insights."}`,
                node: "WeeklyReview",
              });
            } catch {
              pushMessage({
                role: "assistant",
                content: finalMsg,
                node: "WeeklyReview",
              });
            }
          } else {
            pushMessage({
              role: "assistant",
              content: finalMsg,
              node: "LifeOS",
            });
            if (summary) {
              pushMessage({
                role: "system",
                content: `Reflection: ${summary}`,
                node: "Reflection",
              });
            }
          }
        },
        onError: (err) => {
          pushMessage({ role: "error", content: `Error: ${err}` });
          pushPipelineLog("Error", err);
        },
        onDone: () => {
          setIsStreaming(false);
          setActiveCommand(null);
        },
      });
    },
    [isStreaming, userId, pushMessage, pushPipelineLog, onWeeklyReview]
  );

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSend = () => {
    const text = inputText.trim();
    if (!text || isStreaming) return;
    pushMessage({ role: "user", content: text });
    setInputText("");
    startStream(text, "");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCommand = (cmd: CommandDef) => {
    if (isStreaming) return;
    pushMessage({ role: "user", content: cmd.label });
    startStream(cmd.label, cmd.command_type);
    setShowCommands(false);
  };

  const clearLogs = () => setPipelineLogs([]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full w-full bg-black/40 backdrop-blur-2xl rounded-3xl border border-white/8 overflow-hidden text-white">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-3">
          {/* Gem icon */}
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-400 to-violet-400 opacity-85 flex items-center justify-center text-sm font-bold text-black select-none">
            L
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              {profile?.name ?? "LifeOS Agent"}
            </h2>
            <StatusBadge online={backendOnline} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Focus progress pill */}
          {focusProgress > 0 && (
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1">
              <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-violet-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(focusProgress, 100)}%` }}
                  transition={{ duration: 0.6 }}
                />
              </div>
              <span className="text-[11px] text-white/50">{focusProgress}%</span>
            </div>
          )}

          {/* Toggle buttons */}
          <button
            onClick={() => setShowCommands((v) => !v)}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors
              ${showCommands
                ? "bg-white/10 border-white/20 text-white"
                : "border-white/10 text-white/40 hover:text-white hover:border-white/20"}`}
          >
            ⚡ Commands
          </button>
          <button
            onClick={() => setShowPipeline((v) => !v)}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors
              ${showPipeline
                ? "bg-violet-500/20 border-violet-400/30 text-violet-300"
                : "border-white/10 text-white/40 hover:text-white hover:border-white/20"}`}
          >
            🧠 Pipeline
          </button>
        </div>
      </div>

      {/* ── Body: Chat + (optional) Pipeline rail ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Main chat column ── */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

          {/* Quick commands strip */}
          <AnimatePresence>
            {showCommands && (
              <motion.div
                key="commands"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 28 }}
                className="overflow-hidden shrink-0"
              >
                <div className="px-4 py-3 border-b border-white/6">
                  <p className="text-[10px] text-white/30 uppercase tracking-widest mb-2 font-medium">
                    Quick Commands
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_COMMANDS.map((cmd) => {
                      const c = COLORS[cmd.color];
                      return (
                        <button
                          key={cmd.command_type}
                          onClick={() => handleCommand(cmd)}
                          disabled={isStreaming}
                          title={cmd.description}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs transition-all
                            ${c.border} ${c.text} ${c.bg}
                            bg-black/20 backdrop-blur-sm
                            disabled:opacity-40 disabled:cursor-not-allowed
                            ${activeCommand === cmd.command_type ? "ring-1 ring-white/20 animate-pulse" : ""}`}
                        >
                          <span>{cmd.icon}</span>
                          {cmd.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Intent badge */}
          <AnimatePresence>
            {intent && (
              <motion.div
                key="intent"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="px-4 pt-2 shrink-0"
              >
                <span className="inline-block text-[10px] bg-amber-400/10 border border-amber-400/20 text-amber-300 px-2.5 py-0.5 rounded-full">
                  Intent detected: {intent}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Message list */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <Bubble key={m.id} msg={m} />
              ))}
            </AnimatePresence>

            {/* Typing / streaming indicator */}
            <AnimatePresence>
              {isStreaming && (
                <motion.div
                  key="typing"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex justify-start"
                >
                  <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-white/5 border border-white/8 flex items-center gap-1.5">
                    {[0, 0.15, 0.3].map((delay, i) => (
                      <motion.span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                        animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
                        transition={{
                          repeat: Infinity,
                          duration: 0.8,
                          delay,
                          ease: "easeInOut",
                        }}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={messagesEndRef} />
          </div>

          {/* ── Input bar ── */}
          <div className="px-4 py-3 border-t border-white/8 shrink-0">
            <div className="flex items-end gap-2 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 focus-within:border-emerald-400/30 transition-colors">
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isStreaming}
                rows={1}
                placeholder={
                  isStreaming
                    ? "Agent is thinking…"
                    : "Message LifeOS or press a command above…"
                }
                className="flex-1 bg-transparent resize-none outline-none text-sm text-white placeholder:text-white/25 max-h-32 min-h-[1.25rem] leading-5 disabled:cursor-not-allowed"
              />
              <motion.button
                onClick={handleSend}
                disabled={isStreaming || !inputText.trim()}
                whileTap={{ scale: 0.9 }}
                className="shrink-0 w-8 h-8 rounded-xl bg-emerald-400 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-emerald-300 transition-colors"
              >
                {/* Send arrow */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-4 h-4 text-black"
                >
                  <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                </svg>
              </motion.button>
            </div>
            <p className="text-[10px] text-white/20 mt-1.5 text-center">
              Press <kbd className="font-mono">Enter</kbd> to send ·{" "}
              <kbd className="font-mono">Shift+Enter</kbd> for newline
            </p>
          </div>
        </div>

        {/* ── Pipeline rail ── */}
        <AnimatePresence>
          {showPipeline && (
            <motion.div
              key="pipeline"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 260, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 28 }}
              className="shrink-0 border-l border-white/8 overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
                <h3 className="text-[10px] font-semibold uppercase tracking-widest text-violet-300 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                  Thinking Pipeline
                </h3>
                <button
                  onClick={clearLogs}
                  className="text-[10px] text-white/25 hover:text-white/60 transition-colors"
                >
                  Clear
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                <AnimatePresence initial={false}>
                  {pipelineLogs.length === 0 ? (
                    <motion.p
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-[11px] text-white/20 text-center mt-8"
                    >
                      Agent steps will appear here
                    </motion.p>
                  ) : (
                    pipelineLogs.map((log) => (
                      <PipelineRow key={log.id} log={log} />
                    ))
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
