"use client";

import { Suspense, useCallback, useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ScanLine,
  Clipboard,
  Users,
  Zap,
  Share2,
  Upload,
  Loader2,
  Link2,
  Copy,
  Check,
  Hash,
  ArrowRight,
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
  const roomAddressRef = useRef<HTMLInputElement>(null);
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
          (isLegacyRoomSlug(slugFromUrl) ? inputRefs.current[3] : roomAddressRef.current)?.focus();
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
      e.preventDefault();
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
                  <Loader2 className="h-[18px] w-[18px] shrink-0 animate-spin" />
                ) : (
                  <Upload className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                )}
                {isCreating ? "Creating..." : "Start sharing"}
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  const el = document.getElementById("join-room-section");
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                  setTimeout(() => (joinByName ? roomAddressRef.current : inputRefs.current[0])?.focus(), 400);
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

          {/* Join an existing room */}
          <div
            className="hero-card-enter flex w-full min-w-0 justify-center md:justify-end"
            id="join-room-section"
          >
            <div className="relative w-full min-w-0 max-w-[440px] md:max-w-[360px] lg:max-w-[440px]">
              <div aria-hidden="true" className="pointer-events-none absolute -left-10 bottom-12 h-64 w-52 rounded-full bg-orange-400/20 blur-[64px] dark:bg-orange-500/[0.16]" />
              <div aria-hidden="true" className="pointer-events-none absolute -right-8 top-8 h-40 w-40 rounded-full bg-white/65 blur-[60px] dark:bg-orange-100/[0.08]" />

              <div className="hero-join-glass relative overflow-hidden rounded-3xl border p-5 sm:p-7 md:p-5 lg:p-7">
                <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent dark:via-white/40" />
                <div aria-hidden="true" className="pointer-events-none absolute bottom-24 left-0 top-8 w-px bg-gradient-to-b from-white/5 via-white/60 to-transparent dark:via-orange-100/25" />
                <div className="mb-6 flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-orange-500/15 bg-orange-500/[0.08] text-orange-600 dark:text-orange-400">
                    <Users size={20} strokeWidth={1.8} />
                  </span>
                  <div>
                    <h3 id="join-room-heading" className="text-[17px] font-semibold tracking-tight text-zinc-900 sm:text-lg dark:text-zinc-100">
                      Join an existing space
                    </h3>
                    <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Enter a room code or invitation link.</p>
                  </div>
                </div>

                <div role="group" aria-label="Join method" className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-white/[0.04]">
                  {[
                    { byName: false, label: "4-digit code", icon: Hash },
                    { byName: true, label: "Name or link", icon: Link2 },
                  ].map(({ byName, label, icon: Icon }) => (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={joinByName === byName}
                      aria-controls="join-room-fields"
                      disabled={isJoining || isScanning || isPasting}
                      onClick={() => setJoinByName(byName)}
                      className={`flex h-10 items-center justify-center gap-2 rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 disabled:opacity-50 ${joinByName === byName ? "bg-white text-zinc-900 shadow-sm ring-1 ring-black/[0.04] dark:bg-[#29292d] dark:text-white dark:ring-white/[0.06]" : "bg-transparent text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"}`}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {label}
                    </button>
                  ))}
                </div>

                <form aria-labelledby="join-room-heading" onSubmit={(event) => { event.preventDefault(); if (canJoin) void handleJoinRoom(); }}>
                  <div id="join-room-fields">
                    <div className="mb-2.5 flex items-center justify-between">
                      <label htmlFor={joinByName ? "join-room-address" : "join-room-digit-0"} className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        {joinByName ? "Room name or invitation link" : "Room code"}
                      </label>
                      {!joinByName && <span className="text-[11px] text-zinc-400 dark:text-zinc-500">4 digits</span>}
                    </div>

                    {joinByName ? (
                      <div className="relative">
                        <Link2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
                        <input
                          ref={roomAddressRef}
                          id="join-room-address"
                          type="text"
                          value={roomAddress}
                          onChange={(event) => setRoomAddress(event.target.value)}
                          autoComplete="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          maxLength={2048}
                          disabled={isJoining || isScanning || isPasting}
                          placeholder="your-room or paste a link"
                          aria-label="Room name or link"
                          aria-describedby="join-room-help"
                          className="h-[72px] w-full min-w-0 rounded-xl border border-zinc-200 bg-zinc-50/80 pl-11 pr-4 text-base text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-500/10 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.025] dark:text-white dark:placeholder:text-zinc-500 dark:focus:bg-white/[0.04]"
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-2.5 sm:gap-3">
                        {pinDigits.map((digit, item) => (
                          <input
                            key={item}
                            id={`join-room-digit-${item}`}
                            ref={(el) => { inputRefs.current[item] = el; }}
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            maxLength={1}
                            value={digit}
                            disabled={isJoining || isScanning || isPasting}
                            onChange={(e) => handlePinChange(item, e.target.value)}
                            onKeyDown={(e) => handlePinKeyDown(item, e)}
                            onPaste={handlePinPaste}
                            onFocus={(event) => event.currentTarget.select()}
                            placeholder="–"
                            className={`h-[72px] w-full min-w-0 rounded-xl border bg-zinc-50/80 text-center font-mono text-[28px] font-medium text-zinc-900 outline-none transition-colors placeholder:text-zinc-300 focus:border-orange-500 focus:bg-white focus:ring-4 focus:ring-orange-500/10 disabled:opacity-50 dark:bg-white/[0.025] dark:text-white dark:placeholder:text-zinc-600 dark:focus:bg-white/[0.04] ${digit ? "border-zinc-300 dark:border-white/20" : "border-zinc-200 dark:border-white/10"}`}
                            aria-label={`Digit ${item + 1}`}
                            aria-describedby="join-room-help"
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  <div id="join-room-help" className="mb-5 mt-3 flex min-h-6 min-w-0 items-center">
                    {(joinByName ? namedRoom : hasFullCode) ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleCopyLink}
                        aria-label="Copy room link"
                        className="h-6 min-w-0 max-w-full gap-1.5 bg-transparent px-0 text-[11px] font-normal text-zinc-500 hover:bg-transparent hover:text-orange-600 dark:text-zinc-400 dark:hover:text-orange-400"
                      >
                        <span className="min-w-0 truncate font-mono">
                          {shareHost}/{joinByName ? namedRoom : roomCode}
                        </span>
                        {linkCopied ? <Check size={12} className="shrink-0 text-emerald-500" /> : <Copy size={12} className="shrink-0" />}
                        <span className="sr-only" aria-live="polite">{linkCopied ? "Copied" : ""}</span>
                      </Button>
                    ) : (
                      <span className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                        {joinByName ? "Use the name or link shared with you." : "Enter the code shared by the room owner."}
                      </span>
                    )}
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isJoining || isScanning || isPasting || !canJoin}
                    className="hero-join-submit h-12 w-full disabled:opacity-100"
                  >
                    {isJoining ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {isJoining ? "Joining..." : "Join Room"}
                    {!isJoining && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                  </Button>
                </form>

                <div className="my-5 flex items-center gap-3" aria-hidden="true">
                  <span className="h-px flex-1 bg-zinc-200/80 dark:bg-white/[0.07]" />
                  <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">or join with</span>
                  <span className="h-px flex-1 bg-zinc-200/80 dark:bg-white/[0.07]" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleQRScan}
                    disabled={isJoining || isScanning || isPasting}
                    className="h-11 gap-2 rounded-xl border-zinc-200 bg-transparent px-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
                  >
                    {isScanning ? <Loader2 size={16} className="shrink-0 animate-spin" /> : <ScanLine size={16} className="shrink-0" />}
                    Scan QR
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePaste}
                    disabled={isJoining || isScanning || isPasting}
                    className="h-11 gap-2 rounded-xl border-zinc-200 bg-transparent px-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
                  >
                    {isPasting ? <Loader2 size={16} className="shrink-0 animate-spin" /> : <Clipboard size={16} className="shrink-0" />}
                    Paste Link
                  </Button>
                </div>
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
