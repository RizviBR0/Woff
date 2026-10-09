"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Cloud,
  FolderKanban,
  HardDrive,
  Infinity as InfinityIcon,
  Link2,
  Loader2,
  LockKeyhole,
  Pencil,
  Plus,
  Radio,
  Search,
  Settings2,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LocalDateTime } from "@/components/local-date-time";
import { formatAccountBytes } from "@/lib/account-helpers";
import { useClientNow } from "@/lib/hooks/use-client-now";
import { roomExpiryTimestamp } from "@/lib/utils";
import {
  createSpace,
  createRoomInvitation,
  deleteSpace,
  recordRoomEvent,
  type Space,
} from "@/lib/actions";
import {
  updateHandoffRoom,
  updateRoomIdentity,
  saveHandoffTemplate,
  type HandoffTemplate,
  type SenderDashboard,
} from "@/lib/dashboard-actions";
import {
  rememberSpaceOwnership,
  rememberSpaceInvitation,
  migrateRoomBrowserState,
} from "@/lib/space-recovery";
import { RoomIdentityEditor } from "@/components/space/room-identity-editor";
import { isLegacyRoomSlug } from "@/lib/room-slug";
import styles from "./dashboard.module.css";

const PAGE_SIZE = 8;

const defaultTemplate: HandoffTemplate = {
  name: "Project handoff",
  welcome_text: "Please review the delivery notes and download your files before the room expires.",
  delivery_mode: "read_only",
  retention_days: 7,
};

function roomIsActive(room: Space, now: number) {
  const deadline = roomExpiryTimestamp(room);
  return deadline === null || Date.parse(deadline) > now;
}

function SettingsFields({
  value,
  onChange,
  template = false,
}: {
  value: HandoffTemplate;
  onChange: (value: HandoffTemplate) => void;
  template?: boolean;
}) {
  return (
    <div className={styles.settingsFields}>
      <label>
        Room name
        <Input
          value={value.name}
          maxLength={120}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
        />
      </label>
      <label>
        Welcome instructions
        <Textarea
          className="min-h-28"
          value={value.welcome_text}
          maxLength={5000}
          onChange={(event) => onChange({ ...value, welcome_text: event.target.value })}
        />
      </label>
      <div className={styles.settingsRow}>
        <label>
          Delivery mode
          <select
            value={value.delivery_mode}
            onChange={(event) =>
              onChange({
                ...value,
                delivery_mode: event.target.value as HandoffTemplate["delivery_mode"],
              })
            }
          >
            <option value="read_only">Read-only recipients</option>
            <option value="collaborative">Recipients can post</option>
          </select>
        </label>
        {template && (
          <label>
            Default time limit
            <select
              value={value.retention_days}
              onChange={(event) =>
                onChange({
                  ...value,
                  retention_days: Number(event.target.value) as 7 | 30,
                })
              }
            >
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
            </select>
          </label>
        )}
      </div>
    </div>
  );
}

function RoomSettingsForm({
  room,
  onClose,
  onSaved,
}: {
  room: Space;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<HandoffTemplate>({
    name: room.name || room.title || `Room ${room.slug}`,
    welcome_text: room.welcome_text || "",
    delivery_mode: room.delivery_mode || "read_only",
    retention_days: room.retention_days === 30 ? 30 : 7,
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await updateHandoffRoom(room.id, settings);
      toast.success("Handoff settings saved");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save settings");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={styles.roomSettings} onSubmit={handleSubmit}>
      <fieldset disabled={busy}>
        <SettingsFields value={settings} onChange={setSettings} />
        <p className={styles.settingsNote}>
          Change the code or time limit in the room’s Share controls.
        </p>
        <div className={styles.formActions}>
          <Button type="button" size="sm" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm">
            {busy ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

type SortField = "name" | "status" | "expires_at" | "created_at";
type SortDirection = "asc" | "desc";

export function SenderDashboardClient({
  initial,
  serverNow,
}: {
  initial: SenderDashboard;
  serverNow: number;
}) {
  const router = useRouter();
  const now = useClientNow(15_000) ?? serverNow;
  const [template, setTemplate] = useState<HandoffTemplate>({
    ...defaultTemplate,
    ...initial.template,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const operationPending = useRef(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [viewTab, setViewTab] = useState<"all" | "active" | "expired">("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Expanded row state
  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null);
  const [expandedTab, setExpandedTab] = useState<"settings" | "identity">("settings");

  // Delete confirmation states
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);

  // Quick feedback states
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [updatingModeId, setUpdatingModeId] = useState<string | null>(null);

  const query = search.trim().toLowerCase();
  const activeRooms = useMemo(
    () => initial.rooms.filter((room) => roomIsActive(room, now)),
    [initial.rooms, now]
  );
  const expiredRooms = useMemo(
    () => initial.rooms.filter((room) => !roomIsActive(room, now)),
    [initial.rooms, now]
  );

  const filteredRooms = useMemo(() => {
    return initial.rooms
      .filter((room) => {
        const isActive = roomIsActive(room, now);
        if (viewTab === "active" && !isActive) return false;
        if (viewTab === "expired" && isActive) return false;

        if (query) {
          const name = (room.name || room.title || "").toLowerCase();
          const slug = room.slug.toLowerCase();
          const welcome = (room.welcome_text || "").toLowerCase();
          if (!name.includes(query) && !slug.includes(query) && !welcome.includes(query)) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortBy === "name") {
          const nameA = (a.name || a.title || `Room ${a.slug}`).toLowerCase();
          const nameB = (b.name || b.title || `Room ${b.slug}`).toLowerCase();
          cmp = nameA.localeCompare(nameB);
        } else if (sortBy === "status") {
          const actA = roomIsActive(a, now) ? 1 : 0;
          const actB = roomIsActive(b, now) ? 1 : 0;
          cmp = actB - actA;
        } else if (sortBy === "expires_at") {
          const deadA = roomExpiryTimestamp(a);
          const deadB = roomExpiryTimestamp(b);
          const valA = deadA ? Date.parse(deadA) : Infinity;
          const valB = deadB ? Date.parse(deadB) : Infinity;
          cmp = valA - valB;
        } else {
          // created_at
          const timeA = Date.parse(a.created_at) || 0;
          const timeB = Date.parse(b.created_at) || 0;
          cmp = timeB - timeA;
        }
        return sortDirection === "asc" ? cmp : -cmp;
      });
  }, [initial.rooms, now, viewTab, query, sortBy, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filteredRooms.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedRooms = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredRooms.slice(start, start + PAGE_SIZE);
  }, [filteredRooms, safePage]);

  const allVisibleSelected =
    paginatedRooms.length > 0 && paginatedRooms.every((r) => selectedIds.has(r.id));
  const someVisibleSelected =
    paginatedRooms.some((r) => selectedIds.has(r.id)) && !allVisibleSelected;

  const toggleSelectAll = () => {
    const next = new Set(selectedIds);
    if (allVisibleSelected) {
      paginatedRooms.forEach((r) => next.delete(r.id));
    } else {
      paginatedRooms.forEach((r) => next.add(r.id));
    }
    setSelectedIds(next);
  };

  const toggleSelectRoom = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDirection(field === "created_at" ? "desc" : "asc");
    }
  };

  const chargedBytes =
    Math.max(0, Number(initial.storage_used_bytes) || 0) +
    Math.max(0, Number(initial.reserved_bytes) || 0);
  const storagePercent =
    initial.storage_limit_bytes > 0
      ? Math.min(100, Math.round((chargedBytes / initial.storage_limit_bytes) * 100))
      : 0;
  const remainingBytes = Math.max(0, (initial.storage_limit_bytes || 0) - chargedBytes);
  const freePercent = Math.max(0, 100 - storagePercent);

  const roomToDelete = useMemo(() => {
    return initial.rooms.find((r) => r.id === confirmDeleteId) || null;
  }, [initial.rooms, confirmDeleteId]);

  const run = async (operation: string, action: () => Promise<void>) => {
    if (operationPending.current) return;
    operationPending.current = true;
    setBusy(operation);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update dashboard");
    } finally {
      operationPending.current = false;
      setBusy(null);
    }
  };

  const createRoom = () =>
    void run("create", async () => {
      const room = await createSpace(initial.is_pro ? "project-handoff" : undefined);
      rememberSpaceOwnership(room);
      router.push(`/${room.slug}`);
    });

  const handleCopyLink = async (room: Space) => {
    try {
      const invitation = await createRoomInvitation(room.id);
      await navigator.clipboard.writeText(`${window.location.origin}/s/${invitation.token}`);
      rememberSpaceInvitation(room, invitation.token, invitation.access_version);
      setCopiedId(room.id);
      toast.success("Invitation link copied");
      void recordRoomEvent(room.id, "share_initiated");
      setTimeout(() => {
        setCopiedId((curr) => (curr === room.id ? null : curr));
      }, 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to copy invitation link");
    }
  };

  const handleSetAccessMode = async (
    room: Space,
    targetMode: "collaborative" | "read_only"
  ) => {
    if (room.delivery_mode === targetMode) return;
    if (!initial.is_pro) {
      toast.info("Read-only handoff is a Pro feature", {
        description: "Upgrade to Pro to customize delivery and access modes for your rooms.",
        action: {
          label: "View Pro",
          onClick: () => router.push("/checkout"),
        },
      });
      return;
    }

    setUpdatingModeId(room.id);
    try {
      await updateHandoffRoom(room.id, {
        name: room.name || room.title || `Room ${room.slug}`,
        welcome_text: room.welcome_text || "",
        delivery_mode: targetMode,
        retention_days: room.retention_days === 30 ? 30 : 7,
      });
      room.delivery_mode = targetMode;
      toast.success(
        targetMode === "read_only"
          ? "Access mode changed to Read-only"
          : "Access mode changed to Collaborative"
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to update access mode");
    } finally {
      setUpdatingModeId(null);
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    void run(`delete-${roomId}`, async () => {
      await deleteSpace(roomId);
      toast.success("Room deleted");
      setConfirmDeleteId(null);
      if (expandedRoomId === roomId) setExpandedRoomId(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(roomId);
        return next;
      });
      router.refresh();
    });
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    void run("batch-delete", async () => {
      await Promise.all(Array.from(selectedIds).map((id) => deleteSpace(id)));
      toast.success(`${selectedIds.size} rooms deleted`);
      setSelectedIds(new Set());
      setConfirmBatchDelete(false);
      router.refresh();
    });
  };

  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <div className={styles.titleRow}>
            <h1>Your rooms</h1>
            <span className={styles.planBadge}>{initial.is_pro ? "Pro" : "Free"}</span>
          </div>
          <p className={styles.subtitle}>Manage your rooms and shared files.</p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/account" className={styles.accountLink}>
            <Settings2 size={16} aria-hidden="true" />
            Account
          </Link>
          <button
            className={`cta-button-glow ${styles.createButton}`}
            disabled={busy !== null}
            onClick={createRoom}
          >
            {busy === "create" ? (
              <Loader2 size={17} className="motion-safe:animate-spin" aria-hidden="true" />
            ) : (
              <Plus size={17} aria-hidden="true" />
            )}
            {busy === "create"
              ? "Creating…"
              : initial.is_pro
              ? "Create from template"
              : "Create room"}
          </button>
        </div>
      </header>

      <section className={styles.summary} aria-label="Room and storage summary">
        {/* Card 1: Total Rooms */}
        <div className={styles.summaryCard}>
          <div className={styles.cardHeader}>
            <div className={`${styles.cardIconBox} ${styles.iconBoxOrange}`}>
              <FolderKanban size={20} aria-hidden="true" />
            </div>
            <div className={styles.cardHeaderText}>
              <span className={styles.cardTitle}>Total Rooms</span>
              <span className={styles.cardSubtitle} title="All created handoff spaces">
                All handoff spaces
              </span>
            </div>
          </div>
          <div className={styles.cardBody}>
            <span className={styles.cardMetricValue}>{initial.rooms.length}</span>
            <span className={`${styles.cardBadge} ${styles.cardBadgeGreen}`}>
              <Check size={11} strokeWidth={2.5} aria-hidden="true" />
              {activeRooms.length} active
            </span>
          </div>
        </div>

        {/* Card 2: Active Rooms */}
        <div className={styles.summaryCard}>
          <div className={styles.cardHeader}>
            <div className={`${styles.cardIconBox} ${styles.iconBoxEmerald}`}>
              <Radio size={20} aria-hidden="true" />
            </div>
            <div className={styles.cardHeaderText}>
              <span className={styles.cardTitle}>Active Rooms</span>
              <span className={styles.cardSubtitle} title="Open to recipients right now">
                Open to recipients
              </span>
            </div>
          </div>
          <div className={styles.cardBody}>
            <span className={styles.cardMetricValue}>{activeRooms.length}</span>
            {initial.is_pro ? (
              <span className={`${styles.cardBadge} ${styles.cardBadgePro}`}>
                {initial.active_room_count} / {initial.active_room_limit} slots
              </span>
            ) : expiredRooms.length > 0 ? (
              <span className={`${styles.cardBadge} ${styles.cardBadgeMuted}`}>
                {expiredRooms.length} expired
              </span>
            ) : (
              <span className={`${styles.cardBadge} ${styles.cardBadgeGreen}`}>
                <span className={styles.badgeDot} aria-hidden="true" />
                100% active
              </span>
            )}
          </div>
        </div>

        {/* Card 3: Storage Used */}
        <div className={styles.summaryCard}>
          <div className={styles.cardHeader}>
            <div className={`${styles.cardIconBox} ${styles.iconBoxAmber}`}>
              <HardDrive size={20} aria-hidden="true" />
            </div>
            <div className={styles.cardHeaderText}>
              <span className={styles.cardTitle}>Storage Used</span>
              <span
                className={styles.cardSubtitle}
                title={`Of ${formatAccountBytes(initial.storage_limit_bytes)} quota`}
              >
                Of {formatAccountBytes(initial.storage_limit_bytes)} quota
              </span>
            </div>
          </div>
          <div className={styles.cardBody}>
            <span className={styles.cardMetricValue}>
              {formatAccountBytes(initial.storage_used_bytes)}
            </span>
            <span className={`${styles.cardBadge} ${styles.cardBadgeOrange}`}>
              {storagePercent}% used
            </span>
          </div>
        </div>

        {/* Card 4: Storage Left / Capacity */}
        <div className={styles.summaryCard}>
          <div className={styles.cardHeader}>
            <div className={`${styles.cardIconBox} ${styles.iconBoxSky}`}>
              <Cloud size={20} aria-hidden="true" />
            </div>
            <div className={styles.cardHeaderText}>
              <span className={styles.cardTitle}>Storage Left</span>
              <span className={styles.cardSubtitle} title="Available upload capacity">
                Available space
              </span>
            </div>
          </div>
          <div className={styles.cardBody}>
            <span className={styles.cardMetricValue}>
              {formatAccountBytes(remainingBytes)}
            </span>
            <span className={`${styles.cardBadge} ${styles.cardBadgeSky}`}>
              {freePercent}% free
            </span>
          </div>
        </div>
      </section>

      {initial.is_pro && (
        <div className={styles.templateBar}>
          <span>
            <Settings2 size={16} aria-hidden="true" />
            Handoff template
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy !== null}
            aria-expanded={templateOpen}
            onClick={() => setTemplateOpen(!templateOpen)}
          >
            {templateOpen ? "Close template" : "Edit template"}
          </Button>
        </div>
      )}

      {templateOpen && initial.is_pro && (
        <form
          className={styles.templatePanel}
          onSubmit={(event) => {
            event.preventDefault();
            void run("template", async () => {
              setTemplate(await saveHandoffTemplate(template));
              toast.success("Reusable template saved");
              setTemplateOpen(false);
              router.refresh();
            });
          }}
        >
          <h2>Your handoff template</h2>
          <p className={styles.settingsNote}>Default settings for your next rooms.</p>
          <fieldset disabled={busy !== null}>
            <SettingsFields value={template} onChange={setTemplate} template />
            <div className={styles.formActions}>
              <Button type="button" variant="outline" onClick={() => setTemplateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {busy === "template" ? "Saving…" : "Save template"}
              </Button>
            </div>
          </fieldset>
        </form>
      )}

      <section aria-label="Your rooms" className={styles.roomsSection}>
        {/* Top Controls Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.tabsGroup} role="tablist" aria-label="Room views">
            <button
              type="button"
              role="tab"
              aria-selected={viewTab === "all"}
              className={`${styles.tabItem} ${
                viewTab === "all" ? styles.tabItemActive : ""
              }`}
              onClick={() => {
                setViewTab("all");
                setPage(1);
              }}
            >
              All rooms
              <span className={styles.tabCount}>{initial.rooms.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewTab === "active"}
              className={`${styles.tabItem} ${
                viewTab === "active" ? styles.tabItemActive : ""
              }`}
              onClick={() => {
                setViewTab("active");
                setPage(1);
              }}
            >
              Active
              <span className={styles.tabCount}>{activeRooms.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewTab === "expired"}
              className={`${styles.tabItem} ${
                viewTab === "expired" ? styles.tabItemActive : ""
              }`}
              onClick={() => {
                setViewTab("expired");
                setPage(1);
              }}
            >
              Expired
              <span className={styles.tabCount}>{expiredRooms.length}</span>
            </button>
          </div>

          <div className={styles.toolbarRight}>
            <div className={styles.searchField}>
              <Search size={16} aria-hidden="true" />
              <Input
                aria-label="Search your rooms"
                type="search"
                placeholder="Search rooms or codes"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
              {search && (
                <button
                  aria-label="Clear search"
                  onClick={() => {
                    setSearch("");
                    setPage(1);
                  }}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Batch Selection Bar */}
        {selectedIds.size > 0 && (
          <div className={styles.batchBar} role="region" aria-label="Batch actions">
            <div className={styles.batchInfo}>
              <span className={styles.batchCountBadge}>{selectedIds.size}</span>
              <span>{selectedIds.size === 1 ? "room selected" : "rooms selected"}</span>
            </div>
            <div className={styles.batchActions}>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => {
                  setSelectedIds(new Set());
                  setConfirmBatchDelete(false);
                }}
              >
                Clear selection
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy !== null}
                onClick={() => setConfirmBatchDelete(true)}
              >
                <Trash2 size={14} aria-hidden="true" /> Delete selected
              </Button>
            </div>
          </div>
        )}

        {/* Table / Empty State */}
        {filteredRooms.length > 0 ? (
          <div className={styles.tableWrapper}>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.thCheckbox}>
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        ref={(el) => {
                          if (el) {
                            el.indeterminate = someVisibleSelected;
                          }
                        }}
                        onChange={toggleSelectAll}
                        aria-label="Select all visible rooms on this page"
                      />
                    </th>
                    <th
                      className={styles.thSortable}
                      onClick={() => handleSort("name")}
                      title="Sort by room name"
                    >
                      <div className={styles.thHeaderContent}>
                        <span>Room</span>
                        {sortBy === "name" ? (
                          sortDirection === "asc" ? (
                            <ChevronUp size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          )
                        ) : (
                          <ArrowUpDown size={12} className={styles.thSortMuted} />
                        )}
                      </div>
                    </th>
                    <th
                      className={styles.thSortable}
                      onClick={() => handleSort("status")}
                      title="Sort by status"
                    >
                      <div className={styles.thHeaderContent}>
                        <span>Status</span>
                        {sortBy === "status" ? (
                          sortDirection === "asc" ? (
                            <ChevronUp size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          )
                        ) : null}
                      </div>
                    </th>
                    <th>Access Mode</th>
                    <th
                      className={styles.thSortable}
                      onClick={() => handleSort("expires_at")}
                      title="Sort by deadline"
                    >
                      <div className={styles.thHeaderContent}>
                        <span>Deadline</span>
                        {sortBy === "expires_at" ? (
                          sortDirection === "asc" ? (
                            <ChevronUp size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          )
                        ) : null}
                      </div>
                    </th>
                    <th
                      className={styles.thSortable}
                      onClick={() => handleSort("created_at")}
                      title="Sort by creation date"
                    >
                      <div className={styles.thHeaderContent}>
                        <span>Created</span>
                        {sortBy === "created_at" ? (
                          sortDirection === "asc" ? (
                            <ChevronUp size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          )
                        ) : (
                          <ArrowUpDown size={12} className={styles.thSortMuted} />
                        )}
                      </div>
                    </th>
                    <th className={styles.thActions}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRooms.map((room) => {
                    const active = roomIsActive(room, now);
                    const deadline = roomExpiryTimestamp(room);
                    const name = room.name || room.title || `Room ${room.slug}`;
                    const isSelected = selectedIds.has(room.id);
                    const isExpanded = expandedRoomId === room.id;
                    const isConfirmingDelete = confirmDeleteId === room.id;

                    return (
                      <Fragment key={room.id}>
                        <tr
                          className={`${isSelected ? styles.selectedRow : ""} ${
                            active ? "" : styles.expiredRow
                          }`}
                        >
                          <td className={styles.checkboxCell}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectRoom(room.id)}
                              aria-label={`Select room ${name}`}
                            />
                          </td>
                          <td>
                            <div className={styles.roomCell}>
                              {Boolean(
                                room.name &&
                                room.name.trim() !== "" &&
                                room.name.trim() !== `Room ${room.slug}` &&
                                room.name.trim() !== room.slug
                              ) ? (
                                <>
                                  <span
                                    className={`${styles.roomCode} ${
                                      isLegacyRoomSlug(room.slug) ? "" : styles.namedRoomCode
                                    }`}
                                    title={room.slug}
                                  >
                                    {room.slug}
                                  </span>
                                  <div className={styles.roomInfo}>
                                    <Link
                                      href={`/${room.slug}`}
                                      className={styles.tableRoomName}
                                      title={name}
                                    >
                                      {name}
                                    </Link>
                                    {room.welcome_text && (
                                      <span
                                        className={styles.tableRoomDesc}
                                        title={room.welcome_text}
                                      >
                                        {room.welcome_text}
                                      </span>
                                    )}
                                  </div>
                                </>
                              ) : (
                                <div className={styles.roomInfo}>
                                  <Link
                                    href={`/${room.slug}`}
                                    className={styles.tableRoomName}
                                    title={`Room ${room.slug}`}
                                  >
                                    Room {room.slug}
                                  </Link>
                                  {room.welcome_text && (
                                    <span
                                      className={styles.tableRoomDesc}
                                      title={room.welcome_text}
                                    >
                                      {room.welcome_text}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          <td>
                            <span
                              className={`${styles.statusBadge} ${
                                active ? styles.statusActive : styles.statusExpired
                              }`}
                            >
                              <span className={styles.statusDot} />
                              {active ? "Active" : "Expired"}
                            </span>
                          </td>
                          <td>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  disabled={updatingModeId === room.id || !active}
                                  className={styles.modeBadgeButton}
                                  title={
                                    active
                                      ? "Click to change access mode"
                                      : "Access mode is locked for expired room"
                                  }
                                  aria-label={`Change access mode for ${name}. Currently ${
                                    room.delivery_mode === "read_only"
                                      ? "Read-only"
                                      : "Collaborative"
                                  }`}
                                >
                                  {updatingModeId === room.id ? (
                                    <Loader2 size={12} className="animate-spin text-[#ff5a00]" />
                                  ) : room.delivery_mode === "read_only" ? (
                                    <LockKeyhole size={13} aria-hidden="true" />
                                  ) : (
                                    <Users size={13} aria-hidden="true" />
                                  )}
                                  <span>
                                    {room.delivery_mode === "read_only"
                                      ? "Read-only"
                                      : "Collaborative"}
                                  </span>
                                  {active && (
                                    <ChevronDown
                                      size={11}
                                      className={styles.modeChevron}
                                      aria-hidden="true"
                                    />
                                  )}
                                  {room.code_enabled === false && (
                                    <span className={styles.codeClosedTag}>Closed</span>
                                  )}
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="start"
                                className="w-60 p-1.5 rounded-xl border border-border bg-popover shadow-xl z-50"
                              >
                                <DropdownMenuLabel className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1.5">
                                  Change access mode
                                </DropdownMenuLabel>
                                <DropdownMenuItem
                                  onClick={() => void handleSetAccessMode(room, "collaborative")}
                                  className="flex items-start gap-2.5 p-2 rounded-lg cursor-pointer transition hover:bg-accent"
                                >
                                  <Users className="h-4 w-4 mt-0.5 text-orange-500 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                                      <span>Collaborative</span>
                                      {room.delivery_mode !== "read_only" && (
                                        <Check className="h-3.5 w-3.5 text-[#ff5a00]" />
                                      )}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                                      Recipients can post files & notes
                                    </p>
                                  </div>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => void handleSetAccessMode(room, "read_only")}
                                  className="flex items-start gap-2.5 p-2 rounded-lg cursor-pointer transition hover:bg-accent"
                                >
                                  <LockKeyhole className="h-4 w-4 mt-0.5 text-orange-500 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                                      <span>Read-only</span>
                                      {room.delivery_mode === "read_only" && (
                                        <Check className="h-3.5 w-3.5 text-[#ff5a00]" />
                                      )}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                                      Recipients can only view & download
                                    </p>
                                  </div>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                          <td>
                            {deadline ? (
                              <div className={styles.timeCell}>
                                <Clock3 size={13} aria-hidden="true" />
                                <span>
                                  {active ? "Closes" : "Closed"}{" "}
                                  <LocalDateTime value={deadline} />
                                </span>
                              </div>
                            ) : (
                              <div className={styles.timeCell}>
                                <InfinityIcon size={14} aria-hidden="true" />
                                <span>No time limit</span>
                              </div>
                            )}
                          </td>
                          <td>
                            <span className={styles.dateCell}>
                              <LocalDateTime value={room.created_at} />
                            </span>
                          </td>
                          <td>
                            <div className={styles.actionsCell}>
                              <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className={styles.openButton}
                              >
                                <Link href={`/${room.slug}`}>Open room</Link>
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                disabled={busy !== null}
                                onClick={() => void handleCopyLink(room)}
                                className={`${styles.copyIconButton} ${
                                  copiedId === room.id ? styles.copiedButton : ""
                                }`}
                                title={copiedId === room.id ? "Link copied!" : "Copy invitation link"}
                                aria-label={`Copy link for ${name}`}
                              >
                                {copiedId === room.id ? (
                                  <Check
                                    size={15}
                                    className={styles.copyCheckIcon}
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <Link2 size={15} aria-hidden="true" />
                                )}
                              </Button>
                              {initial.is_pro && active && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  disabled={busy !== null}
                                  aria-expanded={isExpanded}
                                  onClick={() => {
                                    setExpandedRoomId(isExpanded ? null : room.id);
                                    setConfirmDeleteId(null);
                                  }}
                                  className={styles.settingsIconButton}
                                  title="Room settings & identity"
                                  aria-label={`Settings for ${name}`}
                                >
                                  <Settings2 size={15} aria-hidden="true" />
                                </Button>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                className={styles.deleteButton}
                                disabled={busy !== null}
                                aria-label={`Delete ${name}`}
                                title="Delete room"
                                onClick={() => {
                                  setConfirmDeleteId(room.id);
                                  if (isExpanded) setExpandedRoomId(null);
                                }}
                              >
                                <Trash2 size={15} aria-hidden="true" />
                              </Button>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded Settings Panel Row */}
                        {isExpanded && initial.is_pro && active && (
                          <tr className={styles.expandedRow}>
                            <td colSpan={7}>
                              <div className={styles.expandedPanel}>
                                <div className={styles.expandedHeader}>
                                  <div className={styles.expandedTabs}>
                                    <button
                                      type="button"
                                      className={`${styles.expandedTab} ${
                                        expandedTab === "settings"
                                          ? styles.expandedTabActive
                                          : ""
                                      }`}
                                      onClick={() => setExpandedTab("settings")}
                                    >
                                      <Settings2 size={14} /> Handoff settings
                                    </button>
                                    <button
                                      type="button"
                                      className={`${styles.expandedTab} ${
                                        expandedTab === "identity"
                                          ? styles.expandedTabActive
                                          : ""
                                      }`}
                                      onClick={() => setExpandedTab("identity")}
                                    >
                                      <Pencil size={14} /> Name & URL
                                    </button>
                                  </div>
                                  <button
                                    type="button"
                                    className={styles.expandedCloseBtn}
                                    onClick={() => setExpandedRoomId(null)}
                                    aria-label="Close settings panel"
                                  >
                                    <X size={16} />
                                  </button>
                                </div>

                                {expandedTab === "identity" ? (
                                  <RoomIdentityEditor
                                    space={room}
                                    onCancel={() => setExpandedRoomId(null)}
                                    onSave={async (nextName, slug) => {
                                      if (operationPending.current) {
                                        throw new Error(
                                          "A room update is already in progress."
                                        );
                                      }
                                      operationPending.current = true;
                                      setBusy(`identity-${room.id}`);
                                      try {
                                        const result = await updateRoomIdentity(
                                          room.id,
                                          nextName,
                                          slug
                                        );
                                        if (!result.ok) throw new Error(result.error);
                                        migrateRoomBrowserState(room, result.space);
                                        toast.success("Room saved");
                                        setExpandedRoomId(null);
                                        router.refresh();
                                      } finally {
                                        operationPending.current = false;
                                        setBusy(null);
                                      }
                                    }}
                                  />
                                ) : (
                                  <RoomSettingsForm
                                    room={room}
                                    onClose={() => setExpandedRoomId(null)}
                                    onSaved={() => {
                                      setExpandedRoomId(null);
                                      router.refresh();
                                    }}
                                  />
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className={styles.tableFooter}>
              <div className={styles.paginationInfo}>
                Page {safePage} of {totalPages}
                <span className={styles.paginationCount}>
                  · Showing {(safePage - 1) * PAGE_SIZE + 1}–
                  {Math.min(safePage * PAGE_SIZE, filteredRooms.length)} of{" "}
                  {filteredRooms.length} {filteredRooms.length === 1 ? "room" : "rooms"}
                </span>
              </div>
              <div className={styles.paginationButtons}>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className={styles.paginationBtn}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className={styles.paginationBtn}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>
              {query ? (
                <Search size={26} aria-hidden="true" />
              ) : (
                <Link2 size={26} aria-hidden="true" />
              )}
            </span>
            <h3>
              {query
                ? "No matching rooms"
                : viewTab === "expired"
                ? "No expired rooms"
                : initial.rooms.length
                ? "No active rooms"
                : "Your first room starts here"}
            </h3>
            <p>
              {query
                ? "Try another name or room code."
                : initial.rooms.length
                ? "Switch filter tab or create a new room."
                : "Create a room and share its link."}
            </p>
            {query ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
              >
                Clear search
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={createRoom}
              >
                <Plus size={16} aria-hidden="true" /> Create room
              </Button>
            )}
          </div>
        )}
      </section>

      {/* Delete Single Room Confirmation Modal */}
      <AlertDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => {
          if (!open && busy === null) {
            setConfirmDeleteId(null);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-md rounded-2xl">
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <AlertDialogTitle className="text-lg font-bold">
                  Delete room
                </AlertDialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  This action cannot be undone
                </p>
              </div>
            </div>
            <AlertDialogDescription className="text-sm text-foreground/80 pt-2 leading-relaxed">
              Are you sure you want to delete{" "}
              <strong className="text-foreground font-semibold">
                {roomToDelete?.name ||
                  (roomToDelete?.slug
                    ? `Room ${roomToDelete.slug}`
                    : "this room")}
              </strong>
              ? All uploaded files, media, and notes in this room will be permanently removed immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2 sm:gap-0">
            <AlertDialogCancel
              disabled={busy !== null}
              onClick={() => setConfirmDeleteId(null)}
              className="rounded-xl"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy !== null}
              onClick={(e) => {
                e.preventDefault();
                if (confirmDeleteId) {
                  void handleDeleteRoom(confirmDeleteId);
                }
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold rounded-xl"
            >
              {busy === `delete-${confirmDeleteId}` ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Delete room
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch Delete Confirmation Modal */}
      <AlertDialog
        open={confirmBatchDelete}
        onOpenChange={(open) => {
          if (!open && busy === null) {
            setConfirmBatchDelete(false);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-md rounded-2xl">
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <AlertDialogTitle className="text-lg font-bold">
                  Delete {selectedIds.size} {selectedIds.size === 1 ? "room" : "rooms"}
                </AlertDialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Permanent bulk deletion
                </p>
              </div>
            </div>
            <AlertDialogDescription className="text-sm text-foreground/80 pt-2 leading-relaxed">
              Are you sure you want to delete these{" "}
              <strong className="text-foreground font-semibold">
                {selectedIds.size} selected {selectedIds.size === 1 ? "room" : "rooms"}
              </strong>
              ? All files, media, and notes across these rooms will be permanently erased.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2 sm:gap-0">
            <AlertDialogCancel
              disabled={busy !== null}
              onClick={() => setConfirmBatchDelete(false)}
              className="rounded-xl"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy !== null}
              onClick={(e) => {
                e.preventDefault();
                handleBatchDelete();
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold rounded-xl"
            >
              {busy === "batch-delete" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Delete {selectedIds.size} {selectedIds.size === 1 ? "room" : "rooms"}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
