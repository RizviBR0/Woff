"use client";

import {
  Fragment,
  useState,
  useEffect,
  useCallback,
  useMemo,
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
} from "lucide-react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { type Space, recoverSpace } from "@/lib/actions";
import { getHoursUntilExpiry } from "@/lib/utils";
import { Composer } from "./composer";
import { EntryCard, type Entry } from "./entry-card";
import { ProgressiveBlur } from "@/components/ui/progressive-blur";
import { Logo } from "./logo";
import { Button } from "@/components/ui/button";
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
  space,
  initialEntries,
  currentDeviceId,
  currentDisplayName,
}: SpaceContainerProps) {
  const router = useRouter();
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
  });

  const hasPosted = entries.length > 0;
  const [keepInitialComposerDuringUpload, setKeepInitialComposerDuringUpload] =
    useState(false);
  const [copied, setCopied] = useState(false);
  const [navLinkCopied, setNavLinkCopied] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [recoveryDialogOpen, setRecoveryDialogOpen] = useState(false);
  const [ownerRecoveryKey, setOwnerRecoveryKey] = useState("");
  const [shareHost, setShareHost] = useState("woff.space");

  // Sidebar state
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // First time visitor onboarding guide
  const [showGuide, setShowGuide] = useState(false);
  const [guideStep, setGuideStep] = useState(1);

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

  const dismissGuide = useCallback(() => {
    setShowGuide(false);
    localStorage.setItem(`woff_space_guide_v2_${space.slug}`, "complete");
  }, [space.slug]);

  useEffect(() => {
    const guideKey = `woff_space_guide_v2_${space.slug}`;
    if (localStorage.getItem(guideKey)) return;

    setGuideStep(1);
    setShowGuide(true);
    if (window.matchMedia("(min-width: 768px)").matches) {
      setSidebarExpanded(true);
    } else {
      setMobileSidebarOpen(true);
    }
  }, [space.slug]);

  useEffect(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const rk = searchParams.get("rk");
      if (rk) {
        localStorage.setItem(`woff_recovery_${space.slug}`, rk);
        localStorage.setItem("last_created_space", space.slug);
        localStorage.setItem("last_room", space.slug);
        setOwnerRecoveryKey(rk);
        searchParams.delete("rk");
        searchParams.delete("created");
        const clean = searchParams.toString();
        const newUrl = window.location.pathname + (clean ? `?${clean}` : "");
        window.history.replaceState({}, "", newUrl);
      } else {
        setOwnerRecoveryKey(
          localStorage.getItem(`woff_recovery_${space.slug}`) || "",
        );
      }
    } catch {
      setOwnerRecoveryKey(
        localStorage.getItem(`woff_recovery_${space.slug}`) || "",
      );
    }

    if (isCreator) return;
    const savedKey = localStorage.getItem(`woff_recovery_${space.slug}`);
    if (!savedKey) return;
    void recoverSpace(space.slug, savedKey)
      .then((recovered) => {
        if (recovered) router.refresh();
        else localStorage.removeItem(`woff_recovery_${space.slug}`);
      })
      .catch(() => {
        // Keep saved key for retry if network unavailable
      });
  }, [isCreator, router, space.slug]);

  const hoursUntilExpiry = useMemo(() => {
    if (space.expires_at || space.last_activity_at) {
      return getHoursUntilExpiry(
        space.expires_at || space.last_activity_at,
        Boolean(space.expires_at),
      );
    }
    return 48;
  }, [space.expires_at, space.last_activity_at]);

  const expiryLabel = hoursUntilExpiry <= 0 ? "Expired" : `${hoursUntilExpiry}h`;
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

  const handleCopyNavLink = async () => {
    const roomLink = `${window.location.origin}/${space.slug}`;
    try {
      await navigator.clipboard.writeText(roomLink);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = roomLink;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    }
    setNavLinkCopied(true);
    toast.success("Room link copied");
    window.setTimeout(() => setNavLinkCopied(false), 2000);
  };

  const handleRecoveryAction = async () => {
    if (isCreator && ownerRecoveryKey) {
      await navigator.clipboard.writeText(ownerRecoveryKey);
      toast.success("Recovery key copied");
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
      setQrCodeUrl(qrUrl);
    } catch (error) {
      console.error("Error generating QR code:", error);
    }
  }, []);

  const handleShare = useCallback(() => {
    const shareUrl = `${window.location.origin}/${space.slug}`;
    setShareModalOpen(true);
    setMobileSidebarOpen(false);
    void generateQRCode(shareUrl);
  }, [space.slug, generateQRCode]);

  const handleSidebarShare = () => {
    if (showGuide && guideStep === 2) {
      void generateQRCode(`${window.location.origin}/${space.slug}`);
      return;
    }
    void handleShare();
  };

  const renderSettingsContent = (closeSettings: () => void) => (
    <div className="space-y-4 p-4">
      <div className="space-y-2">
        <h4 className="font-medium leading-none">Settings</h4>
        <p className="text-sm text-muted-foreground">
          Customize your experience
        </p>
      </div>

      {isPro && (
        <div className="flex items-center justify-between rounded-lg bg-purple-500/10 p-3">
          <div className="text-sm font-medium">Admin space</div>
          <div className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
            PRO
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="text-sm font-medium">Theme</div>
          <div className="text-xs text-muted-foreground">
            Toggle light/dark mode
          </div>
        </div>
        <AnimatedThemeToggler className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-zinc-200 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white" />
      </div>

      <div className="h-px bg-border" />

      {isCreator ? (
        <>
          {ownerRecoveryKey && (
            <div className="rounded-lg border bg-muted/40 p-2">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Recovery key
              </div>
              <button
                className="flex w-full items-center justify-between gap-2 font-mono text-[11px]"
                onClick={() => void handleRecoveryAction()}
              >
                <span className="truncate">{ownerRecoveryKey}</span>
                <Copy className="h-3.5 w-3.5 shrink-0" />
              </button>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start px-2 text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20"
            onClick={() => {
              closeSettings();
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
          className="w-full justify-start px-2"
          onClick={() => {
            closeSettings();
            setRecoveryDialogOpen(true);
          }}
        >
          <KeyRound className="mr-2 h-4 w-4" />
          Recover ownership
        </Button>
      )}
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
          <button
            onClick={onClick}
            className={`
              group relative flex items-center gap-3 w-full rounded-xl transition-all duration-200
              ${sidebarExpanded ? "px-3 py-2.5" : "px-0 py-2.5 justify-center"}
              ${
                active
                  ? "bg-zinc-200 text-zinc-950 dark:bg-white/10 dark:text-white"
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
          </button>
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
    const isGuideStepOpen = (step: number) =>
      showGuide &&
      guideStep === step &&
      (isMobile ? !isDesktop && mobileSidebarOpen : isDesktop);

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
                <span className="bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-500 dark:to-pink-500 text-white border-none text-[9px] font-black px-1.5 py-1 rounded-full tracking-wider leading-none shadow-[0_2px_8px_rgba(168,85,247,0.25)] select-none">
                  PRO
                </span>
              )}
            </div>
          ) : null}
          {!isMobile && (
            <button
              onClick={() => setSidebarExpanded((prev) => !prev)}
              className="hidden md:flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/5 transition-colors"
            >
              {sidebarExpanded ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeftOpen className="h-4 w-4" />
              )}
            </button>
          )}
        </div>

        <div className="mx-3 h-px bg-zinc-200 dark:bg-white/[0.06]" />

        {/* Room Code & Share */}
        <div
          className={`flex flex-col gap-2 py-3 ${
            isCurrentlyExpanded ? "px-3" : "px-2"
          }`}
        >
          {/* Room Code Button with Popover */}
          <Popover open={isGuideStepOpen(1)}>
            <PopoverTrigger asChild>
              <div className="w-full">
                {isCurrentlyExpanded ? (
                  <div className="flex flex-col gap-1.5 w-full">
                    <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 px-1 uppercase tracking-wider">
                      Room Code
                    </span>
                    <button
                      onClick={handleCopy}
                      className={`flex items-center justify-between gap-2 w-full rounded-xl px-3 py-2 text-sm transition-all duration-300 border ${
                        isGuideStepOpen(1)
                          ? "bg-orange-500/10 border-[#ff5a00] text-[#ff5a00] dark:bg-orange-500/20 dark:border-[#ff5a00] dark:text-[#ff7d3b] shadow-[0_0_15px_rgba(255,90,0,0.25)] scale-[1.02]"
                          : copied
                            ? "bg-green-500/10 border-green-500/30 text-green-600 dark:bg-green-500/20 dark:border-green-500/40 dark:text-green-300"
                            : "border-zinc-200 dark:border-white/[0.06] text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {copied ? (
                          <Check className="h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400" />
                        ) : (
                          <Copy className="h-4 w-4 flex-shrink-0" />
                        )}
                        <span className="truncate bg-transparent font-sans font-bold text-sm tracking-tight text-zinc-800 dark:text-zinc-200">
                          {copied ? "Copied!" : space.slug}
                        </span>
                      </div>
                      {!isPro && (
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none flex-shrink-0 ${
                            hoursUntilExpiry <= 6
                              ? "bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400"
                              : hoursUntilExpiry <= 24
                                ? "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400"
                                : "bg-zinc-200 text-zinc-600 dark:bg-white/10 dark:text-zinc-400"
                          }`}
                        >
                          {expiryLabel}
                        </span>
                      )}
                    </button>
                  </div>
                ) : (
                  <SidebarButton
                    icon={copied ? Check : Copy}
                    label={
                      copied
                        ? "Copied!"
                        : isPro
                          ? `Copy Code: ${space.slug}`
                          : `Copy Code: ${space.slug} (Expires in ${expiryLabel} without activity)`
                    }
                    onClick={handleCopy}
                    className={
                      isGuideStepOpen(1)
                        ? "bg-orange-500/10 border border-[#ff5a00] text-[#ff5a00] dark:bg-orange-500/20 dark:border-[#ff5a00] dark:text-[#ff7d3b] shadow-[0_0_12px_rgba(255,90,0,0.2)] scale-[1.05]"
                        : copied
                          ? "text-green-600 dark:text-green-400 hover:text-green-500"
                          : ""
                    }
                  />
                )}
              </div>
            </PopoverTrigger>
            <PopoverContent
              side={isMobile ? "bottom" : "right"}
              align="start"
              sideOffset={12}
              className="w-72 p-0 border border-orange-500/30 bg-white/95 dark:bg-[#0c0c0e]/95 backdrop-blur-xl shadow-[0_10px_30px_rgba(255,90,0,0.15)] rounded-2xl animate-in fade-in slide-in-from-left-2 duration-300 z-[9999]"
            >
              <div className="p-4 space-y-3.5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-orange-500/10 to-transparent blur-xl pointer-events-none" />
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black text-[#ff5a00] uppercase tracking-wider bg-orange-500/10 dark:bg-orange-500/20 px-2 py-0.5 rounded-full">
                      Step 1 of 3
                    </span>
                    <button
                      onClick={dismissGuide}
                      className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <h4 className="font-bold text-sm text-zinc-800 dark:text-zinc-100 flex items-center gap-1.5">
                    <Copy className="h-4 w-4 text-[#ff5a00]" />
                    Copy & Share Room ID
                  </h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    Share this code so another person or device can open the room and download your files. This is a temporary sharing space; keep your own copy.
                  </p>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <button
                    onClick={dismissGuide}
                    className="text-xs font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                  >
                    Skip guide
                  </button>
                  <Button
                    size="sm"
                    onClick={() => {
                      void generateQRCode(
                        `${window.location.origin}/${space.slug}`,
                      );
                      setGuideStep(2);
                    }}
                    className="h-7 rounded-lg text-xs font-bold bg-[#ff5a00] hover:bg-[#ff5a00]/95 text-white shadow-md shadow-orange-500/10"
                  >
                    Next option
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Share Button with Popover */}
          <Popover open={isGuideStepOpen(2)}>
            <PopoverTrigger asChild>
              <div className="w-full">
                {isCurrentlyExpanded ? (
                  <button
                    onClick={handleSidebarShare}
                    className={`flex items-center gap-3 w-full rounded-xl px-3 py-2 text-sm transition-all duration-300 border ${
                      isGuideStepOpen(2)
                        ? "bg-orange-500/10 border-[#ff5a00] text-[#ff5a00] dark:bg-orange-500/20 dark:border-[#ff5a00] dark:text-[#ff7d3b] shadow-[0_0_15px_rgba(255,90,0,0.25)] scale-[1.02]"
                        : "border-transparent text-zinc-500 hover:text-zinc-950 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/5"
                    }`}
                  >
                    <Share className="h-[18px] w-[18px] flex-shrink-0" />
                    <span className="text-sm font-medium">Share Space</span>
                  </button>
                ) : (
                  <SidebarButton
                    icon={Share}
                    label="Share"
                    onClick={handleSidebarShare}
                    className={
                      isGuideStepOpen(2)
                        ? "bg-orange-500/10 border border-[#ff5a00] text-[#ff5a00] dark:bg-orange-500/20 dark:border-[#ff5a00] dark:text-[#ff7d3b] shadow-[0_0_12px_rgba(255,90,0,0.2)] scale-[1.05]"
                        : ""
                    }
                  />
                )}
              </div>
            </PopoverTrigger>
            <PopoverContent
              side={isMobile ? "bottom" : "right"}
              align="start"
              sideOffset={12}
              className="w-72 p-0 border border-orange-500/30 bg-white/95 dark:bg-[#0c0c0e]/95 backdrop-blur-xl shadow-[0_10px_30px_rgba(255,90,0,0.15)] rounded-2xl animate-in fade-in slide-in-from-left-2 duration-300 z-[9999]"
            >
              <div className="p-4 space-y-3.5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-orange-500/10 to-transparent blur-xl pointer-events-none" />
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black text-[#ff5a00] uppercase tracking-wider bg-orange-500/10 dark:bg-orange-500/20 px-2 py-0.5 rounded-full">
                      Step 2 of 3
                    </span>
                    <button
                      onClick={dismissGuide}
                      className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <h4 className="font-bold text-sm text-zinc-800 dark:text-zinc-100 flex items-center gap-1.5">
                    <Share className="h-4 w-4 text-[#ff5a00]" />
                    Interactive QR Sharing
                  </h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    Let someone scan this QR code to open the room instantly.
                  </p>
                  <div className="flex justify-center rounded-xl border border-orange-500/15 bg-white p-2 dark:bg-white">
                    {qrCodeUrl ? (
                      <Image
                        src={qrCodeUrl}
                        alt={`QR code for room ${space.slug}`}
                        width={112}
                        height={112}
                        className="h-28 w-28"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-28 w-28 items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <button
                    onClick={() => setGuideStep(1)}
                    className="text-xs font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                  >
                    Back
                  </button>
                  <Button
                    size="sm"
                    onClick={() => setGuideStep(3)}
                    className="h-7 rounded-lg text-xs font-bold bg-[#ff5a00] hover:bg-[#ff5a00]/95 text-white shadow-md shadow-orange-500/10"
                  >
                    Recovery
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Recovery Key Popover */}
          <Popover open={isGuideStepOpen(3)}>
            <PopoverTrigger asChild>
              <div className="w-full">
                {isCurrentlyExpanded ? (
                  <div className="flex w-full flex-col gap-1.5">
                    <span className="px-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      Recovery
                    </span>
                    <button
                      onClick={() => void handleRecoveryAction()}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-all duration-300 ${
                        isGuideStepOpen(3)
                          ? "scale-[1.02] border-[#ff5a00] bg-orange-500/10 text-[#ff5a00] shadow-[0_0_15px_rgba(255,90,0,0.25)] dark:bg-orange-500/20 dark:text-[#ff7d3b]"
                          : "border-zinc-200 text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-950 dark:border-white/[0.06] dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
                      }`}
                    >
                      <KeyRound className="h-[18px] w-[18px] shrink-0" />
                      <span className="min-w-0 truncate font-medium">
                        {isCreator && ownerRecoveryKey
                          ? ownerRecoveryKey
                          : "Recover ownership"}
                      </span>
                      {isCreator && ownerRecoveryKey && (
                        <Copy className="ml-auto h-3.5 w-3.5 shrink-0" />
                      )}
                    </button>
                  </div>
                ) : (
                  <SidebarButton
                    icon={KeyRound}
                    label={
                      isCreator && ownerRecoveryKey
                        ? "Copy recovery key"
                        : "Recover ownership"
                    }
                    onClick={() => void handleRecoveryAction()}
                    className={
                      isGuideStepOpen(3)
                        ? "scale-[1.05] border border-[#ff5a00] bg-orange-500/10 text-[#ff5a00] shadow-[0_0_12px_rgba(255,90,0,0.2)] dark:bg-orange-500/20 dark:text-[#ff7d3b]"
                        : ""
                    }
                  />
                )}
              </div>
            </PopoverTrigger>
            <PopoverContent
              side={isMobile ? "bottom" : "right"}
              align="start"
              sideOffset={12}
              className="z-[9999] w-72 rounded-2xl border border-orange-500/30 bg-white/95 p-0 shadow-[0_10px_30px_rgba(255,90,0,0.15)] backdrop-blur-xl animate-in fade-in slide-in-from-left-2 duration-300 dark:bg-[#0c0c0e]/95"
            >
              <div className="relative space-y-3.5 overflow-hidden p-4">
                <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 bg-gradient-to-br from-orange-500/10 to-transparent blur-xl" />
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#ff5a00] dark:bg-orange-500/20">
                      Step 3 of 3
                    </span>
                    <button
                      onClick={dismissGuide}
                      className="text-zinc-400 transition-colors hover:text-zinc-900 dark:hover:text-white"
                      aria-label="Close guide"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <h4 className="flex items-center gap-1.5 text-sm font-bold text-zinc-800 dark:text-zinc-100">
                    <KeyRound className="h-4 w-4 text-[#ff5a00]" />
                    Keep your recovery key safe
                  </h4>
                  <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    This key restores creator controls if this browser loses its anonymous session. It cannot restore deleted files or notes.
                  </p>
                  {isCreator && ownerRecoveryKey ? (
                    <button
                      onClick={() => void handleRecoveryAction()}
                      className="flex w-full items-center justify-between gap-2 rounded-xl border border-orange-500/20 bg-orange-500/[0.06] px-3 py-2 font-mono text-[11px] text-zinc-800 dark:text-zinc-100"
                    >
                      <span className="break-all text-left">{ownerRecoveryKey}</span>
                      <Copy className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                    </button>
                  ) : (
                    <p className="rounded-xl border bg-muted/40 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                      The creator receives this key. If you already have one, choose Recover ownership and enter it there.
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => setGuideStep(2)}
                    className="text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    Back
                  </button>
                  <Button
                    size="sm"
                    onClick={dismissGuide}
                    className="h-7 rounded-lg bg-[#ff5a00] text-xs font-bold text-white shadow-md shadow-orange-500/10 hover:bg-[#ff5a00]/95"
                  >
                    Finish
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Expiry indicator — Collapsed ONLY */}
          {!isPro && !isCurrentlyExpanded && (
            <div className="flex justify-center py-2 animate-in fade-in duration-200">
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={`
                        flex items-center justify-center h-8 w-8 rounded-full text-[10px] font-semibold border cursor-default select-none shadow-sm transition-all duration-200
                        ${
                          hoursUntilExpiry <= 6
                            ? "bg-red-500/5 text-red-600 dark:bg-red-500/10 dark:text-red-400"
                            : hoursUntilExpiry <= 24
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:bg-amber-500/20 dark:border-amber-500/40 dark:text-amber-400"
                              : "bg-zinc-100 border-zinc-200 text-zinc-600 dark:bg-white/5 dark:border-white/[0.06] dark:text-zinc-400"
                        }
                      `}
                    >
                      {expiryLabel}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    {`Expires in ${expiryLabel} without activity`}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
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
            <button
              onClick={openMobileSettings}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-zinc-500 transition-all duration-200 hover:bg-zinc-200/50 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
            >
              <Settings className="h-[18px] w-[18px] shrink-0" />
              <span className="text-sm font-medium">Settings</span>
            </button>
          ) : (
            <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
              <PopoverTrigger asChild>
                <div>
                  {isCurrentlyExpanded ? (
                    <button
                      onClick={() => setSettingsOpen(true)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-zinc-500 transition-all duration-200 hover:bg-zinc-200/50 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white ${
                        settingsOpen
                          ? "bg-zinc-200 text-zinc-950 dark:bg-white/10 dark:text-white"
                          : ""
                      }`}
                    >
                      <Settings className="h-[18px] w-[18px] shrink-0" />
                      <span className="text-sm font-medium">Settings</span>
                    </button>
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
                className="w-56 p-0"
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
      <button
        onClick={() => setMobileSidebarOpen(true)}
        aria-label="Open sidebar"
        className="md:hidden fixed top-3 left-3 z-40 h-9 w-9 rounded-xl bg-zinc-50/90 dark:bg-[#1a1a1a]/90 backdrop-blur-md border border-zinc-200 dark:border-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-white/5 transition-colors shadow-sm"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-60 bg-zinc-50 dark:bg-[#111113] border-r border-zinc-200 dark:border-white/[0.06] animate-in slide-in-from-left duration-200 flex flex-col">
            <div className="absolute top-3 right-3 z-10">
              <button
                onClick={() => setMobileSidebarOpen(false)}
                aria-label="Close sidebar"
                className="h-7 w-7 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-950 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {renderSidebarContent(true)}
          </aside>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 min-h-screen transition-all duration-300">
        <main
          className="transition-all duration-300"
          style={{ marginLeft: isDesktop ? sidebarWidth : 0 }}
        >
          <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-xl">
            <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 pl-14 pr-3 sm:pr-4 md:px-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopyNavLink()}
                    className="group -ml-1 flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Copy room ${space.slug} link`}
                    title="Copy room link"
                  >
                    <span className="font-mono text-sm font-bold tracking-[0.2em]">
                      {space.slug}
                    </span>
                    {navLinkCopied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-muted-foreground opacity-60 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100" />
                    )}
                  </button>
                  {isPro && (
                    <span className="rounded-full bg-purple-600 px-1.5 py-0.5 text-[9px] font-black text-white">
                      PRO
                    </span>
                  )}
                </div>
                <p className="truncate text-[11px] text-muted-foreground">
                  You&apos;re {currentDisplayName}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex"
                  aria-live="polite"
                >
                  {connectionStatus === "connected" ? (
                    <Wifi className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5 text-amber-500" />
                  )}
                  {connectionStatus === "connected"
                    ? `${onlineCount} online`
                    : connectionStatus === "connecting"
                      ? "Connecting"
                      : "Offline"}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 gap-0 p-0 sm:w-auto sm:gap-1.5 sm:px-3"
                  onClick={handleShare}
                  aria-label="Share room"
                >
                  <Share className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Share</span>
                </Button>
              </div>
            </div>
          </header>

          <div className="container mx-auto px-4">
            {!hasPosted || keepInitialComposerDuringUpload ? (
              <div className="flex min-h-screen items-center justify-center">
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
                <div
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
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {newItemsCount > 0 && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-28 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background shadow-xl"
        >
          <ArrowDown className="h-3.5 w-3.5" />
          {newItemsCount} new {newItemsCount === 1 ? "item" : "items"}
        </button>
      )}

      {/* Reusable Modals & Dialogs */}
      <SpaceModals
        space={space}
        isCreator={isCreator}
        shareModalOpen={shareModalOpen}
        setShareModalOpen={setShareModalOpen}
        qrCodeUrl={qrCodeUrl}
        shareHost={shareHost}
        connectionStatus={connectionStatus}
        deleteDialogOpen={deleteDialogOpen}
        setDeleteDialogOpen={setDeleteDialogOpen}
        recoveryDialogOpen={recoveryDialogOpen}
        setRecoveryDialogOpen={setRecoveryDialogOpen}
        mobileSettingsOpen={mobileSettingsOpen}
        setMobileSettingsOpen={setMobileSettingsOpen}
        ownerRecoveryKey={ownerRecoveryKey}
        isPro={isPro}
      />
    </div>
  );
}
