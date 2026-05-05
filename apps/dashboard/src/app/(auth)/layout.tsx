'use client';

import { motion } from 'framer-motion';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex">
      {/* Branding Panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary via-primary/90 to-primary/80">
        {/* Animated gradient overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.1)_0%,_transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(255,255,255,0.05)_0%,_transparent_50%)]" />

        {/* Floating shapes */}
        <motion.div
          animate={{ y: [-10, 10, -10], rotate: [0, 5, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[20%] left-[15%] h-32 w-32 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm"
        />
        <motion.div
          animate={{ y: [10, -10, 10], rotate: [0, -3, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[55%] right-[20%] h-24 w-24 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm"
        />
        <motion.div
          animate={{ y: [5, -15, 5], x: [-5, 5, -5] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-[20%] left-[30%] h-16 w-16 rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm"
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-16">
          <div className="animate-fade-in">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm mb-8">
              <span className="text-xl font-bold text-white">S</span>
            </div>
            <h1 className="text-3xl xl:text-4xl font-bold text-white tracking-tight mb-4">
              Smart Property Manager
            </h1>
            <p className="text-lg text-white/70 max-w-md leading-relaxed">
              The all-in-one platform for property professionals. Manage listings, track leads, and grow your business.
            </p>
          </div>
        </div>
      </div>

      {/* Form Panel */}
      <div className="flex-1 flex items-center justify-center bg-background p-4 lg:p-8">
        <div className="w-full max-w-md animate-fade-in">
          {children}
        </div>
      </div>
    </div>
  );
}
