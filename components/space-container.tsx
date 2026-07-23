"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import Link from "next/link";
import Image from "next/image";
import {
  Copy,
  Check,
  Share,
  Settings,
  X,
  QrCode,
  Trash2,
  AlertTriangle,
  Loader2,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  Wifi,
  WifiOff,
  ArrowDown,
  KeyRound,
} from "lucide-react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { Space, deleteSpace, recoverSpace } from "@/lib/actions";
import { getDaysUntilExpiry } from "@/lib/utils";
import { Composer } from "./composer";
import { EntryCard, type Entry } from "./entry-card";
import { ProgressiveBlur } from "@/components/ui/progressive-blur";
import { Logo } from "./logo";
import { createClientSupabaseClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import QRCode from "qrcode";
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
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRouter } from "next/navigation";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";

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

// Sidebar widths as constants
const SIDEBAR_COLLAPSED_W = 60;
const SIDEBAR_EXPANDED_W = 240;

export function SpaceContainer({
  space,
  initialEntries,
  currentDeviceId,
  currentDisplayName,
}: SpaceContainerProps) {
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const hasPosted = entries.length > 0;
  const [copied, setCopied] = useState(false);
  const [navLinkCopied, setNavLinkCopied] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [recoveryDialogOpen, setRecoveryDialogOpen] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [ownerRecoveryKey, setOwnerRecoveryKey] = useState("");
  const [isRecovering, setIsRecovering] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [newItemsCount, setNewItemsCount] = useState(0);
  const [shareHost, setShareHost] = useState("woff.space");
  const [onlineCount, setOnlineCount] = useState(1);
  const isNearBottomRef = useRef(true);
  const router = useRouter();

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

  // Check if current user is the creator
  const isCreator =
    currentDeviceId && space.creator_device_id === currentDeviceId;

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
    setOwnerRecoveryKey(
      localStorage.getItem(`woff_recovery_${space.slug}`) || "",
    );
    if (isCreator) return;
    const savedKey = localStorage.getItem(`woff_recovery_${space.slug}`);
    if (!savedKey) return;
    void recoverSpace(space.slug, savedKey)
      .then((recovered) => {
        if (recovered) router.refresh();
        else localStorage.removeItem(`woff_recovery_${space.slug}`);
      })
      .catch(() => {
        // Keep the saved key for a future retry if the network is unavailable.
      });
  }, [isCreator, router, space.slug]);

  // Use space prop for pro status
  const isPro = space.is_pro || false;

  // Calculate days until space expires
  const daysUntilExpiry = useMemo(() => {
    if (space.expires_at || space.last_activity_at) {
      return getDaysUntilExpiry(space.expires_at || space.last_activity_at, Boolean(space.expires_at));
    }
    return 7;
  }, [space.expires_at, space.last_activity_at]);

  // User avatar letter (first letter of slug)
  const avatarLetter = (space.slug?.[0] || "W").toUpperCase();

  // Current sidebar width for layout calculations
  const sidebarWidth = sidebarExpanded
    ? SIDEBAR_EXPANDED_W
    : SIDEBAR_COLLAPSED_W;

  // Function to scroll to bottom smoothly
  const scrollToBottom = useCallback(() => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "smooth",
    });
    setNewItemsCount(0);
  }, []);

  // Helper function to safely add entry without duplicates
  const addEntryIfNotExists = useCallback((newEntry: Entry) => {
    setEntries((prev) => {
      const exists = prev.some((entry) => entry.id === newEntry.id);
      if (exists) {
        return prev;
      }
      return [...prev, newEntry];
    });
  }, []);

  // Track whether new content can be revealed without interrupting reading.
  useEffect(() => {
    const handleScroll = () => {
      const remaining =
        document.documentElement.scrollHeight -
        window.innerHeight -
        window.scrollY;
      isNearBottomRef.current = remaining < 180;
      if (isNearBottomRef.current) setNewItemsCount(0);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Real-time subscription for new entries
  useEffect(() => {
    const supabase = createClientSupabaseClient();

    const channel = supabase
      .channel(`space:${space.id}`, {
        config: { presence: { key: currentDeviceId || crypto.randomUUID() } },
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setOnlineCount(Math.max(1, Object.keys(state).length));
      })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "entries",
          filter: `space_id=eq.${space.id}`,
        },
        (payload) => {
          const newEntry = payload.new as Entry;

          addEntryIfNotExists(newEntry);
          if (isNearBottomRef.current) {
            requestAnimationFrame(scrollToBottom);
          } else {
            setNewItemsCount((count) => count + 1);
          }
        },
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
          const updatedEntry = payload.new as Entry;
          setEntries((prev) =>
            prev.map((entry) =>
              entry.id === updatedEntry.id ? updatedEntry : entry,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "entries",
          filter: `space_id=eq.${space.id}`,
        },
        (payload) => {
          const oldEntry = payload.old as { id: string };
          if (oldEntry && oldEntry.id) {
            setEntries((prev) =>
              prev.filter((entry) => entry.id !== oldEntry.id),
            );
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnectionStatus("connected");
          void channel.track({ name: currentDisplayName, onlineAt: new Date().toISOString() });
        }
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnectionStatus("disconnected");
        } else {
          setConnectionStatus("connecting");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [space.id, currentDeviceId, currentDisplayName, addEntryIfNotExists, scrollToBottom]);

  const handleNewEntry = useCallback(
    (entry: Entry) => {
      addEntryIfNotExists(entry);

      setTimeout(() => {
        scrollToBottom();
      }, 100);
    },
    [scrollToBottom, addEntryIfNotExists],
  );

  const handleUpdateEntry = useCallback(
    (entryId: string, updates: Partial<Entry>) => {
      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === entryId ? { ...entry, ...updates } : entry,
        ),
      );
    },
    [],
  );

  const handleReplaceEntry = useCallback(
    (placeholderId: string, realEntry: Entry) => {
      setEntries((prev) => {
        // First, remove any duplicate that real-time may have already inserted
        const withoutRealtimeDup = prev.filter(
          (entry) => entry.id !== realEntry.id,
        );
        // Then replace the placeholder with the real entry
        return withoutRealtimeDup.map((entry) =>
          entry.id === placeholderId ? realEntry : entry,
        );
      });
    },
    [],
  );

  const handleRemoveEntry = useCallback((entryId: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== entryId));
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(space.slug);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
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

  const handleDeleteSpace = async () => {
    if (!isCreator) return;

    setIsDeleting(true);
    try {
      await deleteSpace(space.id);
      
      // Clear last_created_space from localStorage so input stays empty on homepage
      if (typeof window !== "undefined") {
        localStorage.removeItem("last_created_space");
      }
      
      router.push("/");
    } catch (error) {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      toast.error(error instanceof Error ? error.message : "Unable to delete the space");
    }
  };

  const generateQRCode = async (url: string) => {
    try {
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
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/${space.slug}`;
    setShareModalOpen(true);
    setMobileSidebarOpen(false);
    generateQRCode(shareUrl);
  };

  const handleSidebarShare = () => {
    if (showGuide && guideStep === 2) {
      void generateQRCode(`${window.location.origin}/${space.slug}`);
      return;
    }
    void handleShare();
  };

  const handleCopyFromModal = async () => {
    const shareUrl = `${window.location.origin}/${space.slug}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      /* ignore */
    }
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

  // Sidebar icon button helper
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

  // The sidebar content — reused for both desktop and mobile
  const renderSidebarContent = (isMobile: boolean = false) => {
    const isCurrentlyExpanded = isMobile || sidebarExpanded;
    const isGuideStepOpen = (step: number) =>
      showGuide &&
      guideStep === step &&
      (isMobile ? !isDesktop && mobileSidebarOpen : isDesktop);

    return (
      <div className="flex flex-col h-full bg-zinc-50 dark:bg-[#111113]">
        {/* Top: Logo (expanded only) + Toggle */}
        <div
          className={`flex items-center ${isCurrentlyExpanded ? "justify-between px-4" : "justify-center"} h-14 flex-shrink-0`}
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
              onClick={() => {
                setSidebarExpanded((prev) => !prev);
              }}
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

        {/* Divider */}
        <div className="mx-3 h-px bg-zinc-200 dark:bg-white/[0.06]" />

        {/* Top actions/navigation items: Room Code Copy & Share */}
        <div
          className={`flex flex-col gap-2 py-3 ${isCurrentlyExpanded ? "px-3" : "px-2"}`}
        >
          {/* Room Code Button with Onboarding Popover */}
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
                            daysUntilExpiry <= 2
                              ? "bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400"
                              : daysUntilExpiry <= 4
                                ? "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400"
                                : "bg-zinc-200 text-zinc-600 dark:bg-white/10 dark:text-zinc-400"
                          }`}
                        >
                          {daysUntilExpiry}d
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
                          : `Copy Code: ${space.slug} (Expires in ${daysUntilExpiry}d)`
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
                    Clicking this copies the four-digit room code. Share it with
                    anyone you want to invite; they can enter it on the home
                    page to join.
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

          {/* Share Button with Onboarding Popover */}
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
                    The Share option also gives you the full room link.
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

          {/* Recovery key / ownership option with onboarding step */}
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
                    This key restores creator controls if this browser loses its
                    anonymous session. Anyone with the key can recover ownership,
                    so keep it private.
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
                      The creator receives this key. If you already have one,
                      choose Recover ownership and enter it there.
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
                          daysUntilExpiry <= 2
                            ? "bg-red-500/5 text-red-600 dark:bg-red-500/10 dark:text-red-400"
                            : daysUntilExpiry <= 4
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:bg-amber-500/20 dark:border-amber-500/40 dark:text-amber-400"
                              : "bg-zinc-100 border-zinc-200 text-zinc-600 dark:bg-white/5 dark:border-white/[0.06] dark:text-zinc-400"
                        }
                      `}
                    >
                      {daysUntilExpiry}d
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    {`Expires in ${daysUntilExpiry}d`}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </div>

        {/* MIDDLE section: Embedded searchable files browser (renders only if expanded) */}
        {isCurrentlyExpanded ? (
          <div className="flex-1 min-h-0 py-2 flex flex-col border-t border-b border-zinc-200 dark:border-white/[0.06] my-2 overflow-hidden">
            <ActivitySidebar entries={entries} isOpen={true} />
          </div>
        ) : (
          <div className="flex-1" />
        )}

        {/* Bottom settings action. Mobile uses a dialog outside the drawer. */}
        <div
          className={`flex flex-col gap-1 py-3 ${isCurrentlyExpanded ? "px-3" : "px-2"}`}
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
        className="md:hidden fixed top-3 left-3 z-40 h-9 w-9 rounded-xl bg-zinc-50/90 dark:bg-[#1a1a1a]/90 backdrop-blur-md border border-zinc-200 dark:border-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-white/5 transition-colors shadow-sm"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileSidebarOpen(false)}
          />
          {/* Sidebar drawer */}
          <aside className="absolute left-0 top-0 bottom-0 w-60 bg-zinc-50 dark:bg-[#111113] border-r border-zinc-200 dark:border-white/[0.06] animate-in slide-in-from-left duration-200 flex flex-col">
            {/* Close button */}
            <div className="absolute top-3 right-3 z-10">
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="h-7 w-7 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-950 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {renderSidebarContent(true)}
          </aside>
        </div>
      )}

      <Dialog open={mobileSettingsOpen} onOpenChange={setMobileSettingsOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-sm overflow-hidden p-0 sm:max-w-sm">
          <DialogHeader className="sr-only">
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>
              Change the theme or manage this space.
            </DialogDescription>
          </DialogHeader>
          {renderSettingsContent(() => setMobileSettingsOpen(false))}
        </DialogContent>
      </Dialog>

      {/* Main content area — offset by sidebar on desktop */}
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
                    <span className="rounded-full bg-purple-600 px-1.5 py-0.5 text-[9px] font-black text-white">PRO</span>
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
            {!hasPosted ? (
              // Centered composer for first post
              <div className="flex min-h-screen items-center justify-center">
                <div className="w-full max-w-4xl">
                  <Composer
                    spaceId={space.id}
                    onNewEntry={handleNewEntry}
                    onUpdateEntry={handleUpdateEntry}
                    onReplaceEntry={handleReplaceEntry}
                    onRemoveEntry={handleRemoveEntry}
                    currentDeviceId={currentDeviceId}
                    centered={true}
                  />
                  <div className="mt-4 text-center text-sm text-muted-foreground">
                    Paste to create • Drop to upload • Type to write
                  </div>
                </div>
              </div>
            ) : (
              // Timeline view with entries, and bottom composer
              <div className="pb-40">
                <div className="mx-auto max-w-2xl space-y-6 py-8">
                  {entries.map((entry) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      currentDeviceId={currentDeviceId || null}
                      onDelete={handleRemoveEntry}
                    />
                  ))}
                </div>

                {/* Bottom composer — offset left for sidebar on desktop */}
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
                        onNewEntry={handleNewEntry}
                        onUpdateEntry={handleUpdateEntry}
                        onReplaceEntry={handleReplaceEntry}
                        onRemoveEntry={handleRemoveEntry}
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

      {/* Share Modal */}
      <Dialog
        open={shareModalOpen}
        onOpenChange={(open) => {
          setShareModalOpen(open);
          if (!open) {
            setQrCodeUrl("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md border border-orange-500/20 bg-white/95 dark:bg-[#0c0c0e]/95 backdrop-blur-xl shadow-[0_20px_50px_rgba(255,90,0,0.15)] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-xl font-bold">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500 dark:bg-orange-500/20 dark:text-orange-400">
                <Share className="h-5 w-5" />
              </div>
              Share Space
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* QR Code Container with Glowing Orange Border and radial ambient glow */}
            <div className="flex justify-center py-4">
              <div className="relative group p-1.5 rounded-[24px] bg-gradient-to-br from-orange-500/30 via-orange-500/10 to-transparent dark:from-orange-500/40 dark:via-orange-500/15 dark:to-transparent">
                {/* Glow Orb behind QR card */}
                <div className="absolute inset-0 rounded-[24px] bg-gradient-to-r from-orange-500 to-amber-500 blur-2xl opacity-20 dark:opacity-30 group-hover:opacity-40 transition-opacity duration-500" />

                {/* Main QR Card */}
                <div className="relative p-4 bg-white dark:bg-[#151518] rounded-[18px] border border-orange-500/35 dark:border-orange-500/45 shadow-[0_4px_30px_rgba(255,90,0,0.12)] flex flex-col items-center">
                  {qrCodeUrl ? (
                    <Image
                      src={qrCodeUrl}
                      alt="QR Code for space"
                      width={192}
                      height={192}
                      className="w-48 h-48 block rounded-lg select-none pointer-events-none"
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

            {/* Share URL */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                Share link
              </label>
              <div className="flex gap-2.5">
                <div className="flex-1 px-4 py-3 bg-zinc-50 dark:bg-[#18181b]/50 rounded-xl text-sm font-mono text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-white/[0.06] select-all truncate flex items-center">
                  {shareHost}/{space.slug}
                </div>
                <Button
                  onClick={handleCopyFromModal}
                  className={`px-5 rounded-xl font-medium transition-all duration-300 shrink-0 flex items-center gap-1.5 ${
                    copied
                      ? "bg-green-600 hover:bg-green-700 text-white shadow-[0_2px_10px_rgba(22,163,74,0.2)]"
                      : "bg-[#ff5a00] hover:bg-[#ff5a00]/95 text-white shadow-[0_4px_12px_rgba(255,90,0,0.2)] hover:scale-[1.02] active:scale-[0.98]"
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
              <p className="text-xs text-zinc-400 dark:text-zinc-500 text-center">
                Anyone with this link can view and contribute to this space
              </p>
            </div>

            {/* Premium footer */}
            <div className="text-center pt-4 border-t border-zinc-200 dark:border-white/[0.06] flex items-center justify-center gap-2">
              <span className="relative flex h-2 w-2">
                {connectionStatus === "connected" && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${
                  connectionStatus === "connected" ? "bg-emerald-500" : "bg-amber-500"
                }`}></span>
              </span>
              <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 tracking-wide uppercase">
                {connectionStatus === "connected" ? "Live sharing connected" : "Reconnecting…"}
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={recoveryDialogOpen} onOpenChange={setRecoveryDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Recover space ownership</DialogTitle>
            <DialogDescription>
              Enter the recovery key saved when this space was created.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={recoveryKey}
            onChange={(event) =>
              setRecoveryKey(
                event.target.value.toUpperCase().replace(/[^A-F0-9]/g, "").slice(0, 20),
              )
            }
            placeholder="20-character recovery key"
            className="font-mono uppercase tracking-wider"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecoveryDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={recoveryKey.length !== 20 || isRecovering}
              onClick={async () => {
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
              }}
            >
              {isRecovering && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Recover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete Space
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this space? This action cannot be
              undone and all content will be permanently lost.
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
              className="gap-2"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Delete Space
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
