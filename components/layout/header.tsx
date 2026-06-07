"use client";

/**
 * Header Component
 * 
 * Top navigation bar with user info, theme toggle, chat, and logout.
 */

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useEffect, Suspense, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "./user-menu";
import { ChatIcon } from "@/components/chat/chat-icon";
import { ChatWindow } from "@/components/chat/chat-window";
import { ResizableChatSheet } from "@/components/chat/resizable-chat-sheet";
import { useChatWidth } from "@/components/chat/chat-width-provider";
import { StickyNotesIcon } from "@/components/sticky-notes/sticky-notes-icon";
import { StickyNotesWindow } from "@/components/sticky-notes/sticky-notes-window";
import { FloatingStickyNotes } from "@/components/sticky-notes/floating-sticky-notes";
import { ResizableStickyNotesSheet } from "@/components/sticky-notes/resizable-sticky-notes-sheet";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { MobileSidebar } from "./mobile-sidebar";
import { Role } from "@/lib/auth/roles";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { NotificationBell } from "@/components/notifications/notification-bell";

interface HeaderProps {
  userRole: Role;
}

function HeaderContent({ userRole }: HeaderProps) {
  const currentUser = useQuery(api.users.getCurrentUser);
  const { isChatOpen, setIsChatOpen, isStickyNotesOpen, setIsStickyNotesOpen } = useChatWidth();
  const [isMounted, setIsMounted] = useState(false);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    // Check for sticky notes param
    if (searchParams.get("sticky-notes") === "true") {
      setIsStickyNotesOpen(true);
      setIsChatOpen(false);
      // Clean up URL
      const params = new URLSearchParams(searchParams.toString());
      params.delete("sticky-notes");
      router.replace(`${pathname}?${params.toString()}`);
    }

    // Check for chat param
    const chatParam = searchParams.get("chat");
    if (chatParam) {
      setIsChatOpen(true);
      setIsStickyNotesOpen(false);
      // Clean up URL
      const params = new URLSearchParams(searchParams.toString());
      params.delete("chat");
      router.replace(`${pathname}?${params.toString()}`);
    }
  }, [searchParams, setIsStickyNotesOpen, setIsChatOpen, router, pathname]);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center justify-between px-4 md:px-6">
        {/* Mobile menu (< md) */}
        <div className="md:hidden">
          {isMounted ? (
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-64">
                <VisuallyHidden>
                  <SheetTitle>Navigation Menu</SheetTitle>
                </VisuallyHidden>
                <MobileSidebar userRole={userRole} />
              </SheetContent>
            </Sheet>
          ) : (
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          )}
        </div>

        {/* Desktop: Empty space (brand is in sidebar) */}
        <div className="hidden md:block" />

        {/* Right side: Sticky Notes + Chat + Theme toggle + User Menu */}
        <div className="flex items-center gap-2 md:gap-4">
          {isMounted && currentUser && (
            <>
              <NotificationBell />
              <StickyNotesIcon
                onClick={() => {
                  if (isStickyNotesOpen) {
                    // If open, close it
                    setIsStickyNotesOpen(false);
                  } else {
                    // If closed, open it and close chat
                    setIsStickyNotesOpen(true);
                    setIsChatOpen(false);
                  }
                }}
                isActive={isStickyNotesOpen}
              />
              <ChatIcon
                onClick={() => {
                  if (isChatOpen) {
                    // If open, close it
                    setIsChatOpen(false);
                  } else {
                    // If closed, open it and close sticky notes
                    setIsChatOpen(true);
                    setIsStickyNotesOpen(false);
                  }
                }}
                isActive={isChatOpen}
              />
            </>
          )}

          <ThemeToggle />
          <UserMenu />
        </div>
      </div>

      {isMounted && currentUser && (
        <>
          {/* Chat Sheet with Resizable Left Border */}
          <ResizableChatSheet open={isChatOpen} onOpenChange={setIsChatOpen}>
            <ChatWindow
              currentUserId={currentUser._id}
              onClose={() => setIsChatOpen(false)}
            />
          </ResizableChatSheet>

          {/* Sticky Notes Sheet with Resizable Left Border */}
          <ResizableStickyNotesSheet open={isStickyNotesOpen} onOpenChange={setIsStickyNotesOpen}>
            <StickyNotesWindow
              currentUserId={currentUser._id}
              onClose={() => setIsStickyNotesOpen(false)}
            />
          </ResizableStickyNotesSheet>

          {/* Floating Sticky Notes - Always visible if any notes have been dragged out */}
          <FloatingStickyNotes
            currentUserId={currentUser._id}
          />
        </>
      )}
    </header>
  );
}

export function Header(props: HeaderProps) {
  return (
    <Suspense fallback={<div className="h-16 border-b bg-background" />}>
      <HeaderContent {...props} />
    </Suspense>
  );
}
