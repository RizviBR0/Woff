"use client";

import React from "react";
import Image from "next/image";
import { Timeline } from "@/components/ui/timeline";
import { ArrowDownToLine, FileText, Laptop } from "lucide-react";

export default function TimelineDemo() {
  const data = [
    {
      title: "1",
      content: (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center w-full">
          {/* Step Copy */}
          <div className="lg:col-span-5 flex flex-col justify-center">
            {/* Step Badge */}
            <div className="inline-flex items-center self-start gap-2 rounded-full border border-[#ff5a00]/30 bg-[#ff5a00]/8 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-[#ff5a00] dark:text-[#ff7d3b] shadow-[0_0_15px_rgba(255,90,0,0.06)] dark:shadow-[0_0_20px_rgba(255,90,0,0.1)] backdrop-blur-md mb-4">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ff5a00] animate-pulse" />
              Step 1
            </div>

            <h3 className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-zinc-900 dark:text-white mb-4 tracking-tight">
              Add your files
            </h3>
            <p className="text-sm md:text-base text-zinc-500 dark:text-white/55 leading-relaxed">
              Start a sharing room in one click, then choose or drop the files you want to send. No sign-up required.
            </p>
          </div>

          {/* Step Image */}
          <div className="lg:col-span-7 relative group w-full max-w-lg lg:max-w-xl mx-auto">
            {/* Ambient orange glow behind the card */}
            <div className="absolute -inset-2 rounded-[24px] bg-gradient-to-tr from-[#ff5a00]/10 to-[#ff7d3b]/5 opacity-80 blur-xl group-hover:opacity-100 transition-opacity duration-500" />
            
            {/* Main Premium Card Container */}
            <div className="relative overflow-hidden rounded-[20px] border border-zinc-200/80 dark:border-zinc-800/80 bg-white/80 dark:bg-[#121215]/90 p-3 shadow-xl backdrop-blur-md">
              {/* Internal decorative gradient */}
              <div className="absolute top-0 left-0 w-40 h-40 rounded-full bg-[#ff5a00]/10 blur-[50px] pointer-events-none" />
              
              {/* Screenshot Wrapper with Browser Frame look */}
              <div className="relative rounded-[14px] overflow-hidden border border-zinc-200/50 dark:border-zinc-800/50 bg-zinc-50 dark:bg-[#09090b]">
                <Image
                  src="/process2.png"
                  alt="Add files to a Woff sharing room"
                  width={600}
                  height={400}
                  className="w-full h-auto object-cover transform hover:scale-[1.02] transition-transform duration-500"
                />
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "2",
      content: (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center w-full">
          {/* Step Copy */}
          <div className="lg:col-span-5 flex flex-col justify-center">
            {/* Step Badge */}
            <div className="inline-flex items-center self-start gap-2 rounded-full border border-[#ff5a00]/30 bg-[#ff5a00]/8 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-[#ff5a00] dark:text-[#ff7d3b] shadow-[0_0_15px_rgba(255,90,0,0.06)] dark:shadow-[0_0_20px_rgba(255,90,0,0.1)] backdrop-blur-md mb-4">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ff5a00] animate-pulse" />
              Step 2
            </div>

            <h3 className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-zinc-900 dark:text-white mb-4 tracking-tight">
              Share the link or code
            </h3>
            <p className="text-sm md:text-base text-zinc-500 dark:text-white/55 leading-relaxed">
              Send the link or room code to another person or device. They can also scan the QR code to open the sharing space.
            </p>
          </div>

          {/* Step Image */}
          <div className="lg:col-span-7 relative group w-full max-w-lg lg:max-w-xl mx-auto">
            {/* Ambient orange glow behind the card */}
            <div className="absolute -inset-2 rounded-[24px] bg-gradient-to-tl from-[#ff5a00]/10 to-[#ff7d3b]/5 opacity-80 blur-xl group-hover:opacity-100 transition-opacity duration-500" />
            
            {/* Main Premium Card Container */}
            <div className="relative overflow-hidden rounded-[20px] border border-zinc-200/80 dark:border-zinc-800/80 bg-white/80 dark:bg-[#121215]/90 p-3 shadow-xl backdrop-blur-md">
              {/* Internal decorative gradient */}
              <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-[#ff7d3b]/10 blur-[50px] pointer-events-none" />
              
              {/* Screenshot Wrapper */}
              <div className="relative rounded-[14px] overflow-hidden border border-zinc-200/50 dark:border-zinc-800/50 bg-zinc-50 dark:bg-[#09090b]">
                <Image
                  src="/process3.png"
                  alt="Share a Woff room using its link, room code, or QR code"
                  width={600}
                  height={400}
                  className="w-full h-auto object-cover transform hover:scale-[1.02] transition-transform duration-500"
                />
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "3",
      content: (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center w-full">
          {/* Step Copy */}
          <div className="lg:col-span-5 flex flex-col justify-center">
            {/* Step Badge */}
            <div className="inline-flex items-center self-start gap-2 rounded-full border border-[#ff5a00]/30 bg-[#ff5a00]/8 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-[#ff5a00] dark:text-[#ff7d3b] shadow-[0_0_15px_rgba(255,90,0,0.06)] dark:shadow-[0_0_20px_rgba(255,90,0,0.1)] backdrop-blur-md mb-4">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ff5a00] animate-pulse" />
              Step 3
            </div>

            <h3 className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-zinc-900 dark:text-white mb-4 tracking-tight">
              Download and keep
            </h3>
            <p className="text-sm md:text-base text-zinc-500 dark:text-white/55 leading-relaxed">
              The recipient downloads the files to their device. Keep your originals and download anything you need before it expires.
            </p>
          </div>

          {/* Step Image */}
          <div className="lg:col-span-7 relative group w-full max-w-lg lg:max-w-xl mx-auto">
            {/* Ambient orange glow behind the card */}
            <div className="absolute -inset-2 rounded-[24px] bg-gradient-to-tr from-[#ff5a00]/10 to-[#ff7d3b]/5 opacity-80 blur-xl group-hover:opacity-100 transition-opacity duration-500" />
            
            {/* Main Premium Card Container */}
            <div className="relative overflow-hidden rounded-[20px] border border-zinc-200/80 dark:border-zinc-800/80 bg-white/80 dark:bg-[#121215]/90 p-3 shadow-xl backdrop-blur-md">
              {/* Internal decorative gradient */}
              <div className="absolute top-0 left-0 w-40 h-40 rounded-full bg-[#ff5a00]/10 blur-[50px] pointer-events-none" />
              
              {/* Screenshot Wrapper */}
              <div className="relative rounded-[14px] overflow-hidden border border-zinc-200/50 dark:border-zinc-800/50 bg-zinc-50 dark:bg-[#09090b]">
                <div role="img" aria-label="A shared document downloaded and kept on your device" className="flex min-h-[260px] flex-col items-center justify-center gap-5 p-6 sm:min-h-[320px] sm:p-10">
                  <div className="flex w-full max-w-xs items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-white/5">
                    <FileText aria-hidden="true" className="h-9 w-9 shrink-0 text-orange-500" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white">Document.pdf</p>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Shared through Woff</p>
                    </div>
                    <ArrowDownToLine aria-hidden="true" className="ml-auto h-5 w-5 shrink-0 text-orange-500" />
                  </div>
                  <ArrowDownToLine aria-hidden="true" className="h-6 w-6 text-orange-500/70" />
                  <div className="flex items-center gap-3 rounded-xl border border-orange-500/25 bg-orange-500/10 px-5 py-4">
                    <Laptop aria-hidden="true" className="h-7 w-7 text-orange-600 dark:text-orange-400" />
                    <div>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white">Kept on your device</p>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Your copy stays with you.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="relative w-full overflow-clip">
      <Timeline data={data} />
    </div>
  );
}
