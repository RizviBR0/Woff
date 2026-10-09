"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { deleteSpace, recoverSpace, recordRoomEvent, type Space } from "@/lib/actions";
import { rememberSpaceOwnership, removeBrowserValue } from "@/lib/space-recovery";

interface SpaceModalsProps {
  space: Space;
  isCreator: boolean;
  shareModalOpen: boolean;
  setShareModalOpen: (open: boolean) => void;
  qrCodeUrl: string;
  shareHost: string;
  sharePath: string;
  sharingControls: ReactNode;
  settingsContent: ReactNode;
  deleteDialogOpen: boolean;
  setDeleteDialogOpen: (open: boolean) => void;
  recoveryDialogOpen: boolean;
  setRecoveryDialogOpen: (open: boolean) => void;
  mobileSettingsOpen?: boolean;
  setMobileSettingsOpen?: (open: boolean) => void;
}

export function SpaceModals({
  space,
  isCreator,
  shareModalOpen,
  setShareModalOpen,
  qrCodeUrl,
  shareHost,
  sharePath,
  sharingControls,
  settingsContent,
  deleteDialogOpen,
  setDeleteDialogOpen,
  recoveryDialogOpen,
  setRecoveryDialogOpen,
  mobileSettingsOpen,
  setMobileSettingsOpen,
}: SpaceModalsProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [isRecovering, setIsRecovering] = useState(false);
  const shareDialogRef = useRef<HTMLDivElement>(null);
  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}${sharePath}`
    : `https://${shareHost}${sharePath}`;

  useEffect(() => { setCopied(false); }, [shareUrl]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copied to clipboard");
      void recordRoomEvent(space.id, "share_initiated");
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
    if (![20, 32].includes(recoveryKey.length) || isRecovering) return;
    setIsRecovering(true);
    try {
      const recovered = await recoverSpace(space.slug, recoveryKey);
      if (!recovered) {
        toast.error("That recovery key is not valid");
        return;
      }
      rememberSpaceOwnership({ ...recovered.space, recovery_key: recovered.recovery_key });
      removeBrowserValue(`woff_invite_${space.slug}`);
      toast.success("Ownership recovered");
      setRecoveryDialogOpen(false);
      if (window.location.pathname === `/${space.slug}`) router.refresh(); else router.replace(`/${space.slug}`);
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
        <DialogContent ref={shareDialogRef} tabIndex={-1}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            shareDialogRef.current?.focus({ preventScroll: true });
          }}
          className="w-[calc(100%-2rem)] min-w-0 max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto border border-orange-500/20 bg-white/95 dark:bg-[#0c0c0e]/95 backdrop-blur-xl shadow-2xl rounded-2xl">
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-2.5 text-xl font-semibold">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500">
                <Share className="h-5 w-5" />
              </span>
              Share room
            </DialogTitle>
            <DialogDescription className="sr-only">Invite someone by link or code and manage room access.</DialogDescription>
          </DialogHeader>

          <div className="min-w-0 space-y-5">
            <div className="flex items-center gap-4 rounded-xl border border-border/70 p-3">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg bg-white p-1.5">
                {qrCodeUrl ? (
                  <Image src={qrCodeUrl} alt="Scan to join this room" width={88} height={88} className="h-[88px] w-[88px]" unoptimized />
                ) : <Loader2 className="h-5 w-5 animate-spin text-orange-500" />}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <label htmlFor="space-share-link" className="text-xs font-medium text-muted-foreground">Invitation link</label>
                <Input id="space-share-link" readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} className="h-8 w-full min-w-0 truncate rounded-lg bg-muted/30 font-mono text-[11px]" />
                <Button type="button" size="sm" onClick={handleCopyLink} className={`h-8 gap-1.5 rounded-lg text-xs ${copied ? "bg-emerald-600 hover:bg-emerald-700" : "bg-orange-500 hover:bg-orange-600"} text-white`}>
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy link"}
                </Button>
              </div>
            </div>
            {sharingControls}
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
              Enter your saved recovery key to restore creator controls. A successful recovery replaces the key. It cannot restore expired or deleted content.
            </DialogDescription>
          </DialogHeader>
          <label htmlFor="room-recovery-key" className="sr-only">Recovery key</label>
          <Input
            id="room-recovery-key"
            value={recoveryKey}
            onChange={(e) =>
              setRecoveryKey(
                e.target.value
                  .toUpperCase()
                  .replace(/[^A-F0-9]/g, "")
                  .slice(0, 32),
              )
            }
            placeholder="Recovery key"
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
              disabled={![20, 32].includes(recoveryKey.length) || isRecovering}
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
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">
                  Delete room
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  This action cannot be undone
                </p>
              </div>
            </div>
            <DialogDescription className="text-sm text-foreground/80 pt-2 leading-relaxed">
              Are you sure you want to delete this room? All notes, files, images,
              and contents will be permanently removed.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSpace}
              disabled={isDeleting}
              className="rounded-xl font-semibold"
            >
              {isDeleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {isDeleting ? "Deleting…" : "Delete room"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mobile Settings Dialog */}
      {mobileSettingsOpen !== undefined && setMobileSettingsOpen && (
        <Dialog open={mobileSettingsOpen} onOpenChange={setMobileSettingsOpen}>
          <DialogContent className="w-[calc(100%-2rem)] max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 sm:max-w-sm">
            <DialogHeader className="sr-only">
              <DialogTitle>Settings</DialogTitle>
              <DialogDescription>
                Space settings and preferences
              </DialogDescription>
            </DialogHeader>

            {settingsContent}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
