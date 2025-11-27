"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Users, Clipboard, QrCode } from "lucide-react";
import QrScanner from "qr-scanner";

const PIN_LENGTH = 4;

export function JoinRoomSection() {
  const [pinDigits, setPinDigits] = useState<string[]>(
    Array(PIN_LENGTH).fill("")
  );
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState("");
  const [isPasting, setIsPasting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const qrScannerRef = useRef<QrScanner | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const roomCode = pinDigits.join("");

  // Pre-fill PIN from URL query param (e.g., /?room=1234)
  useEffect(() => {
    const roomFromUrl = searchParams.get("room");
    if (roomFromUrl && /^\d{4}$/.test(roomFromUrl)) {
      const digits = roomFromUrl.split("");
      setPinDigits(digits);
      // Focus the last input
      setTimeout(() => {
        inputRefs.current[PIN_LENGTH - 1]?.focus();
      }, 100);
    }
  }, [searchParams]);

  // Cleanup QR scanner on unmount
  useEffect(() => {
    return () => {
      if (qrScannerRef.current) {
        qrScannerRef.current.stop();
      }
    };
  }, []);

  // Function to extract 4-digit room code from various URL formats
  const extractRoomCode = (input: string): string => {
    let value = input.trim();

    // Try URL parsing if it's a full URL
    try {
      const url = new URL(value);
      const path = url.pathname || "/";
      if (path.startsWith("/r/")) {
        const code = path.slice(3).split("/")[0];
        return /^\d{4}$/.test(code) ? code : "";
      }
      // Root-level code: /CODE
      const seg = path.split("/").filter(Boolean)[0];
      return /^\d{4}$/.test(seg || "") ? seg : "";
    } catch {
      // Not a full URL; treat as path or code
      if (value.includes("/r/")) {
        const code = value.split("/r/")[1].split("/")[0].split("?")[0];
        return /^\d{4}$/.test(code) ? code : "";
      }
      if (value.includes("/")) {
        const seg = value.split("/").filter(Boolean)[0];
        const code = (seg || "").split("?")[0];
        return /^\d{4}$/.test(code) ? code : "";
      }
      // Extract only digits and take first 4
      const digits = value.replace(/\D/g, "").slice(0, 4);
      return digits.length === 4 ? digits : "";
    }
  };

  // Set PIN from extracted code
  const setCodeFromString = (code: string) => {
    const digits = code.replace(/\D/g, "").slice(0, PIN_LENGTH).split("");
    const newPinDigits = Array(PIN_LENGTH).fill("");
    digits.forEach((d, i) => {
      if (i < PIN_LENGTH) newPinDigits[i] = d;
    });
    setPinDigits(newPinDigits);
  };

  const handlePaste = async () => {
    try {
      setIsPasting(true);
      const clipboardText = await navigator.clipboard.readText();

      if (clipboardText.trim()) {
        const extractedCode = extractRoomCode(clipboardText);

        if (extractedCode && extractedCode.length === 4) {
          // Validate the room code exists
          try {
            const { validateRoomCode } = await import("@/lib/actions");
            const isValid = await validateRoomCode(extractedCode);

            if (isValid) {
              setCodeFromString(extractedCode);
              setError(""); // Clear any existing errors
            } else {
              setError("Room not found - please check the code");
            }
          } catch (error) {
            console.error("Error validating room:", error);
            setError("Error validating room code");
          }
        } else {
          setError("No valid 4-digit room code found");
        }
      } else {
        setError("Clipboard is empty");
      }
    } catch (error) {
      console.error("Failed to read clipboard:", error);
      setError("Unable to access clipboard");
    } finally {
      setIsPasting(false);
    }
  };

  const handleQRScan = async () => {
    try {
      setIsScanning(true);
      setError("");

      // Helper function to safely remove overlay
      const safeRemoveOverlay = (overlayElement: HTMLElement) => {
        if (document.body.contains(overlayElement)) {
          document.body.removeChild(overlayElement);
        }
      };

      // Check if camera is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError("Camera not supported in this browser");
        setIsScanning(false);
        return;
      }

      // Create a modal or overlay for the camera view
      const overlay = document.createElement("div");
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 9999;
      `;

      const video = document.createElement("video");
      video.style.cssText = `
        width: 90%;
        max-width: 400px;
        height: auto;
        border-radius: 8px;
      `;

      const closeButton = document.createElement("button");
      closeButton.textContent = "Cancel";
      closeButton.style.cssText = `
        margin-top: 20px;
        padding: 10px 20px;
        background: #fff;
        color: #000;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 16px;
      `;

      overlay.appendChild(video);
      overlay.appendChild(closeButton);
      document.body.appendChild(overlay);

      // Initialize QR Scanner
      const qrScanner = new QrScanner(
        video,
        async (result) => {
          const extractedCode = extractRoomCode(result.data);

          if (extractedCode && extractedCode.length === 4) {
            // Validate the room code exists
            try {
              const { validateRoomCode } = await import("@/lib/actions");
              const isValid = await validateRoomCode(extractedCode);

              if (isValid) {
                setCodeFromString(extractedCode);
                setError("");
                qrScanner.stop();
                safeRemoveOverlay(overlay);
                setIsScanning(false);
              }
            } catch (error) {
              console.error("Error validating room:", error);
            }
          }
        },
        {
          preferredCamera: "environment", // Use back camera
          highlightScanRegion: true,
          highlightCodeOutline: true,
        }
      );

      qrScannerRef.current = qrScanner;

      // Close button handler
      closeButton.onclick = () => {
        qrScanner.stop();
        safeRemoveOverlay(overlay);
        setIsScanning(false);
      };

      // Start scanning
      await qrScanner.start();

      // Auto-close after 30 seconds
      setTimeout(() => {
        if (qrScannerRef.current && isScanning) {
          qrScanner.stop();
          safeRemoveOverlay(overlay);
          setIsScanning(false);
          if (!roomCode) {
            setError("QR scan timeout - please try again");
          }
        }
      }, 30000);
    } catch (error) {
      console.error("Failed to start QR scanner:", error);
      if (error instanceof Error) {
        if (error.name === "NotAllowedError") {
          setError("Camera permission denied");
        } else if (error.name === "NotFoundError") {
          setError("No camera found");
        } else if (error.name === "NotSupportedError") {
          setError("QR scanning not supported");
        } else {
          setError("Unable to access camera");
        }
      } else {
        setError("QR scanning failed");
      }
      setIsScanning(false);
    }
  };

  const handleJoinRoom = async () => {
    if (roomCode.length !== PIN_LENGTH) {
      setError("Please enter a 4-digit room code");
      return;
    }

    if (!/^\d{4}$/.test(roomCode)) {
      setError("Room code must be 4 digits");
      return;
    }

    setIsJoining(true);
    setError("");

    try {
      // Validate the room exists before navigating
      const { validateRoomCode } = await import("@/lib/actions");
      const isValid = await validateRoomCode(roomCode);

      if (isValid) {
        router.push(`/${roomCode}`);
      } else {
        setError("Room not found - please check the code");
        setIsJoining(false);
      }
    } catch (error) {
      console.error("Failed to join room:", error);
      setError("Failed to join room");
      setIsJoining(false);
    }
  };

  const handlePinChange = (index: number, value: string) => {
    // Only allow single digit
    const digit = value.replace(/\D/g, "").slice(-1);

    const newPinDigits = [...pinDigits];
    newPinDigits[index] = digit;
    setPinDigits(newPinDigits);

    if (error) setError("");

    // Auto-focus next input
    if (digit && index < PIN_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits entered
    if (digit && index === PIN_LENGTH - 1) {
      const fullCode = newPinDigits.join("");
      if (fullCode.length === PIN_LENGTH) {
        // Small delay to let state update
        setTimeout(() => handleJoinRoom(), 100);
      }
    }
  };

  const handlePinKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Backspace" && !pinDigits[index] && index > 0) {
      // Move to previous input on backspace if current is empty
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "Enter") {
      handleJoinRoom();
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < PIN_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePinPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text");
    const digits = pastedData.replace(/\D/g, "").slice(0, PIN_LENGTH);

    if (digits.length > 0) {
      const newPinDigits = Array(PIN_LENGTH).fill("");
      digits.split("").forEach((d, i) => {
        if (i < PIN_LENGTH) newPinDigits[i] = d;
      });
      setPinDigits(newPinDigits);

      // Focus the next empty input or last input
      const nextEmptyIndex = newPinDigits.findIndex((d) => !d);
      const focusIndex =
        nextEmptyIndex === -1 ? PIN_LENGTH - 1 : nextEmptyIndex;
      inputRefs.current[focusIndex]?.focus();

      if (error) setError("");
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="space-y-4">
        {/* PIN Input */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 sm:gap-3">
            {pinDigits.map((digit, index) => (
              <input
                key={index}
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handlePinChange(index, e.target.value)}
                onKeyDown={(e) => handlePinKeyDown(index, e)}
                onPaste={handlePinPaste}
                disabled={isJoining || isPasting || isScanning}
                className="w-12 h-14 sm:w-14 sm:h-16 text-center text-2xl sm:text-3xl font-semibold bg-background border-2 border-border rounded-xl shadow-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 hover:border-primary/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={`Digit ${index + 1}`}
              />
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleQRScan}
              disabled={isJoining || isPasting || isScanning}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
              title="Scan QR code"
            >
              <QrCode className="h-4 w-4" />
              <span className="hidden sm:inline">Scan</span>
            </button>
            <button
              type="button"
              onClick={handlePaste}
              disabled={isJoining || isPasting || isScanning}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
              title="Paste from clipboard"
            >
              <Clipboard className="h-4 w-4" />
              <span className="hidden sm:inline">Paste</span>
            </button>
          </div>
        </div>

        {/* Join Button */}
        <Button
          onClick={handleJoinRoom}
          disabled={isJoining || isScanning || roomCode.length !== PIN_LENGTH}
          className="max-w-[250px] w-full h-12 px-8 rounded-xl font-medium shadow-sm hover:shadow-md transition-all duration-200"
          size="lg"
        >
          {isJoining ? (
            <>
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
              Joining...
            </>
          ) : isScanning ? (
            <>
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
              Scanning...
            </>
          ) : (
            <>
              <Users className="w-4 h-4 mr-2" />
              Join Room
            </>
          )}
        </Button>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
            <p className="text-sm text-destructive text-center">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
