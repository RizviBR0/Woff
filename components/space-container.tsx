"use client";

import {
  Fragment,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useId,
} from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Copy,
  Check,
  Share,
  Settings,
  X,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  Wifi,
  WifiOff,
  ArrowDown,
  KeyRound,
  Trash2,
  Clock3,
  ChevronDown,
} from "lucide-react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { type Space, recoverSpace, createRoomInvitation, setRoomAccess, rotateRoomCode, recordRoomEvent, rotateRoomRecoveryKey } from "@/lib/actions";
import { roomSharePath } from "@/lib/room-links";
import { roomDisplayName, roomPageTitle } from "@/lib/room-title";
import { isLegacyRoomSlug } from "@/lib/room-slug";
import { updateRoomIdentity } from "@/lib/dashboard-actions";
import { rememberSpaceOwnership, rememberSpaceInvitation, migrateRoomBrowserState, readSpaceInvitation, readSpaceRecoveryKey, writeBrowserValue, removeBrowserValue } from "@/lib/space-recovery";
import { Composer } from "./composer";
import { EntryCard, type Entry } from "./entry-card";
import { ProgressiveBlur } from "@/components/ui/progressive-blur";
import { Logo } from "./logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { useSpaceSound } from "@/lib/hooks/use-space-sound";
import { useSpaceRealtime } from "@/lib/hooks/use-space-realtime";
import { SpaceModals } from "@/components/space/space-modals";
import { RoomSharingControls } from "@/components/space/room-sharing-controls";
import { useClientNow } from "@/lib/hooks/use-client-now";

const ActivitySidebar = dynamic(
  () => import("./activity-sidebar").then((module) => module.ActivitySidebar),
  { ssr: false },
);

interface SpaceContainerProps {
  space: Space;
  initialEntries: Entry[];
  currentDeviceId?: string | null;
  currentDisplayName: string;
}

const SIDEBAR_COLLAPSED_W = 60;
const SIDEBAR_EXPANDED_W = 240;

export function SpaceContainer({
  space: initialSpace,
  initialEntries,
  currentDeviceId,
  currentDisplayName,
}: SpaceContainerProps) {
  const router = useRouter();
  const clientNow = useClientNow(30_000);
  const [space, setSpace] = useState(initialSpace);
  const roomDetailsId = useId();
  const roomName = roomDisplayName(space);
  const pageTitle = roomPageTitle(space);
  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);
  const currentSpaceRef = useRef(space);
  currentSpaceRef.current = space;
  useEffect(() => { setSpace(initialSpace); }, [initialSpace]);
  const handleRoomUpdate = useCallback((next: Space) => {
    const previous = currentSpaceRef.current;
    if (next.id !== previous.id) return;
    const updated = { ...next, can_customize_identity: next.can_customize_identity ?? previous.can_customize_identity };
    migrateRoomBrowserState(previous, updated);
    currentSpaceRef.current = updated;
    setSpace(updated);
    if (previous.slug !== next.slug) router.replace(`/${next.slug}`);
  }, [router]);
  const prefersReducedMotion = useReducedMotion();
  const { playMessageChime } = useSpaceSound();

  const {
    entries,
    setEntries,
    handleNewEntry,
    handleReplaceEntry,
    handleUpdateEntry,
    handleRemoveEntry,
    connectionStatus,
    onlineCount,
    newItemsCount,
    firstUnseenEntryId,
    unseenMessageCount,
    scrollToBottom,
  } = useSpaceRealtime({
    space,
    initialEntries,
    currentDeviceId,
    onIncomingMessage: playMessageChime,
    onRoomUpdated: handleRoomUpdate,
  });

  const hasPosted = entries.length > 0;
  const [keepInitialComposerDuringUpload, setKeepInitialComposerDuringUpload] =
    useState(false);
  const [copied, setCopied] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const qrGenerationRef = useRef(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [recoveryDialogOpen, setRecoveryDialogOpen] = useState(false);
  const [ownerRecoveryKey, setOwnerRecoveryKey] = useState("");
  const [shareHost, setShareHost] = useState("woff.space");
  const [inviteToken, setInviteToken] = useState(space.invite_token || "");
  const [accessBusy, setAccessBusy] = useState(false);

  // Sidebar state
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Track if we're on desktop for sidebar offset
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    setShareHost(window.location.host);
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const isCreator = Boolean(
    currentDeviceId && space.creator_device_id === currentDeviceId,
  );
  const isPro = space.is_pro || false;
  const customRoomUrl = !isLegacyRoomSlug(space.slug);
  const roomExpired = Boolean(space.expires_at && clientNow !== null && Date.parse(space.expires_at) <= clientNow);
  const canPost = !roomExpired && (isCreator || (space.can_write ?? space.delivery_mode !== "read_only"));
  const sharePath = roomSharePath(space.slug, inviteToken);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = space.invite_token || params.get("it") || readSpaceInvitation(space);
    if (/^[a-f0-9]{64}$/.test(token)) {
      setInviteToken(token);
      rememberSpaceInvitation(space, token);
    }
    if (params.has("it")) {
      params.delete("it");
      window.history.replaceState(window.history.state, "", window.location.pathname + (params.size ? `?${params}` : ""));
    }
    if (!token && isCreator) {
      void createRoomInvitation(space.id).then((invitation) => {
        setInviteToken(invitation.token);
        rememberSpaceInvitation(space, invitation.token, invitation.access_version);
      }).catch(() => toast.error("Unable to prepare an invitation. Try Share again after reconnecting."));
    }
  }, [isCreator, space]);

  const rotateInvitation = async () => {
    setAccessBusy(true);
    try {
      const invitation = await createRoomInvitation(space.id, true);
      setInviteToken(invitation.token);
      const updated = { ...space, code_enabled: false, pairing_expires_at: null, invite_token: invitation.token, access_version: invitation.access_version };
      rememberSpaceInvitation(updated, invitation.token, invitation.access_version);
      handleRoomUpdate(updated);
      toast.success("Recipient access revoked. Share the new link.");
    }
    finally { setAccessBusy(false); }
  };
  const updateRoomAccess = async (codeEnabled: boolean, expiresAt?: string | null) => {
    const updated = await setRoomAccess(space.id, { codeEnabled, ...(expiresAt !== undefined ? { expiresAt } : {}) });
    handleRoomUpdate(updated);
    if (expiresAt !== undefined) {
      try {
        const invitation = await createRoomInvitation(space.id);
        setInviteToken(invitation.token);
        rememberSpaceInvitation(updated, invitation.token, invitation.access_version);
        handleRoomUpdate({ ...updated, invite_token: invitation.token, invitation_id: invitation.id });
      } catch {
        setInviteToken("");
        removeBrowserValue(`woff_invite_${updated.slug}`);
        handleRoomUpdate({ ...updated, invite_token: "" });
        throw new Error("Time limit saved. Reopen Share to create an invitation link.");
      }
    }
    toast.success(expiresAt === undefined ? (codeEnabled ? "Room code opened" : "Room code closed") : expiresAt ? "Time limit updated" : "Time limit removed");
  };

  const changeRoomCode = async (code?: string) => {
    const updated = await rotateRoomCode(space.id, code);
    if (isCreator && ownerRecoveryKey) rememberSpaceOwnership({ ...updated, recovery_key: ownerRecoveryKey, invite_token: inviteToken });
    handleRoomUpdate(updated);
    toast.success("Room code changed");
  };

  const changeRoomIdentity = async (name: string, slug: string) => {
    const result = await updateRoomIdentity(space.id, name, slug);
    if (!result.ok) throw new Error(result.error);
    handleRoomUpdate(result.space);
    toast.success("Room saved");
  };

  useEffect(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const rk = searchParams.get("rk");
      if (rk) {
        writeBrowserValue(`woff_recovery_${space.slug}`, rk);
        writeBrowserValue("last_created_space", space.slug);
        writeBrowserValue("last_room", space.slug);
        setOwnerRecoveryKey(rk);
        rememberSpaceOwnership({ ...space, recovery_key: rk });
        searchParams.delete("rk");
        searchParams.delete("created");
        const clean = searchParams.toString();
        const newUrl = window.location.pathname + (clean ? `?${clean}` : "");
        window.history.replaceState({}, "", newUrl);
      } else {
        setOwnerRecoveryKey(
          readSpaceRecoveryKey(space),
        );
      }
    } catch {
      setOwnerRecoveryKey(
        readSpaceRecoveryKey(space),
      );
    }

    if (isCreator) return;
    const savedKey = readSpaceRecoveryKey(space);
    if (!savedKey) return;
    void recoverSpace(space.slug, savedKey)
      .then((recovered) => {
        if (recovered) { rememberSpaceOwnership({ ...recovered.space, recovery_key: recovered.recovery_key }); removeBrowserValue(`woff_invite_${space.slug}`); setInviteToken(""); if (window.location.pathname === `/${space.slug}`) router.refresh(); else router.replace(`/${space.slug}`); }
        else removeBrowserValue(`woff_recovery_${space.slug}`);
      })
      .catch(() => {
        // Keep saved key for retry if network unavailable
      });
  }, [isCreator, router, space]);

  const codeOpen = space.code_enabled !== false
    && (!space.pairing_expires_at || clientNow === null || Date.parse(space.pairing_expires_at) > clientNow)
    && (!space.expires_at || clientNow === null || Date.parse(space.expires_at) > clientNow);
  const expiryLabel = useMemo(() => {
    if (!space.expires_at) return space.expiry_mode === "inactivity" ? "Inactivity limit" : "";
    if (clientNow === null) return "Time limit";
    const minutes = Math.ceil((Date.parse(space.expires_at) - Date.now()) / 60_000);
    if (minutes <= 0) return "Expired";
    if (minutes < 60) return `${minutes}m left`;
    if (minutes < 1440) return `${Math.ceil(minutes / 60)}h left`;
    return `${Math.ceil(minutes / 1440)}d left`;
  }, [clientNow, space.expires_at, space.expiry_mode]);
  const sidebarWidth = sidebarExpanded ? SIDEBAR_EXPANDED_W : SIDEBAR_COLLAPSED_W;

  const handleComposerUploadStateChange = useCallback(
    (active: boolean) => {
      setKeepInitialComposerDuringUpload((current) =>
        active ? current || !hasPosted : false,
      );
    },
    [hasPosted],
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(space.slug);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = space.slug;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRecoveryAction = async () => {
    if (isCreator && ownerRecoveryKey) {
      try {
        await navigator.clipboard.writeText(ownerRecoveryKey);
        toast.success("Recovery key copied");
      } catch { toast.error("Unable to copy recovery key"); }
      return;
    }
    setMobileSidebarOpen(false);
    setRecoveryDialogOpen(true);
  };

  const openMobileSettings = () => {
    setMobileSidebarOpen(false);
    setMobileSettingsOpen(true);
  };

  const generateQRCode = useCallback(async (url: string) => {
    const request = ++qrGenerationRef.current;
    try {
      const QRCode = (await import("qrcode")).default;
      const qrUrl = await QRCode.toDataURL(url, {
        margin: 2,
        width: 256,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      });
      if (request === qrGenerationRef.current) setQrCodeUrl(qrUrl);
    } catch (error) {
      console.error("Error generating QR code:", error);
    }
  }, []);

  useEffect(() => {
    if (!shareModalOpen) return;
    setQrCodeUrl("");
    void generateQRCode(`${window.location.origin}${sharePath}`);
  }, [generateQRCode, shareModalOpen, sharePath]);

  const handleShare = useCallback(async () => {
    try {
      let token = inviteToken;
      if (space.secure_invites && !token) {
        if (!isCreator) { toast.info("Ask the owner for an invitation link to share."); return; }
        const invitation = await createRoomInvitation(space.id);
        token = invitation.token;
        setInviteToken(token);
        rememberSpaceInvitation(space, token, invitation.access_version);
      }
      const shareUrl = `${window.location.origin}${roomSharePath(space.slug, token)}`;
      setShareModalOpen(true);
      setMobileSidebarOpen(false);
      void generateQRCode(shareUrl);
      void recordRoomEvent(space.id, "share_initiated");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to prepare invitation"); }
  }, [inviteToken, isCreator, space, generateQRCode]);

  const renderSettingsContent = (closeSettings: () => void) => (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Settings</h4>
        <AnimatedThemeToggler className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted" />
      </div>
      <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => { closeSettings(); void handleShare(); }}><Share className="h-4 w-4" />Sharing & time limit</Button>
      {isCreator ? (
        <>
          <Link href="/dashboard" className="block rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">Sender dashboard</Link>
          <details className="border-t pt-3">
            <summary className="cursor-pointer text-xs text-muted-foreground">Recovery key</summary>
            <div className="mt-3 space-y-2.5">
              {ownerRecoveryKey && (
                <Button
                  variant="outline"
                  className="h-auto flex w-full items-center justify-between gap-2 rounded-lg bg-muted/40 p-2.5 font-mono text-[11px] font-normal"
                  onClick={() => void handleRecoveryAction()}
                  aria-label="Copy recovery key"
                >
                  <span className="min-w-0 break-all text-left">{ownerRecoveryKey}</span>
                  <Copy className="h-3.5 w-3.5 shrink-0" />
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={accessBusy} onClick={async () => { setAccessBusy(true); try { const recovery_key = await rotateRoomRecoveryKey(space.id); rememberSpaceOwnership({ ...space, recovery_key }); setOwnerRecoveryKey(recovery_key); toast.success("Recovery key replaced. Save the new key."); } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to replace key"); } finally { setAccessBusy(false); } }} className="h-8 w-full text-xs">{accessBusy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Replace key</Button>
            </div>
          </details>
          <div className="border-t pt-2"><Button variant="ghost" size="sm" className="w-full justify-start gap-2 px-2 text-red-500 hover:bg-red-500/10 hover:text-red-600" onClick={() => { closeSettings(); setDeleteDialogOpen(true); }}><Trash2 className="h-4 w-4" />Delete room</Button></div>
        </>
      ) : <Button variant="ghost" size="sm" className="w-full justify-start gap-2 px-2" onClick={() => { closeSettings(); setRecoveryDialogOpen(true); }}><KeyRound className="h-4 w-4" />Recover ownership</Button>}
    </div>
  );

  const SidebarButton = ({
    icon: Icon,
    label,
    onClick,
    active,
    className,
    badge,
  }: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    onClick?: () => void;
    active?: boolean;
    className?: string;
    badge?: React.ReactNode;
  }) => (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            onClick={onClick}
            aria-label={label}
            className={`
              h-auto group relative flex items-center gap-3 w-full rounded-xl transition-all duration-200
              ${sidebarExpanded ? "px-3 py-2.5 justify-start" : "px-0 py-2.5 justify-center"}
              ${
                active
                  ? "bg-zinc-200 text-zinc-950 dark:bg-white/10 dark:text-white hover:bg-zinc-200 dark:hover:bg-white/10"
                  : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/5"
              }
              ${className || ""}
            `}
          >
            <div className="relative flex-shrink-0">
              <Icon className="h-[18px] w-[18px]" />
              {badge && !sidebarExpanded && (
                <div className="absolute -top-1 -right-1">{badge}</div>
              )}
            </div>
            {sidebarExpanded && (
              <span className="text-sm font-medium truncate">{label}</span>
            )}
            {badge && sidebarExpanded && <div className="ml-auto">{badge}</div>}
          </Button>
        </TooltipTrigger>
        {!sidebarExpanded && (
          <TooltipContent side="right" sideOffset={8}>
            {label}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );

  const renderSidebarContent = (isMobile: boolean = false) => {
    const isCurrentlyExpanded = isMobile || sidebarExpanded;

    return (
      <div className="flex flex-col h-full bg-zinc-50 dark:bg-[#111113]">
        {/* Top: Logo + Toggle */}
        <div
          className={`flex items-center ${
            isCurrentlyExpanded ? "justify-between px-4" : "justify-center"
          } h-14 flex-shrink-0`}
        >
          {isCurrentlyExpanded ? (
            <div className="flex items-center gap-2">
              <Link href={`/?room=${space.slug}`} title="Back to home">
                <Logo
                  width={90}
                  height={28}
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                />
              </Link>
              {isPro && (
                <Badge className="bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-500 dark:to-pink-500 text-white border-none text-[9px] font-black px-1.5 py-1 rounded-full tracking-wider leading-none shadow-[0_2px_8px_rgba(168,85,247,0.25)] select-none hover:from-purple-600 hover:to-pink-600">
                  PRO
                </Badge>
              )}
            </div>
          ) : null}
          {!isMobile && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarExpanded((prev) => !prev)}
              aria-label={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
              aria-expanded={sidebarExpanded}
              className="hidden md:flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/5 transition-colors"
            >
              {sidebarExpanded ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeftOpen className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>

        <div className="mx-3 h-px bg-zinc-200 dark:bg-white/[0.06]" />

        <div className={`flex flex-col gap-1.5 py-3 ${isCurrentlyExpanded ? "px-3" : "px-2"}`}>
          {isCurrentlyExpanded ? (
            <>
              <span className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{customRoomUrl ? "Room address" : "Room code"}</span>
              <Button
                variant="outline"
                type="button"
                onClick={handleCopy}
                className="h-auto flex w-full items-center justify-between gap-2 rounded-xl border border-border/70 px-3 py-2.5 font-normal hover:bg-muted"
                aria-label="Copy room code"
              >
                <span className={`flex min-w-0 items-center gap-2 font-mono text-sm font-semibold ${customRoomUrl ? "" : "tracking-widest"}`}>
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
                  <span className="truncate">{space.slug}</span>
                </span>
                <Badge
                  variant="outline"
                  className={`shrink-0 px-2 py-0.5 text-[10px] font-normal ${
                    codeOpen
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {codeOpen ? "Open" : "Closed"}
                </Badge>
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => void handleShare()}
                className="h-auto w-full justify-start gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground font-normal"
              >
                <Share className="h-[18px] w-[18px]" />
                Share room
              </Button>
              {isCreator && (
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => void handleRecoveryAction()}
                  className="h-auto w-full justify-start gap-3 rounded-xl px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground font-normal"
                >
                  <KeyRound className="h-[18px] w-[18px]" />
                  {ownerRecoveryKey ? "Copy recovery key" : "Recover ownership"}
                </Button>
              )}
            </>
          ) : <><SidebarButton icon={copied ? Check : Copy} label={`Copy room code ${space.slug}`} onClick={handleCopy} /><SidebarButton icon={Share} label="Share room" onClick={() => void handleShare()} />{isCreator && <SidebarButton icon={KeyRound} label="Copy recovery key" onClick={() => void handleRecoveryAction()} />}</>}
        </div>

        {/* Embedded searchable files browser */}
        {isCurrentlyExpanded ? (
          <div className="flex-1 min-h-0 py-2 flex flex-col border-t border-b border-zinc-200 dark:border-white/[0.06] my-2 overflow-hidden">
            <ActivitySidebar entries={entries} isOpen={true} spaceSlug={space.slug} />
          </div>
        ) : (
          <div className="flex-1" />
        )}

        {/* Settings button */}
        <div
          className={`flex flex-col gap-1 py-3 ${
            isCurrentlyExpanded ? "px-3" : "px-2"
          }`}
        >
          {isMobile ? (
            <Button
              variant="ghost"
              onClick={openMobileSettings}
              className="h-auto w-full justify-start gap-3 rounded-xl px-3 py-2 text-sm text-zinc-500 transition-all duration-200 hover:bg-zinc-200/50 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white font-normal"
            >
              <Settings className="h-[18px] w-[18px] shrink-0" />
              <span className="text-sm font-medium">Settings</span>
            </Button>
          ) : (
            <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
              <PopoverTrigger asChild>
                <div>
                  {isCurrentlyExpanded ? (
                    <Button
                      variant="ghost"
                      onClick={() => setSettingsOpen(true)}
                      className={`h-auto w-full justify-start gap-3 rounded-xl px-3 py-2 text-sm text-zinc-500 transition-all duration-200 hover:bg-zinc-200/50 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white font-normal ${
                        settingsOpen
                          ? "bg-zinc-200 text-zinc-950 dark:bg-white/10 dark:text-white hover:bg-zinc-200 dark:hover:bg-white/10"
                          : ""
                      }`}
                    >
                      <Settings className="h-[18px] w-[18px] shrink-0" />
                      <span className="text-sm font-medium">Settings</span>
                    </Button>
                  ) : (
                    <SidebarButton
                      icon={Settings}
                      label="Settings"
                      onClick={() => setSettingsOpen(true)}
                      active={settingsOpen}
                    />
                  )}
                </div>
              </PopoverTrigger>
              <PopoverContent
                className="w-64 max-h-[calc(100dvh-2rem)] overflow-y-auto p-0"
                side="right"
                align="end"
                sideOffset={8}
              >
                {renderSettingsContent(() => setSettingsOpen(false))}
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 z-50 bg-zinc-50 dark:bg-[#111113] border-r border-zinc-200 dark:border-white/[0.06] transition-all duration-300 ease-in-out"
        style={{ width: sidebarWidth }}
      >
        {renderSidebarContent(false)}
      </aside>

      {/* Mobile hamburger button */}
      <Button
        variant="outline"
        size="icon"
        onClick={() => setMobileSidebarOpen(true)}
        aria-label="Open sidebar"
        className="md:hidden fixed top-2 left-3 z-40 h-10 w-10 rounded-lg bg-zinc-50/90 dark:bg-[#1a1a1a]/90 backdrop-blur-md border border-zinc-200 dark:border-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-white/5 transition-colors shadow-sm"
      >
        <Menu className="h-4 w-4" />
      </Button>

      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-60 bg-zinc-50 dark:bg-[#111113] border-r border-zinc-200 dark:border-white/[0.06] animate-in slide-in-from-left duration-200 flex flex-col">
            <div className="absolute top-3 right-3 z-10">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileSidebarOpen(false)}
                aria-label="Close sidebar"
                className="h-7 w-7 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-950 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {renderSidebarContent(true)}
          </aside>
        </div>
      )}

      {/* Main content area */}
      <div className="min-h-screen min-w-0 flex-1 transition-all duration-300">
        <main
          className="flex min-h-svh flex-col transition-all duration-300"
          style={{ marginLeft: isDesktop ? sidebarWidth : 0 }}
        >
          <header className="sticky top-0 z-30 h-14 shrink-0 border-b border-border/60 bg-background/85 backdrop-blur-xl">
            <div className="mx-auto flex h-full max-w-4xl items-center justify-between gap-3 pl-16 pr-3 sm:gap-5 sm:pr-4 md:px-4">
              <Popover>
                <h1 className="min-w-0 flex-1">
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Room details: ${roomName}`}
                      className="group -ml-2 inline-flex h-10 max-w-full items-center gap-1.5 rounded-lg px-2 text-left text-[15px] font-semibold tracking-tight transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted/60 sm:text-base"
                    >
                      <span dir="auto" className="min-w-0 truncate">{roomName}</span>
                      <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                    </button>
                  </PopoverTrigger>
                </h1>
                <PopoverContent
                  align="start"
                  sideOffset={8}
                  collisionPadding={12}
                  aria-labelledby={roomDetailsId}
                  className="w-80 max-w-[calc(100vw-1.5rem)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto rounded-xl border-border/70 p-4 shadow-xl"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2 id={roomDetailsId} className="text-xs font-medium text-muted-foreground">Room details</h2>
                    {isPro && <Badge className="rounded-md border-orange-500/20 bg-orange-500/10 px-1.5 py-0 text-[9px] font-semibold tracking-wide text-orange-600 hover:bg-orange-500/10 dark:text-orange-400">PRO</Badge>}
                  </div>
                  <p dir="auto" className="mt-2 text-base font-semibold leading-relaxed [overflow-wrap:anywhere]">{roomName}</p>
                  <div className="mt-4 flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">{customRoomUrl ? "Room address" : "Room code"}</span>
                    <span className={`inline-flex items-center gap-1.5 ${codeOpen ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${codeOpen ? "bg-emerald-500" : "bg-zinc-400"}`} />
                      {codeOpen ? "Code open" : "Code closed"}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={handleCopy}
                    aria-label={`Copy room ${customRoomUrl ? "address" : "code"} ${space.slug}`}
                    className="mt-2 h-auto min-h-11 w-full justify-between gap-3 rounded-lg bg-muted/25 px-3 py-2 text-left"
                  >
                    <span dir="ltr" className={`min-w-0 whitespace-normal font-mono text-sm [overflow-wrap:anywhere] ${customRoomUrl ? "" : "tracking-widest"}`}>{space.slug}</span>
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-normal text-muted-foreground" aria-live="polite">
                      {copied ? <Check aria-hidden="true" className="h-3.5 w-3.5 text-emerald-500" /> : <Copy aria-hidden="true" className="h-3.5 w-3.5" />}
                      {copied ? "Copied" : "Copy"}
                    </span>
                  </Button>
                  <dl className="mt-4 space-y-2 border-t border-border/60 pt-3 text-xs">
                    {expiryLabel && <div className="flex items-start justify-between gap-4">
                      <dt className="shrink-0 text-muted-foreground">Time limit</dt>
                      <dd className="text-right leading-relaxed">{space.expires_at && clientNow !== null ? new Date(space.expires_at).toLocaleString() : expiryLabel}</dd>
                    </div>}
                    <div className="flex items-start justify-between gap-4">
                      <dt className="shrink-0 text-muted-foreground">You are</dt>
                      <dd dir="auto" className="text-right [overflow-wrap:anywhere]">{currentDisplayName}</dd>
                    </div>
                  </dl>
                </PopoverContent>
              </Popover>
              <div className="flex shrink-0 items-center gap-3">
                {expiryLabel && <span className="hidden items-center gap-1.5 whitespace-nowrap text-xs text-orange-600 sm:inline-flex dark:text-orange-400"><Clock3 aria-hidden="true" className="h-3.5 w-3.5" />{expiryLabel}</span>}
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground" role="status">
                    {connectionStatus === "connected" ? <Wifi className="h-3 w-3 text-emerald-500" /> : <WifiOff className="h-3 w-3 text-amber-500" />}
                    {connectionStatus === "connected" ? `${onlineCount} online` : connectionStatus === "connecting" ? "Connecting" : "Offline"}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-10 w-10 gap-0 rounded-lg border-border/70 bg-muted/25 p-0 shadow-sm sm:h-8 sm:w-auto sm:gap-2 sm:px-3"
                  onClick={handleShare}
                  aria-label="Share room"
                >
                  <Share className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Share</span>
                </Button>
              </div>
            </div>
          </header>

          <div className="container mx-auto flex flex-1 flex-col px-4">
            {(space.welcome_text || !canPost) && <section aria-label="Room information" className="mx-auto mt-6 w-full max-w-2xl rounded-xl border border-border/60 bg-muted/25 px-4 py-3">{space.welcome_text && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{space.welcome_text}</p>}{!canPost && <p className={`${space.welcome_text ? "mt-2 " : ""}text-xs text-muted-foreground`}>{roomExpired ? "This room has closed." : "Read-only room"}</p>}</section>}
            {canPost && (!hasPosted || keepInitialComposerDuringUpload) ? (
              <div className="flex flex-1 items-center justify-center py-10 sm:py-12">
                <div className="w-full max-w-4xl">
                  <Composer
                    spaceId={space.id}
                    spaceSlug={space.slug}
                    onNewEntry={handleNewEntry}
                    onUpdateEntry={handleUpdateEntry}
                    onReplaceEntry={handleReplaceEntry}
                    onRemoveEntry={handleRemoveEntry}
                    onUploadStateChange={handleComposerUploadStateChange}
                    currentDeviceId={currentDeviceId}
                    centered={true}
                  />
                  <div className="mt-4 text-center text-sm text-muted-foreground">
                    Paste to create • Drop to upload • Type to write
                  </div>
                </div>
              </div>
            ) : (
              <div className="pb-40">
                <div className="mx-auto max-w-2xl space-y-6 py-8">
                  {entries.map((entry) => (
                    <Fragment key={entry.id}>
                      <AnimatePresence initial={false}>
                        {entry.id === firstUnseenEntryId && (
                          <motion.div
                            key={`unseen-divider-${entry.id}`}
                            initial={
                              prefersReducedMotion
                                ? { opacity: 0 }
                                : { opacity: 0, height: 0, y: 8, scale: 0.98 }
                            }
                            animate={{ opacity: 1, height: "auto", y: 0, scale: 1 }}
                            exit={
                              prefersReducedMotion
                                ? { opacity: 0 }
                                : { opacity: 0, height: 0, y: -6, scale: 0.98 }
                            }
                            transition={{
                              duration: prefersReducedMotion ? 0.12 : 0.34,
                              ease: [0.22, 1, 0.36, 1],
                            }}
                            className="flex origin-center items-center gap-3 overflow-hidden px-3 py-1"
                            role="separator"
                            aria-label={`${unseenMessageCount} new ${
                              unseenMessageCount === 1 ? "message" : "messages"
                            }`}
                          >
                            <span className="h-px flex-1 bg-orange-500/35" />
                            <span className="rounded-full bg-orange-500 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white shadow-sm">
                              New {unseenMessageCount > 1 ? `· ${unseenMessageCount}` : ""}
                            </span>
                            <span className="h-px flex-1 bg-orange-500/35" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <EntryCard
                        canWrite={canPost}
                        entry={entry}
                        spaceSlug={space.slug}
                        currentDeviceId={currentDeviceId || null}
                        onDelete={handleRemoveEntry}
                        onUpdate={handleUpdateEntry}
                        onReplace={handleReplaceEntry}
                        onNewEntry={handleNewEntry}
                      />
                    </Fragment>
                  ))}
                </div>

                {/* Bottom composer */}
                {canPost && <div
                  className="fixed bottom-0 right-0 pb-safe transition-all animate-in slide-in-from-bottom-5 duration-200 z-30 bg-gradient-to-t from-white/30 via-white/10 to-transparent dark:from-[#030303]/30 dark:via-[#030303]/10 dark:to-transparent"
                  style={{ left: isDesktop ? sidebarWidth : 0 }}
                >
                  <ProgressiveBlur
                    height="100%"
                    position="bottom"
                    className="-z-10"
                  />
                  <div className="container mx-auto px-4 pt-1.5 pb-4 relative z-10">
                    <div className="mx-auto max-w-2xl">
                      <Composer
                        spaceId={space.id}
                        spaceSlug={space.slug}
                        onNewEntry={handleNewEntry}
                        onUpdateEntry={handleUpdateEntry}
                        onReplaceEntry={handleReplaceEntry}
                        onRemoveEntry={handleRemoveEntry}
                        onUploadStateChange={handleComposerUploadStateChange}
                        currentDeviceId={currentDeviceId}
                        centered={false}
                      />
                    </div>
                  </div>
                </div>}
              </div>
            )}
          </div>
        </main>
      </div>

      {newItemsCount > 0 && (
        <Button
          onClick={scrollToBottom}
          className="fixed bottom-28 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background shadow-xl h-auto"
        >
          <ArrowDown className="h-3.5 w-3.5" />
          {newItemsCount} new {newItemsCount === 1 ? "item" : "items"}
        </Button>
      )}

      {/* Reusable Modals & Dialogs */}
      <SpaceModals
        space={space}
        isCreator={isCreator}
        shareModalOpen={shareModalOpen}
        setShareModalOpen={setShareModalOpen}
        qrCodeUrl={qrCodeUrl}
        shareHost={shareHost}
        sharePath={sharePath}
        sharingControls={<RoomSharingControls space={space} isCreator={isCreator} codeOpen={codeOpen} onAccessChange={updateRoomAccess} onRotateCode={changeRoomCode} onRevokeAccess={rotateInvitation} onIdentityChange={changeRoomIdentity} />}
        settingsContent={renderSettingsContent(() => setMobileSettingsOpen(false))}
        deleteDialogOpen={deleteDialogOpen}
        setDeleteDialogOpen={setDeleteDialogOpen}
        recoveryDialogOpen={recoveryDialogOpen}
        setRecoveryDialogOpen={setRecoveryDialogOpen}
        mobileSettingsOpen={mobileSettingsOpen}
        setMobileSettingsOpen={setMobileSettingsOpen}
      />
    </div>
  );
}
