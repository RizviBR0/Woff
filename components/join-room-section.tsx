"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users } from "lucide-react";

export function JoinRoomSection() {
  const [roomCode, setRoomCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleJoinRoom = async () => {
    if (!roomCode.trim()) {
      setError("Please enter a room code");
      return;
    }

    // Clean the room code - remove any URL parts and extract just the code
    let cleanCode = roomCode.trim();
    
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
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="Enter room code (e.g., KQ34RR)"
            value={roomCode}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1"
            disabled={isJoining}
          />
          <Button
            onClick={handleJoinRoom}
            disabled={isJoining || !roomCode.trim()}
            className="min-w-[120px]"
          >
            {isJoining ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                Joining...
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
          <p className="text-sm text-destructive text-left">{error}</p>
        )}
        
        <p className="text-xs text-muted-foreground text-left">
          Paste a room URL or enter just the room code
        </p>
      </div>
    </div>
  );
}