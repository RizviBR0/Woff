"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Share,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteSpace, recoverSpace, type Space } from "@/lib/actions";

interface SpaceModalsProps {
  space: Space;
  isCreator: boolean;
  shareModalOpen: boolean;
  setShareModalOpen: (open: boolean) => void;
  qrCodeUrl: string;
  shareHost: string;
  connectionStatus: "connecting" | "connected" | "disconnected";
  deleteDialogOpen: boolean;
  setDeleteDialogOpen: (open: boolean) => void;
  recoveryDialogOpen: boolean;
  setRecoveryDialogOpen: (open: boolean) => void;
  mobileSettingsOpen?: boolean;
  setMobileSettingsOpen?: (open: boolean) => void;
  ownerRecoveryKey?: string;
  isPro?: boolean;
}

export function SpaceModals({
  space,
  isCreator,
  shareModalOpen,
  setShareModalOpen,
  qrCodeUrl,
  shareHost,
  connectionStatus,
  deleteDialogOpen,
  setDeleteDialogOpen,
  recoveryDialogOpen,
  setRecoveryDialogOpen,
  mobileSettingsOpen,
  setMobileSettingsOpen,
  ownerRecoveryKey,
  isPro,
}: SpaceModalsProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [isRecovering, setIsRecovering] = useState(false);

  const handleCopyLink = async () => {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/${space.slug}`
        : `https://${shareHost}/${space.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleDeleteSpace = async () => {
    setIsDeleting(true);
    try {
      await deleteSpace(space.id);
      if (typeof window !== "undefined") {
        localStorage.removeItem("last_created_space");
      }
      toast.success("Space deleted");
      router.push("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to delete space");
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleRecover = async () => {
    if (recoveryKey.length !== 20 || isRecovering) return;
    setIsRecovering(true);
    try {
      const recovered = await recoverSpace(space.slug, recoveryKey);
      if (!recovered) {
        toast.error("That recovery key is not valid");
        return;
      }
      localStorage.setItem(`woff_recovery_${space.slug}`, recoveryKey);
      toast.success("Ownership recovered");
      setRecoveryDialogOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Recovery failed");
    } finally {
      setIsRecovering(false);
    }
  };

  return (
    <>
      {/* Share & QR Code Modal */}
      <Dialog open={shareModalOpen} onOpenChange={setShareModalOpen}>
        <DialogContent className="sm:max-w-md border border-orange-500/20 bg-white/95 dark:bg-[#0c0c0e]/95 backdrop-blur-xl shadow-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-xl font-bold">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500 dark:bg-orange-500/20 dark:text-orange-400">
                <Share className="h-5 w-5" />
              </div>
              Share Space
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="flex justify-center py-4">
              <div className="relative group p-1.5 rounded-[24px] bg-gradient-to-br from-orange-500/30 via-orange-500/10 to-transparent">
                <div className="relative p-4 bg-white dark:bg-[#151518] rounded-[18px] border border-orange-500/35 shadow-lg flex flex-col items-center">
                  {qrCodeUrl ? (
                    <Image
                      src={qrCodeUrl}
                      alt="QR Code for space"
                      width={192}
                      height={192}
                      className="w-48 h-48 block rounded-lg select-none"
                      unoptimized
                    />
                  ) : (
                    <div className="w-48 h-48 flex items-center justify-center bg-zinc-50 dark:bg-zinc-900 rounded-lg">
                      <Loader2 className="h-8 w-8 text-orange-500 animate-spin" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Share link
              </label>
              <div className="flex gap-2.5">
                <div className="flex-1 px-4 py-3 bg-zinc-50 dark:bg-[#18181b]/50 rounded-xl text-sm font-mono text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-white/[0.06] select-all truncate flex items-center">
                  {shareHost}/{space.slug}
                </div>
                <Button
                  onClick={handleCopyLink}
                  className={`px-5 rounded-xl font-medium transition-all shrink-0 flex items-center gap-1.5 ${
                    copied
                      ? "bg-green-600 hover:bg-green-700 text-white"
                      : "bg-[#ff5a00] hover:bg-[#ff5a00]/95 text-white"
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      <span>Copy</span>
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Anyone with this 4-digit code or link can join this space
              </p>
            </div>

            <div className="text-center pt-4 border-t border-border flex items-center justify-center gap-2">
              <span className="relative flex h-2 w-2">
                {connectionStatus === "connected" && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    connectionStatus === "connected"
                      ? "bg-emerald-500"
                      : "bg-amber-500"
                  }`}
                />
              </span>
              <span className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
                {connectionStatus === "connected"
                  ? "Live sharing active"
                  : "Connecting…"}
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Owner Recovery Dialog */}
      <Dialog open={recoveryDialogOpen} onOpenChange={setRecoveryDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-orange-500" />
              Recover space ownership
            </DialogTitle>
            <DialogDescription>
              Enter the 20-character recovery key saved when this space was created to restore creator controls. It cannot restore deleted files or notes.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={recoveryKey}
            onChange={(e) =>
              setRecoveryKey(
                e.target.value
                  .toUpperCase()
                  .replace(/[^A-F0-9]/g, "")
                  .slice(0, 20),
              )
            }
            placeholder="20-character recovery key"
            className="font-mono uppercase tracking-wider"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRecoveryDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={recoveryKey.length !== 20 || isRecovering}
              onClick={handleRecover}
              className="bg-[#ff5a00] hover:bg-[#e04f00] text-white"
            >
              {isRecovering && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Recover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Space Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete Space
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this space? All notes, files, images,
              and chat messages will be permanently removed.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSpace}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {isDeleting ? "Deleting…" : "Delete Space"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mobile Settings Dialog */}
      {mobileSettingsOpen !== undefined && setMobileSettingsOpen && (
        <Dialog open={mobileSettingsOpen} onOpenChange={setMobileSettingsOpen}>
          <DialogContent className="w-[calc(100%-2rem)] max-w-sm overflow-hidden p-4 sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Settings</DialogTitle>
              <DialogDescription>
                Space settings and preferences
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              {isPro && (
                <div className="flex items-center justify-between rounded-lg bg-purple-500/10 p-3">
                  <div className="text-sm font-medium">Admin space</div>
                  <div className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                    PRO
                  </div>
                </div>
              )}

              {isCreator ? (
                <>
                  {ownerRecoveryKey && (
                    <div className="rounded-lg border bg-muted/40 p-2">
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Recovery key
                      </div>
                      <div className="flex w-full items-center justify-between gap-2 font-mono text-[11px]">
                        <span className="truncate">{ownerRecoveryKey}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => {
                            navigator.clipboard.writeText(ownerRecoveryKey);
                            toast.success("Recovery key copied");
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      setMobileSettingsOpen(false);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Space
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => {
                    setMobileSettingsOpen(false);
                    setRecoveryDialogOpen(true);
                  }}
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  Recover ownership
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
