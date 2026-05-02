"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Send } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import FocusRing from "@/components/FocusRing";
import AgentGem from "@/components/AgentGem";
import { useRouter } from "next/navigation";
import { streamAgentChat } from "@/services/api";

import WeeklyReviewModal from "@/components/WeeklyReviewModal";
import ClassroomModal from "@/components/ClassroomModal";
import FocusModal from "@/components/FocusModal";

export default function Home() {
  const router = useRouter();
  const [isThinking, setIsThinking] = useState(false);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Hardcoded for demo
  const [focusProgress, setFocusProgress] = useState(30);

  const [logs, setLogs] = useState([
    {
      id: "1",
      agent: "System",
      message: "LifeOS initialized. Standing by.",
      timestamp: "", // Hydrated below
      status: "completed" as const
    }
  ]);

  // Modal states
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isReviewLoading, setIsReviewLoading] = useState(false);
  const [reviewData, setReviewData] = useState(null);

  // Classroom Modal states
  const [isClassroomOpen, setIsClassroomOpen] = useState(false);
  const [isClassroomLoading, setIsClassroomLoading] = useState(false);
  const [classroomData, setClassroomData] = useState<any[]>([]);

  // Focus Modal states
  const [isFocusOpen, setIsFocusOpen] = useState(false);
  const [isFocusActive, setIsFocusActive] = useState(false);
  const [focusEndTime, setFocusEndTime] = useState<string | null>(null);

  // Handle Hydration mismatch for timestamps
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    setLogs(prev => [{ ...prev[0], timestamp: new Date().toLocaleTimeString() }]);
    checkUser();

    // Check if focus session is active
    fetch("http://localhost:8000/api/focus/status")
      .then(res => res.json())
      .then(data => {
        if (data.active) {
          setIsFocusActive(true);
          setFocusEndTime(data.end_time);
        }
      })
      .catch(console.error);
  }, []);

  const checkUser = async () => {
    const storedId = localStorage.getItem("lifeos_user_id");
    if (!storedId) {
      router.push("/login");
      return;
    }
    setUserId(storedId);
    try {
      const res = await fetch(`http://localhost:8000/api/user/${encodeURIComponent(storedId)}`);
      if (res.status === 404) {
        // Stale session — clear it and force re-login
        localStorage.removeItem("lifeos_user_id");
        localStorage.removeItem("lifeos_user_email");
        localStorage.removeItem("lifeos_user_name");
        router.push("/login");
      }
    } catch (err) {
      console.warn("Backend might be down or not connecting.", err);
    } finally {
      setIsAppLoading(false);
    }
  };

  const addLog = (agent: string, message: string) => {
    setLogs(prev => [...prev, {
      id: Date.now().toString() + Math.random(),
      agent,
      message,
      timestamp: new Date().toLocaleTimeString(),
      status: "completed"
    }]);
  };

  const handleCommand = async (commandType: string, label: string) => {
    if (isThinking) return;

    setIsThinking(true);
    addLog("User", `Triggered Action: ${label}`);

    if (commandType === "weekly_review") {
      setIsReviewOpen(true);
      setIsReviewLoading(true);
      setReviewData(null);
    }

    try {
      addLog("System", "Connecting to Agent Swarm...");
      const activeUserId = userId ?? localStorage.getItem("lifeos_user_id") ?? "guest";

      await streamAgentChat(activeUserId, label, commandType, {
        onPipelineLog: (node, message) => {
          addLog(node, message);
        },
        onStateUpdate: (focus, intent) => {
          if (focus > 0) setFocusProgress(focus);
        },
        onFinalResponse: (message, summary) => {
          if (commandType === "weekly_review") {
            try {
              const parsedJSON = JSON.parse(message);
              setReviewData(parsedJSON);
            } catch (e) {
              console.error("Failed to parse review JSON:", message);
            }
            setIsReviewLoading(false);
            addLog("System", `Weekly AI Review generated and displayed.`);
          } else {
            addLog("System", `Final Output: ${message}`);
          }
        },
        onError: (error) => {
          console.error(error);
          addLog("System_Error", error);
          if (commandType === "weekly_review") setIsReviewLoading(false);
        },
        onDone: () => {
          setIsThinking(false);
        }
      });

    } catch (error) {
      console.error(error);
      addLog("System_Error", "Failed to connect to backend engine.");
      setIsThinking(false);
      if (commandType === "weekly_review") setIsReviewLoading(false);
    }
  };

  const handleStartFocus = async (duration: number, apps: string[]) => {
    try {
      const res = await fetch("http://localhost:8000/api/focus/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duration_minutes: duration, blocked_apps: apps })
      });
      const data = await res.json();
      setIsFocusActive(true);
      setFocusEndTime(data.end_time);
      setIsFocusOpen(false); // Close setup modal
      addLog("System", `Deep Work Shield activated for ${duration} minutes. Blocked apps: ${apps.join(', ')}`);
    } catch (e) {
      console.error("Failed to start focus", e);
    }
  };

  const handleStopFocus = async () => {
    try {
      await fetch("http://localhost:8000/api/focus/stop", { method: "POST" });
      setIsFocusActive(false);
      setFocusEndTime(null);
      setIsFocusOpen(false);
      addLog("System", "Deep Work Shield deactivated early.");
    } catch (e) {
      console.error("Failed to stop focus", e);
    }
  };

  const openClassroomAuthPopup = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const clientId = process.env.NEXT_PUBLIC_CLASSROOM_CLIENT_ID?.trim();
      if (!clientId) {
        reject(new Error("Classroom Client ID not set in .env.local"));
        return;
      }

      const redirectUri = `${window.location.origin}/auth/callback`;
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "token", 
        scope: "https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.coursework.me.readonly",
        prompt: "consent",
      });
      
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
      
      const popup = window.open(
        authUrl,
        "classroom-auth",
        `width=500,height=600,left=${Math.round(window.screenX + (window.outerWidth - 500) / 2)},top=${Math.round(window.screenY + (window.outerHeight - 600) / 2.5)},toolbar=no,menubar=no`
      );

      if (!popup) {
        reject(new Error("Popup blocked. Please allow popups."));
        return;
      }

      const handler = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (!event.data?.type?.startsWith("GOOGLE_AUTH")) return;

        window.removeEventListener("message", handler);
        
        if (event.data.type === "GOOGLE_AUTH_ERROR") {
          reject(new Error(event.data.error || "Classroom auth cancelled"));
          return;
        }

        if (event.data.accessToken) {
          resolve(event.data.accessToken);
        } else {
          reject(new Error("No access token received"));
        }
      };

      window.addEventListener("message", handler);
      
      const pollClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(pollClosed);
          window.removeEventListener("message", handler);
          reject(new Error("Auth window closed"));
        }
      }, 500);
    });
  };

  const handleSyncClassroom = async () => {
    if (isThinking) return;
    setIsClassroomOpen(true);
    setIsClassroomLoading(true);
    setClassroomData([]);
    
    addLog("System", "Fetching Google Classroom data...");
    
    try {
      const activeUserId = userId ?? localStorage.getItem("lifeos_user_id") ?? "guest";
      
      const fetchCourses = async () => {
        const res = await fetch(`http://localhost:8000/api/classroom/${encodeURIComponent(activeUserId)}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw { status: res.status, message: err.detail ?? "Failed to fetch classroom data" };
        }
        return res.json();
      };
      
      let data;
      try {
        data = await fetchCourses();
      } catch (err: any) {
        if (err.status === 400 && err.message.includes("access token not found")) {
          addLog("System", "Classroom token missing. Opening Google auth popup...");
          const token = await openClassroomAuthPopup();
          
          await fetch(`http://localhost:8000/api/classroom/${encodeURIComponent(activeUserId)}/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ access_token: token })
          });
          
          addLog("System", "Token acquired. Fetching data...");
          data = await fetchCourses();
        } else {
          throw err;
        }
      }
      
      setClassroomData(data.courses || []);
      addLog("System", `Successfully fetched ${data.courses?.length || 0} active courses.`);
    } catch (error: any) {
      console.error(error);
      addLog("System_Error", error.message || "Failed to fetch Google Classroom data");
    } finally {
      setIsClassroomLoading(false);
    }
  };


  const sidebarContent = (
    <div className="flex flex-col items-center gap-12 pt-8">
      <FocusRing progress={focusProgress} label="Daily Goal: 3 C++ Questions" />

      <div className="w-full space-y-4">
        <h3 className="text-sm font-semibold tracking-widest text-silver uppercase mb-4">
          Today's Schedule
        </h3>
        <div className="p-4 rounded-xl bg-black/40 border border-white/5">
          <div className="flex justify-between items-center mb-1">
            <span className="text-mint font-medium text-sm">09:00 AM</span>
            <span className="text-xs text-silver bg-white/10 px-2 py-0.5 rounded-full">Required</span>
          </div>
          <p className="text-sm text-gray-300">Operations Research</p>
          <p className="text-xs text-silver mt-1">Prof. Amita Bhagat</p>
        </div>

        <div className="p-4 rounded-xl bg-black/40 border border-white/5 opacity-50">
          <div className="flex items-center mb-1">
            <span className="text-silver font-medium text-sm">11:00 AM</span>
          </div>
          <p className="text-sm text-gray-400">Deep Work: Coding</p>
        </div>
      </div>
    </div>
  );

  const centralArea = (
    <>
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[300px]">
        <div className={`transition-all duration-1000 ${isThinking ? 'scale-110' : 'scale-100'}`}>
          <AgentGem />
        </div>

        <div className="mt-12 max-w-md">
          <motion.h2
            className="text-2xl font-medium tracking-tight mb-2"
            animate={{ opacity: isThinking ? 0.5 : 1 }}
          >
            {isThinking ? "Synthesizing..." : "Command Center"}
          </motion.h2>
          <p className="text-silver text-sm">
            Select an AI workflow to execute.
          </p>
        </div>
      </div>

      <div className="w-full max-w-3xl px-8 pb-8">
        <div className="grid grid-cols-2 gap-4">
          <button
            disabled={isThinking}
            onClick={() => handleCommand("auto_schedule", "Auto-Schedule My Day")}
            className="p-4 rounded-2xl bg-black/30 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-all text-left disabled:opacity-50 group hover:border-mint/30"
          >
            <div className="text-2xl mb-2">📅</div>
            <div className="font-medium text-white">Auto-Schedule My Day</div>
            <div className="text-xs text-silver mt-1">Optimize your calendar blocks.</div>
          </button>

          <button
            disabled={isThinking}
            onClick={() => setIsFocusOpen(true)}
            className="p-4 rounded-2xl bg-black/30 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-all text-left disabled:opacity-50 group hover:border-mint/30"
          >
            <div className="text-2xl mb-2">💻</div>
            <div className="font-medium text-white">Initiate Deep Work</div>
            <div className="text-xs text-silver mt-1">Block distractions and focus.</div>
          </button>

          <button
            disabled={isThinking}
            onClick={() => handleCommand("weekly_review", "Run Weekly AI Review")}
            className="p-4 rounded-2xl bg-black/30 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-all text-left disabled:opacity-50 group hover:border-lavender/30 col-span-2 sm:col-span-1"
          >
            <div className="text-2xl mb-2">📊</div>
            <div className="font-medium text-white">Run Weekly AI Review</div>
            <div className="text-xs text-silver mt-1">Analyze health and generate insights.</div>
          </button>

          <button
            disabled={isThinking}
            onClick={() => handleCommand("study_today", "What Should I Study Today")}
            className="p-4 rounded-2xl bg-black/30 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-all text-left disabled:opacity-50 group hover:border-mint/30"
          >
            <div className="text-2xl mb-2">📚</div>
            <div className="font-medium text-white">What Should I Study Today</div>
            <div className="text-xs text-silver mt-1">Get immediate topic suggestions.</div>
          </button>

          <button
            disabled={isThinking}
            onClick={() => handleCommand("study_plan", "Generate Study Plan")}
            className="p-4 rounded-2xl bg-black/30 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-all text-left disabled:opacity-50 group hover:border-mint/30 col-span-2 sm:col-span-1"
          >
            <div className="text-2xl mb-2">🎯</div>
            <div className="font-medium text-white">Generate Study Plan</div>
            <div className="text-xs text-silver mt-1">Map out a comprehensive roadmap.</div>
          </button>

          <button
            disabled={isThinking}
            onClick={handleSyncClassroom}
            className="p-4 rounded-2xl bg-black/30 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-all text-left disabled:opacity-50 group hover:border-mint/30 col-span-2 sm:col-span-1"
          >
            <div className="text-2xl mb-2">🎓</div>
            <div className="font-medium text-white">Sync Google Classroom</div>
            <div className="text-xs text-silver mt-1">Fetch your active courses and assignments.</div>
          </button>
        </div>
      </div>
    </>
  );

  if (!mounted) return null;

  if (isAppLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-mint">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-8 h-8 flex border-2 border-mint/20 border-t-mint rounded-full" />
      </div>
    );
  }

  return (
    <>
      <DashboardLayout
        sidebarContent={sidebarContent}
        centralArea={centralArea}
        logs={logs}
      />
      <WeeklyReviewModal
        isOpen={isReviewOpen}
        onClose={() => setIsReviewOpen(false)}
        isLoading={isReviewLoading}
        data={reviewData}
      />
      <ClassroomModal
        isOpen={isClassroomOpen}
        onClose={() => setIsClassroomOpen(false)}
        isLoading={isClassroomLoading}
        courses={classroomData}
      />
      <FocusModal
        isOpen={isFocusOpen}
        onClose={() => setIsFocusOpen(false)}
        onStart={handleStartFocus}
        onStop={handleStopFocus}
        active={isFocusActive}
        endTime={focusEndTime}
      />
    </>
  );
}
