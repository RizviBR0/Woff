"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Copy, Check, Share, Settings, X, QrCode } from "lucide-react";
import { Space } from "@/lib/actions";
import { Composer } from "./composer";
import { EntryCard, type Entry } from "./entry-card";
import { ThemeToggle } from "./theme-toggle";
import { createClientSupabaseClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SpaceContainerProps {
  space: Space;
  initialEntries: Entry[];
}

export function SpaceContainer({ space, initialEntries }: SpaceContainerProps) {
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [hasPosted, setHasPosted] = useState(initialEntries.length > 0);
  const [copied, setCopied] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");

  // Function to scroll to bottom smoothly
  const scrollToBottom = useCallback(() => {
    // Scroll the window to the bottom
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "smooth",
    });
  }, []);

  // Auto-scroll to bottom when entries change
  useEffect(() => {
    if (entries.length > 0) {
      // Small delay to ensure DOM has updated
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    }
  }, [entries, scrollToBottom]);

  // Real-time subscription for new entries
  useEffect(() => {
    const supabase = createClientSupabaseClient();

    const channel = supabase
      .channel("entries-changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "entries",
          filter: `space_id=eq.${space.id}`,
        },
        (payload) => {
          console.log("🔄 Real-time: New entry received", payload);
          const newEntry = payload.new as Entry;

          // Add a small delay to let local updates settle first
          setTimeout(() => {
            setEntries((prev) => {
              const exists = prev.some((entry) => entry.id === newEntry.id);
              if (exists) {
                console.log(
                  "🔄 Real-time: Entry already exists, skipping",
                  newEntry.id
                );
                return prev;
              }

              console.log(
                "🔄 Real-time: Adding new entry",
                newEntry.id,
                "Current count:",
                prev.length
              );
              // Since entries are already ordered by created_at from the server,
              // and new entries are always newer, just append to the end
              // This avoids re-sorting and layout shifts
              const updated = [...prev, newEntry];
              console.log("🔄 Real-time: New count:", updated.length);
              return updated;
            });
            setHasPosted(true);
          }, 100); // Small delay to prevent race conditions
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "entries",
          filter: `space_id=eq.${space.id}`,
        },
        (payload) => {
          console.log("🔄 Real-time: Entry updated", payload);
          const updatedEntry = payload.new as Entry;

          setEntries((prev) =>
            prev.map((entry) =>
              entry.id === updatedEntry.id ? updatedEntry : entry
            )
          );
        }
      )
      .subscribe();

    return () => {
      console.log("🔄 Real-time: Unsubscribing from channel");
      supabase.removeChannel(channel);
    };
  }, [space.id]);

  const handleNewEntry = useCallback(
    (entry: Entry) => {
      console.log("📝 Local: Adding new entry", entry.id);
      setEntries((prev) => {
        console.log("📝 Local: Current count:", prev.length);
        const updated = [...prev, entry];
        console.log("📝 Local: New count:", updated.length);
        return updated;
      });
      setHasPosted(true);

      // Scroll to bottom immediately after adding new entry
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    },
    [scrollToBottom]
  );

  const handleCopy = async () => {
    try {
      const shareUrl = `${window.location.origin}/r/${space.slug}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
      // Fallback for older browsers
      const shareUrl = `${window.location.origin}/r/${space.slug}`;
      const textArea = document.createElement("textarea");
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const generateQRCode = async (url: string) => {
    try {
      // Use a QR code API service (QR Server is free and reliable)
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&format=png&data=${encodeURIComponent(
        url
      )}`;
      setQrCodeUrl(qrUrl);
    } catch (error) {
      console.error("Failed to generate QR code:", error);
      // Fallback: still set the URL so the image tries to load
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&format=png&data=${encodeURIComponent(
        url
      )}`;
      setQrCodeUrl(qrUrl);
    }
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/r/${space.slug}`;
    setShareModalOpen(true);
    // Generate QR code after opening modal for better UX
    setTimeout(() => generateQRCode(shareUrl), 100);
  };

  const handleCopyFromModal = async () => {
    const shareUrl = `${window.location.origin}/r/${space.slug}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-medium">WoFF</h1>
          </div>

          {/* Center copy button */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Button
              onClick={handleCopy}
              variant="ghost"
              size="sm"
              className={`h-8 gap-2 rounded-full px-3 transition-all duration-200 ${
                copied
                  ? "bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-950/20 dark:text-green-400 dark:hover:bg-green-950/30"
                  : "hover:bg-accent"
              }`}
            >
              {copied ? (
                <>
                  <span className="text-xs font-medium">Copied!</span>
                  <Check className="h-3 w-3" />
                </>
              ) : (
                <>
                  <span className="text-xs font-medium text-muted-foreground">
                    woff.space/r/{space.slug}
                  </span>
                  <Copy className="h-3 w-3" />
                </>
              )}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleShare}
              className="h-8 w-8"
            >
              <Share className="h-4 w-4" />
              <span className="sr-only">Share</span>
            </Button>

            <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Settings className="h-4 w-4" />
                  <span className="sr-only">Settings</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-0" align="end">
                <div className="p-4 space-y-4">
                  <div className="space-y-2">
                    <h4 className="font-medium leading-none">Settings</h4>
                    <p className="text-sm text-muted-foreground">
                      Customize your experience
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="text-sm font-medium">Theme</div>
                        <div className="text-xs text-muted-foreground">
                          Toggle light/dark mode
                        </div>
                      </div>
                      <ThemeToggle />
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4">
        {!hasPosted ? (
          // Centered composer for first post
          <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center">
            <div className="w-full max-w-2xl">
              <Composer
                spaceId={space.id}
                onNewEntry={handleNewEntry}
                centered={true}
              />
              <div className="mt-4 text-center text-sm text-muted-foreground">
                Paste to create • Drop to upload • Type to write
              </div>
            </div>
          </div>
        ) : (
          // Timeline view with entries and bottom composer
          <div className="pb-20">
            <div className="mx-auto max-w-2xl space-y-6 py-8">
              {entries.map((entry) => (
                <EntryCard key={entry.id} entry={entry} />
              ))}
            </div>

            {/* Bottom composer */}
            <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-safe">
              <div className="container mx-auto px-4 py-3">
                <div className="mx-auto max-w-2xl">
                  <Composer
                    spaceId={space.id}
                    onNewEntry={handleNewEntry}
                    centered={false}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Share Modal */}
      <Dialog
        open={shareModalOpen}
        onOpenChange={(open) => {
          setShareModalOpen(open);
          if (!open) {
            // Reset QR code when modal closes
            setQrCodeUrl("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share className="h-5 w-5" />
              Share this space
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* QR Code */}
            <div className="flex justify-center">
              {qrCodeUrl ? (
                <div className="p-4 bg-white dark:bg-gray-100 rounded-lg border-2 border-border shadow-sm">
                  <img
                    src={qrCodeUrl}
                    alt="QR Code for space"
                    className="w-48 h-48 block"
                  />
                </div>
              ) : (
                <div className="w-56 h-56 flex items-center justify-center bg-muted rounded-lg border-2 border-dashed border-border">
                  <div className="text-center">
                    <QrCode className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Generating QR code...
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Share URL */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground">
                Share link
              </label>
              <div className="flex gap-2">
                <div className="flex-1 p-3 bg-muted rounded-md text-sm font-mono text-foreground border">
                  woff.space/r/{space.slug}
                </div>
                <Button
                  size="sm"
                  onClick={handleCopyFromModal}
                  variant={copied ? "default" : "outline"}
                  className={
                    copied ? "bg-green-600 hover:bg-green-700 text-white" : ""
                  }
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-1" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-1" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Anyone with this link can view and contribute to this space
              </p>
            </div>

            {/* Future features placeholder */}
            <div className="text-center pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground">
                🚀 More sharing options coming soon
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
