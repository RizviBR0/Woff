"use client";
import {
  useMotionValueEvent,
  useScroll,
  useTransform,
  motion,
} from "framer-motion";
import React, { useEffect, useRef, useState } from "react";

interface TimelineEntry {
  title: string;
  content: React.ReactNode;
}

export const Timeline = ({ data }: { data: TimelineEntry[] }) => {
  const ref = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setHeight(rect.height);
    }
  }, [ref]);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 10%", "end 50%"],
  });

  const heightTransform = useTransform(scrollYProgress, [0, 1], [0, height]);
  const opacityTransform = useTransform(scrollYProgress, [0, 0.1], [0, 1]);

  return (
    <div
      className="w-full font-sans md:px-10"
      ref={containerRef}
    >
      {/* Header */}
      <div className="max-w-7xl mx-auto py-20 px-4 md:px-8 lg:px-10">
        <div className="text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-[#ff5a00]/30 bg-[#ff5a00]/8 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-[#ff5a00] dark:text-[#ff7d3b] shadow-[0_0_15px_rgba(255,90,0,0.06)] dark:shadow-[0_0_20px_rgba(255,90,0,0.1)] backdrop-blur-md mx-auto mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-[#ff5a00] animate-pulse" />
            HOW IT WORKS
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight tracking-[-0.04em] text-zinc-900 dark:text-white mb-4">
            Get Started in{" "}
            <span className="bg-gradient-to-r from-[#ff7d3b] via-[#ff5a00] to-[#ff3600] bg-clip-text text-transparent">
              Three
            </span>
            <br />
            Simple Steps
          </h2>
          <p className="text-zinc-500 dark:text-white/55 text-sm md:text-base max-w-lg mx-auto">
            No sign-ups, no complexity. Just 3 simple steps to start sharing.
          </p>
        </div>
      </div>

      {/* Timeline */}
      <div ref={ref} className="relative max-w-7xl mx-auto pb-20">
        {data.map((item, index) => (
          <div
            key={index}
            className="flex justify-start pt-10 md:pt-40 md:gap-10"
          >
            {/* Sticky left column with node circle containing step number */}
            <div className="sticky flex z-40 items-center top-40 self-start w-12 md:w-16">
              <div className="h-12 w-12 absolute left-2 md:left-2 rounded-full bg-zinc-50 dark:bg-[#121215] border-2 border-zinc-200 dark:border-[#ff5a00]/40 shadow-[0_0_20px_rgba(255,90,0,0.15)] flex items-center justify-center font-extrabold text-lg text-zinc-900 dark:text-white transition-all duration-300 group-hover:border-[#ff5a00] group-hover:shadow-[0_0_25px_rgba(255,90,0,0.3)]">
                {item.title}
              </div>
            </div>

            {/* Content */}
            <div className="relative pl-20 pr-4 md:pl-4 w-full">
              {item.content}
            </div>
          </div>
        ))}

        {/* Animated line */}
        <div
          style={{
            height: height + "px",
          }}
          className="absolute md:left-8 left-8 top-0 overflow-hidden w-[2px] bg-[linear-gradient(to_bottom,var(--tw-gradient-stops))] from-transparent from-[0%] via-zinc-200 dark:via-zinc-700 to-transparent to-[99%] [mask-image:linear-gradient(to_bottom,transparent_0%,black_10%,black_90%,transparent_100%)]"
        >
          <motion.div
            style={{
              height: heightTransform,
              opacity: opacityTransform,
            }}
            className="absolute inset-x-0 top-0 w-[2px] bg-gradient-to-t from-[#ff5a00] via-[#ff7d3b] to-transparent from-[0%] via-[10%] rounded-full"
          />
        </div>
      </div>
    </div>
  );
};
