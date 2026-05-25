"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  ScanLine,
  Clipboard,
  Users,
  Zap,
  Shield,
  FileText,
  Loader2,
} from "lucide-react";
import QrScanner from "qr-scanner";
import { createSpace, validateRoomCode } from "@/lib/actions";
import { Logo } from "@/components/logo";
import { toast } from "sonner";

export default function HeroSection() {
  const [pinDigits, setPinDigits] = useState<string[]>(Array(4).fill(""));
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isPasting, setIsPasting] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const qrScannerRef = useRef<QrScanner | null>(null);
  const router = useRouter();

  useEffect(() => {
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
    e: React.KeyboardEvent<HTMLInputElement>
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

  const handleQRScan = async () => {
    try {
      setIsScanning(true);

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
        }
      );

      qrScannerRef.current = qrScanner;

      closeButton.onclick = () => {
        qrScanner.stop();
        safeRemoveOverlay(overlay);
        setIsScanning(false);
      };

      await qrScanner.start();

      setTimeout(() => {
        if (qrScannerRef.current && isScanning) {
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
      {/* Grid Pattern Background */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.025)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:32px_32px]" />

      {/* Decorative Glow Elements */}
      <div className="pointer-events-none absolute left-0 top-0 h-[520px] w-[520px] rounded-full bg-orange-500/20 dark:bg-orange-600/40 blur-[120px] dark:blur-[140px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-orange-500/15 dark:bg-orange-600/35 blur-[110px] dark:blur-[130px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_left_top,rgba(255,95,0,0.1),transparent_34%),radial-gradient(circle_at_center_bottom,rgba(255,95,0,0.12),transparent_34%)] dark:bg-[radial-gradient(circle_at_left_top,rgba(255,95,0,0.28),transparent_34%),radial-gradient(circle_at_center_bottom,rgba(255,95,0,0.34),transparent_34%)]" />

      {/* Main Glassmorphic Wrapper */}
      <div className="relative mx-auto flex min-h-[calc(100vh-48px)] max-w-[1300px] items-center px-5 py-10 sm:px-10 lg:px-20">
        <div className="grid w-full items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
          
          {/* Left Column: Branding and Copy */}
          <div className="max-w-[520px]">
            <div className="mb-8 flex items-center">
              <Logo width={140} height={42} className="w-32 h-auto sm:w-36" />
            </div>

            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-black/40 px-3 py-1.5 text-xs font-medium text-zinc-800 dark:text-white shadow-sm dark:shadow-lg">
              <span className="h-2 w-2 rounded-full bg-[#ff5a00]" />
              No sign-up required. Free forever.
            </div>

            <h1 className="max-w-[500px] text-3xl font-extrabold leading-[1.1] tracking-[-0.04em] sm:text-4xl lg:text-[46px] text-zinc-900 dark:text-white">
              Drop it here.
              <span className="block bg-gradient-to-b from-zinc-900 to-zinc-900/60 dark:from-white dark:to-white/45 bg-clip-text text-transparent pb-2 -mb-2">
                Share it anywhere.
              </span>
            </h1>

            <p className="mt-4 max-w-[480px] text-sm leading-relaxed text-zinc-500 dark:text-white/60 sm:text-base">
              The fastest way to share notes, files, images, and code snippets
              in an instant workspace.
            </p>

            <div className="mt-6 grid gap-4">
              <Feature
                icon={<Zap size={18} />}
                title="Zero Friction"
                text="No sign-ups, no paywalls, no tracking."
              />
              <Feature
                icon={<Shield size={18} />}
                title="Passcode Protected"
                text="Keep your shared spaces locked down."
              />
              <Feature
                icon={<FileText size={18} />}
                title="Everything You Need"
                text="Notes, snippets, files, and more."
              />
            </div>
          </div>

          {/* Right Column: CTA Panel */}
          <div className="w-full flex justify-center lg:justify-end">
            <div className="w-full max-w-[480px] rounded-[28px] border border-zinc-200/80 dark:border-zinc-800 bg-white/95 dark:bg-[#121215]/85 p-6 sm:p-8 lg:p-10 shadow-[0_12px_40px_rgba(0,0,0,0.04)] dark:shadow-[0_0_80px_rgba(255,90,0,0.08)] backdrop-blur-xl transition-colors duration-300">
              
              {/* Create Space Button */}
              <button
                onClick={handleCreateSpace}
                disabled={isCreating}
                className="cta-button-glow w-full h-14 text-lg font-bold transition hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    height="20"
                    width="20"
                    xmlns="http://www.w3.org/2000/svg"
                    className="shrink-0"
                  >
                    <g fill="none">
                      <path
                        d="m12.594 23.258l-.012.002l-.071.035l-.02.004l-.014-.004l-.071-.036q-.016-.004-.024.006l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.016-.018m.264-.113l-.014.002l-.184.093l-.01.01l-.003.011l.018.43l.005.012l.008.008l.201.092q.019.005.029-.008l.004-.014l-.034-.614q-.005-.019-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.003-.011l.018-.43l-.003-.012l-.01-.01z"
                      />
                      <path
                        d="M9.107 5.448c.598-1.75 3.016-1.803 3.725-.159l.06.16l.807 2.36a4 4 0 0 0 2.276 2.411l.217.081l2.36.806c1.75.598 1.803 3.016.16 3.725l-.16.06l-2.36.807a4 4 0 0 0-2.412 2.276l-.081.216l-.806 2.361c-.598 1.75-3.016 1.803-3.724.16l-.062-.16l-.806-2.36a4 4 0 0 0-2.276-2.412l-.216-.081l-2.36-.806c-1.751-.598-1.804-3.016-.16-3.724l.16-.062l2.36-.806A4 4 0 0 0 8.22 8.025l.081-.216zM11 6.094l-.806 2.36a6 6 0 0 1-3.49 3.649l-.25.091l-2.36.806l2.36.806a6 6 0 0 1 3.649 3.49l.091.25l.806 2.36l.806-2.36a6 6 0 0 1 3.49-3.649l.25-.09l2.36-.807l-2.36-.806a6 6 0 0 1-3.649-3.49l-.09-.25zM19 2a1 1 0 0 1 .898.56l.048.117l.35 1.026l1.027.35a1 1 0 0 1 .118 1.845l-.118.048l-1.026.35l-.35 1.027a1 1 0 0 1-1.845.117l-.048-.117l-.35-1.026l-1.027-.35a1 1 0 0 1-.118-1.845l.118-.048l1.026-.35l.35-1.027A1 1 0 0 1 19 2"
                        fill="currentColor"
                      />
                    </g>
                  </svg>
                )}
                {isCreating ? "Creating Space..." : "Create Space"}
              </button>

              <Divider text="OR" />

              {/* PIN Code Inputs */}
              <div className="mx-auto grid w-full grid-cols-4 gap-3 sm:gap-4">
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
                    className="w-full aspect-square rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1a1a1e]/60 text-center text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white outline-none transition focus:border-[#ff5a00] focus:ring-4 focus:ring-orange-500/10 disabled:opacity-50"
                    aria-label={`Digit ${item + 1}`}
                  />
                ))}
              </div>

              {/* Scan and Paste Buttons */}
              <div className="mt-6 flex items-center justify-center gap-6 text-sm sm:text-base text-zinc-500 dark:text-zinc-400">
                <button
                  onClick={handleQRScan}
                  disabled={isJoining || isScanning || isPasting}
                  className="flex items-center gap-2.5 transition hover:text-zinc-900 dark:hover:text-white disabled:opacity-50"
                >
                  <ScanLine size={18} />
                  Scan
                </button>

                <span className="h-6 w-px bg-zinc-200 dark:bg-zinc-800" />

                <button
                  onClick={handlePaste}
                  disabled={isJoining || isScanning || isPasting}
                  className="flex items-center gap-2.5 transition hover:text-zinc-900 dark:hover:text-white disabled:opacity-50"
                >
                  <Clipboard size={18} />
                  Paste
                </button>
              </div>

              <Divider text="OR" />

              {/* Join Room Button */}
              <button
                onClick={() => handleJoinRoom()}
                disabled={isJoining || isScanning || isPasting || pinDigits.join("").length !== 4}
                className="mx-auto flex h-14 w-full items-center justify-center gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-white/10 text-lg font-semibold text-zinc-800 dark:text-white shadow-inner transition hover:bg-zinc-200/80 dark:hover:bg-white/15 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isJoining ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Users size={20} />
                )}
                {isJoining ? "Joining Room..." : "Join Room"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

interface FeatureProps {
  icon: React.ReactNode;
  title: string;
  text: string;
}

function Feature({ icon, title, text }: FeatureProps) {
  return (
    <div className="flex items-start gap-3.5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-black/40 text-[#ff5a00] shadow-sm dark:shadow-lg">
        {icon}
      </div>

      <div>
        <h3 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-white">{title}</h3>
        <p className="mt-0.5 text-xs sm:text-sm text-zinc-500 dark:text-white/55">{text}</p>
      </div>
    </div>
  );
}

interface DividerProps {
  text: string;
}

function Divider({ text }: DividerProps) {
  return (
    <div className="my-6 flex items-center gap-6 text-sm font-semibold text-zinc-400 dark:text-white/45">
      <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
      {text}
      <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
    </div>
  );
}
