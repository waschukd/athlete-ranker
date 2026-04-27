"use client";

// Drop-in branded icon for any page that knows an organization id but
// doesn't already have the org name + logo_url loaded. Fetches the org
// from /api/organizations/[orgId] (React Query caches per-orgId) and
// renders OrgAvatar — uploaded logo if present, colored initials otherwise.
//
// Use this anywhere a hardcoded Sideline Star mark or generic building icon
// used to live in an org-specific page header.

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { OrgAvatar } from "@/lib/orgVisuals";

export function OrgBrandIcon({ orgId, size = 44, className = "", fallbackName }) {
  const { data } = useQuery({
    queryKey: ["org", String(orgId)],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${orgId}`);
      if (!res.ok) throw new Error("org fetch failed");
      return res.json();
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });
  const org = data?.organization;
  return (
    <OrgAvatar
      name={org?.name || fallbackName}
      logoUrl={org?.logo_url}
      size={size}
      className={className}
    />
  );
}
