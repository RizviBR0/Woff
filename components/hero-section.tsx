"use client";

import { Suspense, useCallback, useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ScanLine,
  Clipboard,
  Users,
  Zap,
  Share2,
  Loader2,
  Link2,
  Copy,
  ArrowLeftRight,
} from "lucide-react";
import { toast } from "sonner";
import { extractRoomSlug, isLegacyRoomSlug } from "@/lib/room-slug";
import { extractInvitationPath } from "@/lib/room-links";
import { useCreateSpace } from "@/lib/hooks/use-create-space";
import { Button } from "@/components/ui/button";

function JoinFeedback({ onRejected }: { onRejected: () => void }) {
  const params = useSearchParams();
  const error = params.get("joinError");
  useEffect(() => {
    if (!error) return;
    onRejected();
    const url = new URL(window.location.href);
    url.searchParams.delete("joinError");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  }, [error, onRejected]);
  return null;
}

export default function HeroSection() {
  const [pinDigits, setPinDigits] = useState<string[]>(Array(4).fill(""));
  const [joinByName, setJoinByName] = useState(false);
  const [roomAddress, setRoomAddress] = useState("");
  const { isCreating, createAndNavigate: handleCreateSpace } = useCreateSpace();
  const [isJoining, setIsJoining] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [shareHost, setShareHost] = useState("woff.space");
  const [isPasting, setIsPasting] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const qrScannerRef = useRef<any>(null);
  const router = useRouter();
  const joiningRef = useRef(false);
  const rejectJoin = useCallback(() => {
    joiningRef.current = false;
    setIsJoining(false);
    toast.error("Room not found or expired — please check the address");
  }, []);

  const roomCode = pinDigits.join("");
  const hasFullCode = roomCode.length === 4;
  const namedRoom = extractRoomSlug(roomAddress);
  const invitationPath = extractInvitationPath(roomAddress);
  const canJoin = joinByName ? Boolean(namedRoom || invitationPath) : hasFullCode;
  const showRoomAddress = useCallback((slug: string) => {
    if (isLegacyRoomSlug(slug)) {
      setJoinByName(false);
      setPinDigits(slug.split(""));
    } else {
      setJoinByName(true);
      setRoomAddress(slug);
    }
  }, []);

  // Pre-fill PIN from URL query param (e.g., /?room=1234) or localStorage without triggering CSR de-opt
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const roomFromUrl = params.get("room");
      const slugFromUrl = roomFromUrl ? extractRoomSlug(roomFromUrl) : "";
      if (slugFromUrl) {
        showRoomAddress(slugFromUrl);
        setTimeout(() => {
          inputRefs.current[3]?.focus();
        }, 100);
        return;
      }
    } catch {
      // Ignore if window is not ready
    }

    const savedRoom =
      localStorage.getItem("last_room") ||
      localStorage.getItem("last_created_space");
    const savedSlug = savedRoom ? extractRoomSlug(savedRoom) : "";
    if (savedSlug) showRoomAddress(savedSlug);
  }, [showRoomAddress]);

  useEffect(() => {
    setShareHost(window.location.host);
    return () => {
      if (qrScannerRef.current) {
        qrScannerRef.current.stop();
      }
    };
  }, []);

  const handleJoinRoom = async (overrideCode?: string) => {
    const input = overrideCode ?? (joinByName ? roomAddress : pinDigits.join(""));
    const invitation = extractInvitationPath(input);
    const codeToJoin = extractRoomSlug(input);
    if (!invitation && !codeToJoin) {
      toast.error("Enter a room code, name, or invitation link");
      return;
    }
    if (joiningRef.current) return;
    joiningRef.current = true;
    setIsJoining(true);

    try {
      if (invitation) { router.push(invitation); return; }
      try { localStorage.setItem("last_room", codeToJoin); } catch {}
      router.push(`/${codeToJoin}?join=1`);
    } catch (err) {
      console.error("Failed to join room:", err);
      toast.error("Failed to join room");
      setIsJoining(false);
      joiningRef.current = false;
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
        void handleJoinRoom(fullCode);
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
    const invitation = extractInvitationPath(pastedData);
    if (invitation) { router.push(invitation); return; }
    const slug = extractRoomSlug(pastedData);
    if (slug && !isLegacyRoomSlug(slug)) {
      showRoomAddress(slug);
      void handleJoinRoom(slug);
      return;
    }
    const digits = isLegacyRoomSlug(slug) ? slug : /^[0-9]{1,3}$/.test(pastedData.trim()) ? pastedData.trim() : "";

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
        void handleJoinRoom(digits);
      }
    }
  };

  const handlePaste = async () => {
    try {
      setIsPasting(true);
      const clipboardText = await navigator.clipboard.readText();

      if (clipboardText.trim()) {
        const invitation = extractInvitationPath(clipboardText);
        if (invitation) { router.push(invitation); return; }
        const extractedCode = extractRoomSlug(clipboardText);
        if (extractedCode) {
            showRoomAddress(extractedCode);
            void handleJoinRoom(extractedCode);
        } else {
          toast.error("No valid room code, name, or invitation link found");
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
    const slug = joinByName ? namedRoom : hasFullCode ? roomCode : "";
    if (!slug) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/${slug}`);
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
          const invitation = extractInvitationPath(result.data);
          if (invitation) {
            qrScanner.stop(); safeRemoveOverlay(overlay); setIsScanning(false); router.push(invitation); return;
          }
          const extractedCode = extractRoomSlug(result.data);
          if (extractedCode) {
            try {
                showRoomAddress(extractedCode);
                qrScanner.stop();
                safeRemoveOverlay(overlay);
                setIsScanning(false);
                void handleJoinRoom(extractedCode);
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
      <Suspense fallback={null}><JoinFeedback onRejected={rejectJoin} /></Suspense>
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
              Instant file sharing
            </div>

            {/* Headline — LCP element: renders immediately, no opacity:0 */}
            <h1
              className="hero-stagger-item max-w-[500px] text-4xl font-extrabold tracking-[-0.04em] sm:text-5xl md:text-4xl lg:text-[56px] text-zinc-900 dark:text-white"
              style={{ lineHeight: 1.15, animationDelay: '80ms' }}
            >
              Share files
              <br />
              <span className="bg-gradient-to-r from-[#ff7d3b] via-[#ff5a00] to-[#ff3600] bg-clip-text text-transparent">
                instantly.
              </span>
            </h1>

            {/* Subtext */}
            <p
              className="hero-stagger-item mt-5 max-w-[460px] text-[15px] leading-relaxed text-zinc-500 dark:text-white/55 sm:text-base md:text-sm lg:text-base"
              style={{ animationDelay: '160ms' }}
            >
              Send files between devices or to anyone using a link, room code,
              or QR code. No sign-up required.
            </p>

            {/* CTA Buttons — directly under subtitle */}
            <div
              className="hero-stagger-item mt-8 flex flex-wrap items-center gap-3"
              style={{ animationDelay: '240ms' }}
            >
              <Button
                variant="primary"
                onClick={handleCreateSpace}
                disabled={isCreating}
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
                {isCreating ? "Creating..." : "Start sharing"}
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  const el = document.getElementById("join-room-section");
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                  setTimeout(() => inputRefs.current[0]?.focus(), 400);
                }}
                className="h-12 px-7 text-[15px] font-semibold rounded-xl border-zinc-200 dark:border-white/10 bg-white/60 dark:bg-white/5 text-zinc-800 dark:text-white backdrop-blur-sm transition hover:bg-zinc-100 dark:hover:bg-white/10 hover:border-zinc-300 dark:hover:border-white/20 flex items-center gap-2.5"
              >
                <Users size={18} />
                Join Room
              </Button>
            </div>

            <p className="hero-stagger-item mt-4 max-w-[460px] text-sm leading-relaxed text-zinc-600 dark:text-white/65" style={{ animationDelay: '280ms' }}>
              No time limit by default. Keep your own copy.
            </p>

            {/* Compact Feature Cards */}
            <div
              className="hero-stagger-item mt-9 grid gap-3 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3"
              style={{ animationDelay: '320ms' }}
            >
              <FeatureCard
                icon={<Zap size={17} strokeWidth={2.2} />}
                title="No sign up"
                text="Start sharing without creating an account."
              />
              <FeatureCard
                icon={<Share2 size={17} strokeWidth={2.2} />}
                title="Files and more"
                text="Share files with images, links, quick notes, and code."
              />
              <FeatureCard
                icon={<ArrowLeftRight size={17} strokeWidth={2.2} />}
                title="Instant access"
                text="Create a room and share the link or room code."
              />
            </div>

            {/* Social proof / clarity line */}
            <div
              className="hero-stagger-item mt-6 flex items-center gap-2 text-xs text-zinc-400 dark:text-white/40"
              style={{ animationDelay: '400ms' }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/80 shrink-0" />
              <span>Move photos to your laptop or send a document to a teammate.</span>
            </div>
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
                  {(joinByName ? namedRoom : hasFullCode) ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyLink}
                      className="h-auto p-1 flex items-center gap-1.5 text-xs text-[#ff5a00] dark:text-[#ff7d3b] hover:text-[#ff5a00] dark:hover:text-[#ff7d3b] font-medium transition hover:opacity-80 bg-transparent hover:bg-transparent"
                    >
                      <span className="min-w-0 truncate font-mono">
                        {shareHost}/{joinByName ? namedRoom : roomCode}
                      </span>
                      <Copy size={12} />
                      {linkCopied && (
                        <span className="text-emerald-500 text-[10px] ml-1">
                          Copied!
                        </span>
                      )}
                    </Button>
                  ) : (
                    <span className="text-xs text-zinc-400 dark:text-white/30 font-medium">
                      {joinByName ? "Room name or link" : "Enter room code"}
                    </span>
                  )}
                </div>

                {/* PIN Code Inputs — pre-filled look */}
                {joinByName ? (
                  <input
                    type="text"
                    value={roomAddress}
                    onChange={(event) => setRoomAddress(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void handleJoinRoom(); } }}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={2048}
                    disabled={isJoining || isScanning || isPasting}
                    placeholder="your-name or a room link"
                    aria-label="Room name or link"
                    className="h-14 w-full min-w-0 rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm text-zinc-900 outline-none transition-all focus:border-[#ff5a00] focus:ring-2 focus:ring-[#ff5a00]/20 disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white"
                  />
                ) : <div className="mx-auto grid w-full grid-cols-4 gap-3">
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
                </div>}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setJoinByName((value) => !value)}
                  disabled={isJoining || isScanning || isPasting}
                  className="mt-3 h-8 w-full text-xs font-normal text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                >
                  {joinByName ? "Use a 4-digit code" : "Use a room name or link"}
                </Button>

                {/* Quick actions: Scan QR / Paste Link */}
                <div className="mt-5 flex items-center justify-center gap-4 text-[13px] text-zinc-500 dark:text-zinc-400">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleQRScan}
                    disabled={isJoining || isScanning || isPasting}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 font-normal h-auto"
                  >
                    <ScanLine size={15} />
                    Scan QR
                  </Button>

                  <span className="h-5 w-px bg-zinc-200 dark:bg-white/10" />

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handlePaste}
                    disabled={isJoining || isScanning || isPasting}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 font-normal h-auto"
                  >
                    <Clipboard size={15} />
                    Paste Link
                  </Button>
                </div>

                {/* Join Room — always active-looking */}
                <Button
                  onClick={() => handleJoinRoom()}
                  disabled={
                    isJoining || isScanning || isPasting || !canJoin
                  }
                  className={`mt-5 w-full h-[52px] flex items-center justify-center gap-2.5 rounded-xl text-[15px] font-semibold transition-all duration-200 ${
                    canJoin
                      ? "border border-zinc-300 dark:border-white/15 bg-zinc-100 dark:bg-white/10 text-zinc-900 dark:text-white hover:bg-zinc-200 dark:hover:bg-white/15 hover:border-zinc-400 dark:hover:border-white/25 shadow-sm"
                      : "border border-zinc-200 dark:border-white/[0.06] bg-zinc-50 dark:bg-white/[0.04] text-zinc-400 dark:text-white/30 cursor-default"
                  }`}
                >
                  {isJoining && (
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                  )}
                  {isJoining ? "Joining..." : "Join Room"}
                </Button>
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
    <div className="group relative flex flex-row items-start gap-3.5 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/75 p-3.5 shadow-[0_2px_10px_rgba(0,0,0,0.02),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-[#ff5a00]/35 hover:shadow-[0_12px_28px_rgba(255,90,0,0.08)] sm:flex-col sm:gap-0 sm:p-4 dark:border-white/[0.08] dark:bg-[#121215]/50 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] dark:hover:border-[#ff5a00]/30 dark:hover:bg-[#16161b]/80 dark:hover:shadow-[0_12px_28px_rgba(255,90,0,0.12)]">
      {/* Top subtle gradient highlight line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-[#ff5a00]/0 to-transparent transition-all duration-500 group-hover:via-[#ff5a00]/40" />

      {/* Ambient corner glow on hover */}
      <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-[#ff5a00]/0 blur-2xl transition-all duration-500 group-hover:bg-[#ff5a00]/12 dark:group-hover:bg-[#ff5a00]/18" />

      {/* Icon Badge */}
      <div className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#ff5a00]/20 bg-gradient-to-br from-[#ff5a00]/15 via-[#ff5a00]/10 to-[#ff5a00]/5 text-[#ff5a00] shadow-[0_2px_8px_rgba(255,90,0,0.06)] transition-all duration-300 group-hover:scale-105 group-hover:border-[#ff5a00]/40 group-hover:shadow-[0_4px_12px_rgba(255,90,0,0.15)] sm:mb-3 dark:border-[#ff5a00]/25 dark:text-[#ff7d3b]">
        {icon}
      </div>

      {/* Content */}
      <div className="relative z-10 min-w-0 flex-1">
        <h3 className="text-[13px] font-bold tracking-tight text-zinc-900 transition-colors group-hover:text-zinc-950 dark:text-white dark:group-hover:text-white">
          {title}
        </h3>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-zinc-500 transition-colors sm:mt-1 dark:text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300">
          {text}
        </p>
      </div>
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
