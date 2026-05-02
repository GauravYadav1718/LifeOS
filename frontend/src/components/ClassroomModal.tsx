import React from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ClassroomModalProps {
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  courses: any[];
}

export default function ClassroomModal({ isOpen, onClose, isLoading, courses }: ClassroomModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col bg-[#0f0f0f] border border-white/10 rounded-2xl shadow-2xl relative"
        >
          {/* Header */}
          <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#141414]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#ADFFA6] to-[#B0A8FE] flex items-center justify-center text-xl shadow-[0_0_20px_rgba(173,255,166,0.15)]">
                🎓
              </div>
              <div>
                <h2 className="text-xl font-medium tracking-tight text-white">Google Classroom</h2>
                <p className="text-xs text-[#838179] mt-0.5">Active Courses Sync</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-[#838179] hover:text-white transition-colors p-2 rounded-lg hover:bg-white/5"
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto flex-1">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-48 space-y-4">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-8 h-8 border-2 border-[#ADFFA6]/20 border-t-[#ADFFA6] rounded-full"
                />
                <p className="text-sm text-[#838179]">Fetching data from Google Classroom...</p>
              </div>
            ) : courses.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {courses.map((course) => (
                  <div
                    key={course.id}
                    className="p-5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors flex flex-col"
                  >
                    <h3 className="text-white font-medium mb-1 truncate" title={course.name}>
                      {course.name}
                    </h3>
                    <p className="text-sm text-[#838179] mb-4 truncate" title={course.section}>
                      {course.section || "No section specified"}
                    </p>
                    <div className="mt-auto flex justify-between items-center text-xs">
                      <span className="bg-[#B0A8FE]/10 text-[#B0A8FE] px-2 py-1 rounded-md font-medium">
                        {course.courseState}
                      </span>
                      {course.alternateLink && (
                        <a
                          href={course.alternateLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#ADFFA6] hover:underline"
                        >
                          View in Classroom ↗
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 space-y-3">
                <div className="text-4xl">📭</div>
                <p className="text-white font-medium">No active courses found.</p>
                <p className="text-sm text-[#838179]">Make sure you have active classes in Google Classroom.</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
