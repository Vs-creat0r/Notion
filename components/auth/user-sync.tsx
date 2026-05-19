"use client";

/**
 * User Sync Component - Custom Auth
 * Checks if the current user exists in Convex and is active.
 * Redirects disabled or missing users to login.
 * 
 * IMPORTANT: Uses useConvexAuth() to wait for Convex to have the auth token
 * before running getCurrentUser. This prevents a race condition where the
 * query runs before the token is sent, returning identity=null and triggering
 * a premature logout.
 */

import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/app/providers/auth-provider";
import { useRouter } from "next/navigation";

export function UserSync() {
  const { user: authUser, isAuthenticated, logout } = useAuth();
  const { isAuthenticated: isConvexAuthed, isLoading: isConvexLoading } = useConvexAuth();
  const router = useRouter();

  // CRITICAL: Only run getCurrentUser AFTER Convex has received the auth token.
  // If we query before the token is sent, identity will be null and we'll
  // incorrectly log the user out.
  const currentUser = useQuery(
    api.users.getCurrentUser,
    isConvexAuthed ? undefined : "skip"
  );

  const hasCheckedRef = useRef(false);
  const mountTimeRef = useRef(Date.now());

  useEffect(() => {
    if (!isAuthenticated || !authUser) {
      hasCheckedRef.current = false;
      return;
    }

    // Wait for Convex auth to be ready
    if (isConvexLoading || !isConvexAuthed) return;

    // Wait for Convex query to resolve
    if (currentUser === undefined) return;

    if (hasCheckedRef.current) return;

    // Give Convex a little extra time after auth is ready
    const timeSinceMount = Date.now() - mountTimeRef.current;
    const delay = Math.max(0, 3000 - timeSinceMount);

    const timer = setTimeout(() => {
      if (currentUser === null) {
        // User not in Convex — logout
        console.warn("User not found in Convex, logging out");
        hasCheckedRef.current = true;
        logout().then(() => router.push("/login?error=not_found"));
        return;
      }

      if (currentUser && !currentUser.isActive) {
        // User disabled
        hasCheckedRef.current = true;
        logout().then(() => router.push("/login?disabled=true"));
        return;
      }

      hasCheckedRef.current = true;
    }, delay);

    return () => clearTimeout(timer);
  }, [isAuthenticated, authUser, currentUser, isConvexAuthed, isConvexLoading, logout, router]);

  return null;
}
