"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClientSupabaseClient } from "@/lib/supabase-browser";
import type { Entry } from "@/components/entry-card";
import type { Space } from "@/lib/actions";
import { displayNameForDevice } from "@/lib/display-name";

const UNSEEN_READING_DWELL_MS = 4_000;

function dedupeEntries(items: Entry[]): Entry[] {
  const map = new Map<string, Entry>();
  for (const item of items) {
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
    } else {
      map.set(item.id, {
        ...existing,
        ...item,
        isLoading: item.isLoading ?? existing.isLoading,
        uploadProgress: item.uploadProgress ?? existing.uploadProgress,
      });
    }
  }
  return Array.from(map.values());
}

interface UseSpaceRealtimeProps {
  space: Space;
  initialEntries: Entry[];
  currentDeviceId?: string | null;
  onIncomingMessage?: () => void;
  onRoomUpdated?: (room: Space) => void;
}

export function useSpaceRealtime({
  space,
  initialEntries,
  currentDeviceId,
  onIncomingMessage,
  onRoomUpdated,
}: UseSpaceRealtimeProps) {
  const [entries, setEntriesState] = useState<Entry[]>(() =>
    dedupeEntries(initialEntries),
  );
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [onlineCount, setOnlineCount] = useState(1);
  const [newItemsCount, setNewItemsCount] = useState(0);
  const [firstUnseenEntryId, setFirstUnseenEntryId] = useState<string | null>(null);
  const [unseenMessageCount, setUnseenMessageCount] = useState(0);
  const [tabUnreadCount, setTabUnreadCount] = useState(0);

  const isNearBottomRef = useRef(true);
  const knownEntryIdsRef = useRef(
    new Set(dedupeEntries(initialEntries).map((e) => e.id)),
  );
  const onIncomingMessageRef = useRef(onIncomingMessage);
  const onRoomUpdatedRef = useRef(onRoomUpdated);
  const roomRef = useRef(space);
  useEffect(() => {
    onIncomingMessageRef.current = onIncomingMessage;
    onRoomUpdatedRef.current = onRoomUpdated;
    roomRef.current = space;
  });

  const scrollToBottom = useCallback(() => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "smooth",
    });
    setNewItemsCount(0);
  }, []);

  const setEntries = useCallback((action: React.SetStateAction<Entry[]>) => {
    setEntriesState((prev) => {
      const next = typeof action === "function" ? action(prev) : action;
      const deduped = dedupeEntries(next);
      for (const entry of deduped) {
        knownEntryIdsRef.current.add(entry.id);
      }
      return deduped;
    });
  }, []);

  const handleNewEntry = useCallback(
    (entry: Entry) => {
      knownEntryIdsRef.current.add(entry.id);
      setEntries((prev) => {
        if (prev.some((e) => e.id === entry.id)) return prev;
        return [...prev, entry];
      });
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    },
    [scrollToBottom, setEntries],
  );

  const handleUpdateEntry = useCallback(
    (entryId: string, updates: Partial<Entry>) => {
      if (updates.id) {
        knownEntryIdsRef.current.add(updates.id);
      }
      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === entryId ? { ...entry, ...updates } : entry,
        ),
      );
    },
    [setEntries],
  );

  const handleReplaceEntry = useCallback(
    (placeholderId: string, realEntry: Entry) => {
      knownEntryIdsRef.current.add(realEntry.id);
      knownEntryIdsRef.current.delete(placeholderId);

      setEntries((prev) => {
        const existingRealIdx = prev.findIndex((e) => e.id === realEntry.id);
        const existingPlaceholderIdx = prev.findIndex(
          (e) => e.id === placeholderId,
        );

        if (existingPlaceholderIdx !== -1 && existingRealIdx !== -1) {
          return prev
            .filter((e) => e.id !== placeholderId)
            .map((e) =>
              e.id === realEntry.id
                ? { ...e, ...realEntry, isLoading: false, isError: false }
                : e,
            );
        }

        if (existingPlaceholderIdx !== -1) {
          const next = [...prev];
          next[existingPlaceholderIdx] = {
            ...realEntry,
            isLoading: false,
            isError: false,
          };
          return dedupeEntries(next);
        }

        if (existingRealIdx !== -1) {
          const next = [...prev];
          next[existingRealIdx] = {
            ...next[existingRealIdx],
            ...realEntry,
            isLoading: false,
            isError: false,
          };
          return next;
        }

        return [...prev, realEntry];
      });
    },
    [setEntries],
  );

  const handleRemoveEntry = useCallback(
    (entryId: string) => {
      knownEntryIdsRef.current.delete(entryId);
      setEntries((prev) => prev.filter((entry) => entry.id !== entryId));
    },
    [setEntries],
  );

  const addEntryIfNotExists = useCallback(
    (newEntry: Entry) => {
      if (knownEntryIdsRef.current.has(newEntry.id)) {
        setEntries((prev) => {
          const idx = prev.findIndex((e) => e.id === newEntry.id);
          if (idx !== -1 && prev[idx].isLoading) {
            const next = [...prev];
            next[idx] = { ...prev[idx], ...newEntry, isLoading: false };
            return next;
          }
          return prev;
        });
        return false;
      }

      knownEntryIdsRef.current.add(newEntry.id);

      let wasAppended = false;
      setEntries((prev) => {
        if (prev.some((e) => e.id === newEntry.id)) {
          return prev;
        }

        if (
          currentDeviceId &&
          newEntry.created_by_device_id === currentDeviceId
        ) {
          const pendingIdx = prev.findIndex(
            (e) =>
              e.isLoading &&
              e.id.startsWith("temp-") && e.kind === newEntry.kind && e.text === newEntry.text,
          );
          if (pendingIdx !== -1) {
            const pendingEntry = prev[pendingIdx];
            knownEntryIdsRef.current.delete(pendingEntry.id);
            const next = [...prev];
            next[pendingIdx] = { ...newEntry, isLoading: false };
            wasAppended = false;
            return dedupeEntries(next);
          }
        }

        wasAppended = true;
        return [...prev, newEntry];
      });

      return wasAppended;
    },
    [currentDeviceId, setEntries],
  );

  // Track window scroll to see if user is near bottom
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

  // Clear unread tab count on focus
  useEffect(() => {
    const clearTabCounter = () => {
      if (document.visibilityState === "visible" && document.hasFocus()) {
        setTabUnreadCount(0);
      }
    };
    window.addEventListener("focus", clearTabCounter);
    document.addEventListener("visibilitychange", clearTabCounter);
    return () => {
      window.removeEventListener("focus", clearTabCounter);
      document.removeEventListener("visibilitychange", clearTabCounter);
    };
  }, []);

  // Dwell timer to mark unseen message as read
  useEffect(() => {
    if (!firstUnseenEntryId) return;
    let seenTimer: number | null = null;
    const checkIfSeen = () => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) {
        if (seenTimer) window.clearTimeout(seenTimer);
        seenTimer = null;
        return;
      }
      const target = document.getElementById(`entry-${firstUnseenEntryId}`);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const visibleHeight =
        Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
      const isSeen = visibleHeight >= Math.min(rect.height * 0.5, 120);
      if (isSeen && !seenTimer) {
        seenTimer = window.setTimeout(() => {
          setFirstUnseenEntryId(null);
          setUnseenMessageCount(0);
        }, UNSEEN_READING_DWELL_MS);
      } else if (!isSeen && seenTimer) {
        window.clearTimeout(seenTimer);
        seenTimer = null;
      }
    };
    const frame = requestAnimationFrame(checkIfSeen);
    window.addEventListener("scroll", checkIfSeen, { passive: true });
    window.addEventListener("resize", checkIfSeen, { passive: true });
    window.addEventListener("focus", checkIfSeen);
    document.addEventListener("visibilitychange", checkIfSeen);
    return () => {
      cancelAnimationFrame(frame);
      if (seenTimer) window.clearTimeout(seenTimer);
      window.removeEventListener("scroll", checkIfSeen);
      window.removeEventListener("resize", checkIfSeen);
      window.removeEventListener("focus", checkIfSeen);
      document.removeEventListener("visibilitychange", checkIfSeen);
    };
  }, [firstUnseenEntryId]);

  // Real-time channel subscription
  useEffect(() => {
    const supabase = createClientSupabaseClient();
    const presenceKey = currentDeviceId || crypto.randomUUID();
    let disposed = false;
    let reconciling = false;
    let reconcileAgain = false;
    const changes = new Map<string, Entry | null>();
    const reconcileEntries = () => {
      if (disposed) return;
      if (reconciling) { reconcileAgain = true; return; }
      reconciling = true;
      changes.clear();
      // Room codes can change. Resolve this already-authorized room by UUID so
      // reconnecting never joins an unrelated room through a retired code.
      void Promise.resolve(supabase.from("spaces").select("slug").eq("id", space.id).maybeSingle())
        .then(async ({ data: room, error: lookupError }) => {
          if (disposed || lookupError || !room?.slug) return;
          const { data, error } = await supabase.rpc("open_space", { p_slug: room.slug, p_display_name: displayNameForDevice(presenceKey) });
          if (disposed || error || data?.space?.id !== space.id) return;
          roomRef.current = data.space;
          onRoomUpdatedRef.current?.(data.space);
          const latest = new Map<string, Entry>((data.entries || []).map((entry: Entry) => [entry.id, entry]));
          changes.forEach((entry, id) => { if (entry) latest.set(id, entry); else latest.delete(id); });
          setEntries((current) => {
            const pending = current.filter((entry) => entry.isLoading && (entry.id.startsWith("temp-") || entry.id.startsWith("placeholder-")));
            const next = [...latest.values(), ...pending].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
            knownEntryIdsRef.current = new Set(next.map((entry) => entry.id));
            return next;
          });
        }).catch(() => { /* Retain visible data until a later successful reconciliation. */ })
        .finally(() => {
          reconciling = false;
          changes.clear();
          if (reconcileAgain) { reconcileAgain = false; reconcileEntries(); }
        });
    };

    const channel = supabase
      .channel(`space:${space.id}`, {
        config: { presence: { key: presenceKey } },
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setOnlineCount(Math.max(1, Object.keys(state).length));
      })
      .on("system", { event: "*" }, (payload) => {
        // A channel join can finish before a cold Postgres replication worker.
        // Recover writes made between the page snapshot and actual readiness.
        if (payload.extension === "postgres_changes" && payload.status === "ok") reconcileEntries();
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "spaces", filter: `id=eq.${space.id}`,
      }, (payload) => {
        const next = payload.new as Partial<Space>;
        const current = roomRef.current;
        // Ordinary activity on an unlimited room doesn't need a full snapshot.
        if (["slug", "expires_at", "expiry_mode", "code_enabled", "pairing_expires_at", "access_version", "delivery_mode", "name", "welcome_text"]
          .some(key => next[key as keyof Space] !== current[key as keyof Space])) reconcileEntries();
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
          if (reconciling) changes.set(newEntry.id, newEntry);
          const added = addEntryIfNotExists(newEntry);
          if (!added) return;
          const isIncoming = newEntry.created_by_device_id !== currentDeviceId;
          if (isIncoming) {
            onIncomingMessageRef.current?.();
            setFirstUnseenEntryId((current) => current || newEntry.id);
            setUnseenMessageCount((count) => count + 1);
            if (document.hidden || !document.hasFocus()) {
              setTabUnreadCount((count) => count + 1);
            }
          }
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
          if (reconciling) changes.set(updatedEntry.id, updatedEntry);
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
            if (reconciling) changes.set(oldEntry.id, null);
            knownEntryIdsRef.current.delete(oldEntry.id);
            setEntries((prev) =>
              prev.filter((entry) => entry.id !== oldEntry.id),
            );
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnectionStatus("connected");
          void channel.track({ online_at: new Date().toISOString() });
          // Reconcile the initial join and reconnects, replaying concurrent
          // events so a snapshot cannot overwrite newer changes.
          reconcileEntries();
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          setConnectionStatus("disconnected");
        } else {
          setConnectionStatus("connecting");
        }
      });

    return () => {
      disposed = true;
      void supabase.removeChannel(channel);
    };
  }, [
    space.id,
    space.slug,
    currentDeviceId,
    addEntryIfNotExists,
    scrollToBottom,
    setEntries,
  ]);

  return {
    entries,
    setEntries,
    handleNewEntry,
    handleReplaceEntry,
    handleUpdateEntry,
    handleRemoveEntry,
    connectionStatus,
    onlineCount,
    newItemsCount,
    setNewItemsCount,
    firstUnseenEntryId,
    unseenMessageCount,
    tabUnreadCount,
    scrollToBottom,
  };
}
