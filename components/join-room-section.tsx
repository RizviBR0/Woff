"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Clipboard, QrCode } from "lucide-react";
import QrScanner from "qr-scanner";

export function JoinRoomSection() {
  const [roomCode, setRoomCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState("");
  const [isPasting, setIsPasting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const qrScannerRef = useRef<QrScanner | null>(null);
  const router = useRouter();

  // Cleanup QR scanner on unmount
  useEffect(() => {
    return () => {
      if (qrScannerRef.current) {
        qrScannerRef.current.stop();
      }
    };
  }, []);

  // Function to extract room code from various URL formats
  const extractRoomCode = (input: string): string => {
    let cleanCode = input.trim();

    // Handle various input formats:
    // - Full URL: localhost:3000/r/KQ34RR or https://woff.space/r/KQ34RR
    // - Partial URL: /r/KQ34RR
    // - Just the code: KQ34RR

    if (cleanCode.includes("/r/")) {
      const parts = cleanCode.split("/r/");
      cleanCode = parts[1] || "";
    }

    // Remove any trailing slashes or query parameters
    cleanCode = cleanCode.split("/")[0].split("?")[0];

    return cleanCode;
  };

  const handlePaste = async () => {
    try {
      setIsPasting(true);
      const clipboardText = await navigator.clipboard.readText();

      if (clipboardText.trim()) {
        const extractedCode = extractRoomCode(clipboardText);

        if (extractedCode) {
          setRoomCode(extractedCode);
          setError(""); // Clear any existing errors
        } else {
          setError("No valid room code found in clipboard");
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

      const statusText = document.createElement("div");
      statusText.textContent = "Position QR code in camera view";
      statusText.style.cssText = `
        color: white;
        margin-bottom: 20px;
        text-align: center;
        font-size: 16px;
      `;

      overlay.appendChild(statusText);
      overlay.appendChild(video);
      overlay.appendChild(closeButton);
      document.body.appendChild(overlay);

      // Initialize QR Scanner
      const qrScanner = new QrScanner(
        video,
        (result) => {
          const extractedCode = extractRoomCode(result.data);

          if (extractedCode) {
            setRoomCode(extractedCode);
            setError("");
            qrScanner.stop();
            document.body.removeChild(overlay);
            setIsScanning(false);
          } else {
            statusText.textContent = "No valid room code found - try again";
            statusText.style.color = "#ff6b6b";
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
        document.body.removeChild(overlay);
        setIsScanning(false);
      };

      // Start scanning
      await qrScanner.start();

      // Auto-close after 30 seconds
      setTimeout(() => {
        if (qrScannerRef.current && isScanning) {
          qrScanner.stop();
          if (document.body.contains(overlay)) {
            document.body.removeChild(overlay);
          }
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
    if (!roomCode.trim()) {
      setError("Please enter a room code");
      return;
    }

    const cleanCode = extractRoomCode(roomCode);

    if (!cleanCode) {
      setError("Invalid room code format");
      return;
    }

    setIsJoining(true);
    setError("");

    try {
      // Navigate to the room - the room page will handle validation
      router.push(`/r/${cleanCode}`);
    } catch (error) {
      console.error("Failed to join room:", error);
      setError("Failed to join room");
      setIsJoining(false);
    }
  };

  const handleInputChange = (value: string) => {
    setRoomCode(value);
    if (error) {
      setError(""); // Clear error when user starts typing
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleJoinRoom();
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
          <div className="relative flex-1">
            <Input
              placeholder="Room code"
              value={roomCode}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyPress={handleKeyPress}
              className="h-12 px-4 pr-20 text-center sm:text-left bg-background border-2 border-border hover:border-primary/50 focus:border-primary transition-colors rounded-xl shadow-sm"
              disabled={isJoining || isPasting || isScanning}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
              <button
                type="button"
                onClick={handleQRScan}
                disabled={isJoining || isPasting || isScanning}
                className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                title="Scan QR code"
              >
                <QrCode className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handlePaste}
                disabled={isJoining || isPasting || isScanning}
                className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                title="Paste from clipboard"
              >
                <Clipboard className="h-4 w-4" />
              </button>
            </div>
          </div>
          <Button
            onClick={handleJoinRoom}
            disabled={isJoining || isScanning || !roomCode.trim()}
            className="h-12 px-6 min-w-[140px] rounded-xl font-medium shadow-sm hover:shadow-md transition-all duration-200"
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
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
            <p className="text-sm text-destructive text-center">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
