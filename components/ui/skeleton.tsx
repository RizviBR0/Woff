"use client";

import { memo } from "react";

interface SkeletonProps {
  className?: string;
}

export const Skeleton = memo(function Skeleton({
  className = "",
}: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-muted/60 rounded ${className}`}
      aria-hidden="true"
    />
  );
});

// Entry card skeleton for loading states
export const EntryCardSkeleton = memo(function EntryCardSkeleton() {
  return (
    <div className="flex gap-3 p-3 animate-in fade-in-0 duration-300">
      {/* Avatar skeleton */}
      <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />

      {/* Content skeleton */}
      <div className="flex-1 space-y-2">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-12" />
        </div>

        {/* Text content */}
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
});

// Image entry skeleton
export const ImageEntrySkeleton = memo(function ImageEntrySkeleton() {
  return (
    <div className="flex gap-3 p-3 animate-in fade-in-0 duration-300">
      {/* Avatar skeleton */}
      <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />

      {/* Content skeleton */}
      <div className="flex-1 space-y-2">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-12" />
        </div>

        {/* Image placeholder */}
        <Skeleton className="h-48 w-full max-w-md rounded-lg" />
      </div>
    </div>
  );
});

// Multiple entry skeletons
export const EntriesLoadingSkeleton = memo(function EntriesLoadingSkeleton({
  count = 3,
}: {
  count?: number;
}) {
  return (
    <div className="space-y-1">
      {Array.from({ length: count }).map((_, i) => (
        <EntryCardSkeleton key={i} />
      ))}
    </div>
  );
});

// Space header skeleton
export const SpaceHeaderSkeleton = memo(function SpaceHeaderSkeleton() {
  return (
    <div className="flex items-center justify-between p-4 border-b">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded" />
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
    </div>
  );
});

// Full page loading skeleton
export const PageLoadingSkeleton = memo(function PageLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <SpaceHeaderSkeleton />
      <div className="max-w-4xl mx-auto p-4">
        <EntriesLoadingSkeleton count={5} />
      </div>
    </div>
  );
});
