"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ScanLine,
  Clipboard,
  Users,
  Zap,
  Share2,
  Loader2,
  ArrowRight,
  Link2,
  Copy,
} from "lucide-react";
import { createSpace, validateRoomCode } from "@/lib/actions";
import { toast } from "sonner";
import { rememberSpaceOwnership } from "@/lib/space-recovery";

export default function HeroSection() {
  const [pinDigits, setPinDigits] = useState<string[]>(Array(4).fill(""));
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [shareHost, setShareHost] = useState("woff.space");
  const [isPasting, setIsPasting] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const qrScannerRef = useRef<any>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const roomCode = pinDigits.join("");
  const hasFullCode = roomCode.length === 4;

  // Pre-fill PIN from URL query param (e.g., /?room=1234) or localStorage when coming back
  useEffect(() => {
    const roomFromUrl = searchParams.get("room");
    if (roomFromUrl && /^\d{4}$/.test(roomFromUrl)) {
      const digits = roomFromUrl.split("");
      setPinDigits(digits);
      // Focus the last input
      setTimeout(() => {
        inputRefs.current[3]?.focus();
      }, 100);
    } else {
      const savedRoom =
        localStorage.getItem("last_room") ||
        localStorage.getItem("last_created_space");
      if (savedRoom && /^\d{4}$/.test(savedRoom)) {
        setPinDigits(savedRoom.split(""));
      }
    }
  }, [searchParams]);

  useEffect(() => {
    setShareHost(window.location.host);
    return () => {
      if (qrScannerRef.current) {
        qrScannerRef.current.stop();
      }
    };
  }, []);

  const handleCreateSpace = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const space = await createSpace();
      rememberSpaceOwnership(space);
      // Prefetch the room page assets before navigating for faster transition
      router.prefetch(`/${space.slug}`);
      router.push(`/${space.slug}`);
    } catch (err) {
      console.error("Failed to create space:", err);
      toast.error("Failed to create space. Please try again.");
      setIsCreating(false);
    }
  };

  const extractRoomCode = (input: string): string => {
    let value = input.trim();
    try {
      const url = new URL(value);
      const path = url.pathname || "/";
      if (path.startsWith("/r/")) {
        const code = path.slice(3).split("/")[0];
        return /^\d{4}$/.test(code) ? code : "";
      }
      const seg = path.split("/").filter(Boolean)[0];
      return /^\d{4}$/.test(seg || "") ? seg : "";
    } catch {
      if (value.includes("/r/")) {
        const code = value.split("/r/")[1].split("/")[0].split("?")[0];
        return /^\d{4}$/.test(code) ? code : "";
      }
      if (value.includes("/")) {
        const seg = value.split("/").filter(Boolean)[0];
        const code = (seg || "").split("?")[0];
        return /^\d{4}$/.test(code) ? code : "";
      }
      const digits = value.replace(/\D/g, "").slice(0, 4);
      return digits.length === 4 ? digits : "";
    }
  };

  const handleJoinRoom = async (overrideCode?: string) => {
    const codeToJoin = overrideCode || pinDigits.join("");
    if (codeToJoin.length !== 4) {
      toast.error("Please enter a 4-digit room code");
      return;
    }
    setIsJoining(true);

    try {
      const isValid = await validateRoomCode(codeToJoin);
      if (isValid) {
        localStorage.setItem("last_room", codeToJoin);
        router.push(`/${codeToJoin}`);
      } else {
        toast.error("Room not found - please check the code");
        setIsJoining(false);
      }
    } catch (err) {
      console.error("Failed to join room:", err);
      toast.error("Failed to join room");
      setIsJoining(false);
    }
  };

  const handlePinChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const newDigits = [...pinDigits];
    newDigits[index] = digit;
    setPinDigits(newDigits);

    if (digit && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    if (digit && index === 3) {
      const fullCode = newDigits.join("");
      if (fullCode.length === 4) {
        setTimeout(() => handleJoinRoom(fullCode), 100);
      }
    }
  };

  const handlePinKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Backspace" && !pinDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 3) {
      inputRefs.current[index + 1]?.focus();
    } else if (e.key === "Enter") {
      const domCode = inputRefs.current.map((el) => el?.value || "").join("");
      handleJoinRoom(domCode);
    }
  };

  const handlePinPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text");
    const digits = pastedData.replace(/\D/g, "").slice(0, 4);

    if (digits.length > 0) {
      const newDigits = Array(4).fill("");
      digits.split("").forEach((d, i) => {
        if (i < 4) newDigits[i] = d;
      });
      setPinDigits(newDigits);

      const nextEmptyIndex = newDigits.findIndex((d) => !d);
      const focusIndex = nextEmptyIndex === -1 ? 3 : nextEmptyIndex;
      inputRefs.current[focusIndex]?.focus();

      if (digits.length === 4) {
        setTimeout(() => handleJoinRoom(digits), 100);
      }
    }
  };

  const handlePaste = async () => {
    try {
      setIsPasting(true);
      const clipboardText = await navigator.clipboard.readText();

      if (clipboardText.trim()) {
        const extractedCode = extractRoomCode(clipboardText);
        if (extractedCode && extractedCode.length === 4) {
          const isValid = await validateRoomCode(extractedCode);
          if (isValid) {
            setPinDigits(extractedCode.split(""));
            setTimeout(() => handleJoinRoom(extractedCode), 100);
          } else {
            toast.error("Room not found from clipboard code");
          }
        } else {
          toast.error("No valid 4-digit room code found");
        }
      } else {
        toast.error("Clipboard is empty");
      }
    } catch (err) {
      console.error("Failed to read clipboard:", err);
      toast.error("Unable to access clipboard");
    } finally {
      setIsPasting(false);
    }
  };

  const handleCopyLink = async () => {
    if (!hasFullCode) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/${roomCode}`);
      setLinkCopied(true);
      toast.success("Link copied!");
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleQRScan = async () => {
    try {
      setIsScanning(true);
      const QrScanner = (await import("qr-scanner")).default;

      const safeRemoveOverlay = (overlayElement: HTMLElement) => {
        if (document.body.contains(overlayElement)) {
          document.body.removeChild(overlayElement);
        }
      };

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast.error("Camera not supported in this browser");
        setIsScanning(false);
        return;
      }

      const overlay = document.createElement("div");
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.85);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        backdrop-filter: blur(8px);
      `;

      const container = document.createElement("div");
      container.style.cssText = `
        position: relative;
        width: 90%;
        max-width: 400px;
        background: #121212;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 24px;
        padding: 24px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
      `;

      const title = document.createElement("h3");
      title.textContent = "Scan Space QR Code";
      title.style.cssText = `
        color: #fff;
        font-size: 20px;
        font-weight: 700;
        margin: 0;
      `;

      const video = document.createElement("video");
      video.style.cssText = `
        width: 100%;
        aspect-ratio: 1;
        object-fit: cover;
        border-radius: 16px;
        border: 2px solid #ff5a00;
      `;

      const closeButton = document.createElement("button");
      closeButton.textContent = "Cancel Scan";
      closeButton.style.cssText = `
        width: 100%;
        padding: 12px;
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        font-size: 16px;
        font-weight: 600;
        transition: background 0.2s;
      `;

      container.appendChild(title);
      container.appendChild(video);
      container.appendChild(closeButton);
      overlay.appendChild(container);
      document.body.appendChild(overlay);

      const qrScanner = new QrScanner(
        video,
        async (result) => {
          const extractedCode = extractRoomCode(result.data);
          if (extractedCode && extractedCode.length === 4) {
            try {
              const isValid = await validateRoomCode(extractedCode);
              if (isValid) {
                setPinDigits(extractedCode.split(""));
                qrScanner.stop();
                safeRemoveOverlay(overlay);
                setIsScanning(false);
                setTimeout(() => handleJoinRoom(extractedCode), 100);
              }
            } catch (err) {
              console.error("Error validating scanned room code:", err);
            }
          }
        },
        {
          preferredCamera: "environment",
          highlightScanRegion: true,
          highlightCodeOutline: true,
        },
      );

      qrScannerRef.current = qrScanner;

      closeButton.onclick = () => {
        qrScanner.stop();
        safeRemoveOverlay(overlay);
        setIsScanning(false);
      };

      await qrScanner.start();

      setTimeout(() => {
        if (qrScannerRef.current) {
          qrScanner.stop();
          safeRemoveOverlay(overlay);
          setIsScanning(false);
          toast.error("QR scan timeout - please try again");
        }
      }, 30000);
    } catch (err) {
      console.error("Failed to start QR scanner:", err);
      if (err instanceof Error) {
        if (err.name === "NotAllowedError") {
          toast.error("Camera permission denied");
        } else if (err.name === "NotFoundError") {
          toast.error("No camera found");
        } else {
          toast.error("Unable to access camera");
        }
      } else {
        toast.error("QR scanning failed");
      }
      setIsScanning(false);
    }
  };

  return (
    <section className="relative min-h-screen overflow-hidden bg-zinc-50 dark:bg-[#030303] px-4 py-6 text-zinc-900 dark:text-white sm:px-6 lg:px-10 transition-colors duration-300">
      {/* Background — controlled single glow + subtle grid */}
      <div className="pointer-events-none absolute inset-0">
        {/* Single controlled orange radial glow behind mockup area */}
        <div className="absolute top-1/2 right-[15%] h-[500px] w-[500px] -translate-y-1/2 rounded-full bg-orange-500/8 dark:bg-[#ff5a00]/15 blur-[160px]" />
        {/* Subtle bottom ambient */}
        <div className="absolute -bottom-20 left-1/2 h-[300px] w-[700px] -translate-x-1/2 rounded-full bg-orange-500/5 dark:bg-[#ff3600]/8 blur-[140px]" />
        {/* Subtle grid texture */}
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.04]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: "64px 64px",
          }}
        />
        {/* Vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(255,255,255,0.2)_100%)] dark:bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(0,0,0,0.5)_100%)]" />
      </div>

      {/* Main content wrapper */}
      <div className="relative mx-auto flex min-h-[calc(100vh-48px)] max-w-[1300px] items-center px-5 py-10 sm:px-10 lg:px-20">
        <div className="grid w-full items-center gap-10 md:grid-cols-[1.1fr_0.9fr] md:gap-8 lg:gap-16">
          {/* ─── Left Column: Conversion Area ─── */}
          {/* CSS animations instead of framer-motion for instant server paint */}
          <div className="max-w-[540px] md:max-w-[460px] lg:max-w-[540px] hero-stagger-container">
            {/* Badge */}
            <div
              className="hero-stagger-item inline-flex items-center gap-2 rounded-full border border-[#ff5a00]/25 bg-[#ff5a00]/8 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-[#ff5a00] dark:text-[#ff7d3b] backdrop-blur-md mb-7"
              style={{ animationDelay: '0ms' }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#ff5a00] animate-pulse" />
              No sign-up required
            </div>

            {/* Headline — LCP element: renders immediately, no opacity:0 */}
            <h1
              className="hero-stagger-item max-w-[500px] text-4xl font-extrabold tracking-[-0.04em] sm:text-5xl md:text-4xl lg:text-[56px] text-zinc-900 dark:text-white"
              style={{ lineHeight: 1.15, animationDelay: '80ms' }}
            >
              Drop anything.
              <br />
              Share it{" "}
              <span className="bg-gradient-to-r from-[#ff7d3b] via-[#ff5a00] to-[#ff3600] bg-clip-text text-transparent">
                instantly.
              </span>
            </h1>

            {/* Subtext */}
            <p
              className="hero-stagger-item mt-5 max-w-[460px] text-[15px] leading-relaxed text-zinc-500 dark:text-white/55 sm:text-base md:text-sm lg:text-base"
              style={{ animationDelay: '160ms' }}
            >
              Create a temporary space for files, images, links, notes, and
              code. Share it with anyone using a simple link or room code.
            </p>

            {/* CTA Buttons — directly under subtitle */}
            <div
              className="hero-stagger-item mt-8 flex flex-wrap items-center gap-3"
              style={{ animationDelay: '240ms' }}
            >
              <button
                onClick={handleCreateSpace}
                disabled={isCreating}
                className="cta-button-glow h-12 px-7 text-[15px] font-bold transition hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2.5"
              >
                {isCreating ? (
                  <Loader2 className="h-4.5 w-4.5 animate-spin" />
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    height="18"
                    width="18"
                    xmlns="http://www.w3.org/2000/svg"
                    className="shrink-0"
                  >
                    <g fill="none">
                      <path d="m12.594 23.258l-.012.002l-.071.035l-.02.004l-.014-.004l-.071-.036q-.016-.004-.024.006l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.016-.018m.264-.113l-.014.002l-.184.093l-.01.01l-.003.011l.018.43l.005.012l.008.008l.201.092q.019.005.029-.008l.004-.014l-.034-.614q-.005-.019-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.003-.011l.018-.43l-.003-.012l-.01-.01z" />
                      <path
                        d="M9.107 5.448c.598-1.75 3.016-1.803 3.725-.159l.06.16l.807 2.36a4 4 0 0 0 2.276 2.411l.217.081l2.36.806c1.75.598 1.803 3.016.16 3.725l-.16.06l-2.36.807a4 4 0 0 0-2.412 2.276l-.081.216l-.806 2.361c-.598 1.75-3.016 1.803-3.724.16l-.062-.16l-.806-2.36a4 4 0 0 0-2.276-2.412l-.216-.081l-2.36-.806c-1.751-.598-1.804-3.016-.16-3.724l.16-.062l2.36-.806A4 4 0 0 0 8.22 8.025l.081-.216zM11 6.094l-.806 2.36a6 6 0 0 1-3.49 3.649l-.25.091l-2.36.806l2.36.806a6 6 0 0 1 3.649 3.49l.091.25l.806 2.36l.806-2.36a6 6 0 0 1 3.49-3.649l.25-.09l2.36-.807l-2.36-.806a6 6 0 0 1-3.649-3.49l-.09-.25zM19 2a1 1 0 0 1 .898.56l.048.117l.35 1.026l1.027.35a1 1 0 0 1 .118 1.845l-.118.048l-1.026.35l-.35 1.027a1 1 0 0 1-1.845.117l-.048-.117l-.35-1.026l-1.027-.35a1 1 0 0 1-.118-1.845l.118-.048l1.026-.35l.35-1.027A1 1 0 0 1 19 2"
                        fill="currentColor"
                      />
                    </g>
                  </svg>
                )}
                {isCreating ? "Creating..." : "Create Space"}
              </button>

              <button
                onClick={() => {
                  const el = document.getElementById("join-room-section");
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                  setTimeout(() => inputRefs.current[0]?.focus(), 400);
                }}
                className="h-12 px-7 text-[15px] font-semibold rounded-xl border border-zinc-200 dark:border-white/10 bg-white/60 dark:bg-white/5 text-zinc-800 dark:text-white backdrop-blur-sm transition hover:bg-zinc-100 dark:hover:bg-white/10 hover:border-zinc-300 dark:hover:border-white/20 flex items-center gap-2.5"
              >
                <Users size={18} />
                Join Room
              </button>
            </div>

            {/* Compact Feature Cards */}
            <div
              className="hero-stagger-item mt-10 grid gap-4 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3"
              style={{ animationDelay: '320ms' }}
            >
              <FeatureCard
                icon={<Zap size={16} />}
                title="No sign up"
                text="Start sharing without creating an account."
              />
              <FeatureCard
                icon={<Share2 size={16} />}
                title="Share anything"
                text="Files, images, links, notes, and code in one space."
              />
              <FeatureCard
                icon={<Link2 size={16} />}
                title="Instant access"
                text="Create a room and share the link or room code."
              />
            </div>

            {/* Social proof / clarity line */}
            <p
              className="hero-stagger-item mt-8 text-xs text-zinc-400 dark:text-white/35"
              style={{ animationDelay: '400ms' }}
            >
              Temporary spaces for files, images, links, notes, and code. No
              account needed.
            </p>
          </div>

          {/* ─── Right Column: Product Mockup Panel ─── */}
          <div
            className="hero-card-enter w-full flex justify-center md:justify-end"
            id="join-room-section"
          >
            <div className="relative w-full max-w-[420px] md:max-w-[340px] lg:max-w-[420px]">
              {/* Controlled glow behind card */}
              <div className="absolute -inset-6 rounded-[36px] bg-[#ff5a00]/8 dark:bg-[#ff5a00]/12 blur-3xl" />

              <div className="relative rounded-[24px] border border-white/60 dark:border-white/[0.1] bg-white/40 dark:bg-white/[0.04] p-6 sm:p-8 md:p-5 lg:p-8 shadow-[0_8px_32px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.5)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05),0_0_60px_rgba(255,90,0,0.05)] backdrop-blur-2xl transition-colors duration-300">
                {/* Panel heading */}
                <div className="flex items-center justify-center gap-2.5 pb-5 mb-5 border-b border-zinc-200/60 dark:border-white/[0.06]">
                  <Users size={16} className="text-[#ff5a00]" />
                  <h3 className="text-[15px] font-semibold tracking-tight text-zinc-800 dark:text-white/80">
                    Join an existing space
                  </h3>
                </div>

                {/* Room link label — appears when code is filled */}
                <div className="h-6 mb-3 flex items-center justify-center">
                  {hasFullCode ? (
                    <button
                      onClick={handleCopyLink}
                      className="flex items-center gap-1.5 text-xs text-[#ff5a00] dark:text-[#ff7d3b] font-medium transition hover:opacity-80 bg-transparent"
                    >
                      <span className="font-mono">
                        {shareHost}/{roomCode}
                      </span>
                      <Copy size={12} />
                      {linkCopied && (
                        <span className="text-emerald-500 text-[10px] ml-1">
                          Copied!
                        </span>
                      )}
                    </button>
                  ) : (
                    <span className="text-xs text-zinc-400 dark:text-white/30 font-medium">
                      Enter room code
                    </span>
                  )}
                </div>

                {/* PIN Code Inputs — pre-filled look */}
                <div className="mx-auto grid w-full grid-cols-4 gap-3">
                  {pinDigits.map((digit, item) => (
                    <input
                      key={item}
                      ref={(el) => {
                        inputRefs.current[item] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      disabled={isJoining || isScanning || isPasting}
                      onChange={(e) => handlePinChange(item, e.target.value)}
                      onKeyDown={(e) => handlePinKeyDown(item, e)}
                      onPaste={handlePinPaste}
                      placeholder="·"
                      className="w-full aspect-square rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-white/[0.03] text-center text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white outline-none transition-all duration-200 focus:border-[#ff5a00] focus:ring-2 focus:ring-[#ff5a00]/20 disabled:opacity-50 placeholder:text-zinc-300 dark:placeholder:text-white/15"
                      aria-label={`Digit ${item + 1}`}
                    />
                  ))}
                </div>

                {/* Quick actions: Scan QR / Paste Link */}
                <div className="mt-5 flex items-center justify-center gap-4 text-[13px] text-zinc-500 dark:text-zinc-400">
                  <button
                    onClick={handleQRScan}
                    disabled={isJoining || isScanning || isPasting}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 disabled:opacity-50 bg-transparent"
                  >
                    <ScanLine size={15} />
                    Scan QR
                  </button>

                  <span className="h-5 w-px bg-zinc-200 dark:bg-white/10" />

                  <button
                    onClick={handlePaste}
                    disabled={isJoining || isScanning || isPasting}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 disabled:opacity-50 bg-transparent"
                  >
                    <Clipboard size={15} />
                    Paste Link
                  </button>
                </div>

                {/* Join Room — always active-looking */}
                <button
                  onClick={() => handleJoinRoom()}
                  disabled={
                    isJoining || isScanning || isPasting || !hasFullCode
                  }
                  className={`mt-5 w-full h-[52px] flex items-center justify-center gap-2.5 rounded-xl text-[15px] font-semibold transition-all duration-200 ${
                    hasFullCode
                      ? "border border-zinc-300 dark:border-white/15 bg-zinc-100 dark:bg-white/10 text-zinc-900 dark:text-white hover:bg-zinc-200 dark:hover:bg-white/15 hover:border-zinc-400 dark:hover:border-white/25 shadow-sm"
                      : "border border-zinc-200 dark:border-white/[0.06] bg-zinc-50 dark:bg-white/[0.04] text-zinc-400 dark:text-white/30 cursor-default"
                  }`}
                >
                  {isJoining ? (
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                  ) : (
                    <ArrowRight size={18} />
                  )}
                  {isJoining ? "Joining..." : "Join Room"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Compact Feature Card ─── */
interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  text: string;
}

function FeatureCard({ icon, title, text }: FeatureCardProps) {
  return (
    <div className="rounded-xl border border-zinc-200/80 dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.02] p-3.5 backdrop-blur-sm transition hover:border-zinc-300 dark:hover:border-white/10">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="text-[#ff5a00]">{icon}</div>
        <h3 className="text-[13px] font-semibold text-zinc-900 dark:text-white">
          {title}
        </h3>
      </div>
      <p className="text-[12px] leading-relaxed text-zinc-500 dark:text-white/45">
        {text}
      </p>
    </div>
  );
}

/* ─── Divider ─── */
interface DividerProps {
  text: string;
}

function Divider({ text }: DividerProps) {
  return (
    <div className="my-6 flex items-center gap-4 text-[12px] font-medium text-zinc-400 dark:text-white/35">
      <div className="h-px flex-1 bg-zinc-200 dark:bg-white/[0.06]" />
      {text}
      <div className="h-px flex-1 bg-zinc-200 dark:bg-white/[0.06]" />
    </div>
  );
}
