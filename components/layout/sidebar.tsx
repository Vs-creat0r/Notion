"use client";

/**
 * Sidebar Navigation Component
 * 
 * Role-based navigation menu for desktop with collapsible functionality.
 */

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Role, ROLES, ROLE_LABELS } from "@/lib/auth/roles";
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  Store,
  Warehouse,
  CheckCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Building2,
  ScrollText,
  Package,
  Download,
  FolderKanban,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { usePWA } from "@/hooks/use-pwa";
import { useSidebar } from "./sidebar-provider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NavigationItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[]; // Which roles can see this item
}

const navigationItems: NavigationItem[] = [
  // Site Engineer - Logical sequence: Dashboard → Requests → Inventory
  {
    label: "Dashboard",
    href: "/dashboard/site",
    icon: LayoutDashboard,
    roles: [ROLES.SITE_ENGINEER],
  },
  {
    label: "My Requests",
    href: "/dashboard/site/requests",
    icon: ClipboardList,
    roles: [ROLES.SITE_ENGINEER],
  },
  {
    label: "Inventory",
    href: "/dashboard/inventory",
    icon: Warehouse,
    roles: [ROLES.SITE_ENGINEER],
  },

  // Manager - Logical sequence: Dashboard → Requests → Inventory → Vendors → GRN → Users → Sites
  {
    label: "Dashboard",
    href: "/dashboard/manager",
    icon: LayoutDashboard,
    roles: [ROLES.MANAGER],
  },
  {
    label: "All Requests",
    href: "/dashboard/manager/requests",
    icon: ClipboardList,
    roles: [ROLES.MANAGER],
  },
  {
    label: "Projects (Site)",
    href: "/dashboard/project",
    icon: FolderKanban,
    roles: [ROLES.MANAGER],
  },
  {
    label: "Inventory",
    href: "/dashboard/inventory",
    icon: Warehouse,
    roles: [ROLES.MANAGER],
  },
  {
    label: "Vendors",
    href: "/dashboard/vendors",
    icon: Store,
    roles: [ROLES.MANAGER],
  },
  {
    label: "GRN",
    href: "/dashboard/grn",
    icon: Package,
    roles: [ROLES.MANAGER],
  },
  {
    label: "Locations",
    href: "/dashboard/locations",
    icon: Building2,
    roles: [ROLES.MANAGER],
  },
  {
    label: "User Management",
    href: "/dashboard/manager/users",
    icon: Users,
    roles: [ROLES.MANAGER],
  },
  {
    label: "Daily Reports",
    href: "/dashboard/manager/reports",
    icon: ClipboardList,
    roles: [ROLES.MANAGER],
  },

  {
    label: "Logs",
    href: "/dashboard/grn-logs",
    icon: ScrollText,
    roles: [ROLES.MANAGER],
  },

  // Purchase Officer - Logical sequence: Dashboard → Requests → Inventory → Vendors → GRN
  {
    label: "Dashboard",
    href: "/dashboard/purchase",
    icon: LayoutDashboard,
    roles: [ROLES.PURCHASE_OFFICER],
  },
  {
    label: "Requests",
    href: "/dashboard/purchase/requests",
    icon: CheckCircle,
    roles: [ROLES.PURCHASE_OFFICER],
  },
  {
    label: "Projects (Site)",
    href: "/dashboard/project",
    icon: FolderKanban,
    roles: [ROLES.PURCHASE_OFFICER],
  },
  {
    label: "Inventory",
    href: "/dashboard/inventory",
    icon: Warehouse,
    roles: [ROLES.PURCHASE_OFFICER],
  },
  {
    label: "Vendors",
    href: "/dashboard/vendors",
    icon: Store,
    roles: [ROLES.PURCHASE_OFFICER],
  },
  {
    label: "GRN",
    href: "/dashboard/grn",
    icon: Package,
    roles: [ROLES.PURCHASE_OFFICER],
  },
  {
    label: "Locations",
    href: "/dashboard/locations",
    icon: Building2,
    roles: [ROLES.PURCHASE_OFFICER],
  },
  {
    label: "Logs",
    href: "/dashboard/grn-logs",
    icon: ScrollText,
    roles: [ROLES.PURCHASE_OFFICER],
  },
];

interface SidebarProps {
  userRole: Role;
}

export function Sidebar({ userRole }: SidebarProps) {
  const pathname = usePathname();
  const { isCollapsed, toggle, isMounted } = useSidebar();
  const [logoError, setLogoError] = useState(false);
  const { shouldShowInstall, installState, installPWA } = usePWA();

  // Filter navigation items based on user role
  const filteredItems = navigationItems.filter((item) =>
    item.roles.includes(userRole)
  );

  return (
    <aside
      className={cn(
        "hidden md:flex md:flex-col md:border-r md:bg-card/50 md:backdrop-blur-sm transition-all duration-300 ease-in-out fixed left-0 top-0 h-screen z-30 shadow-sm",
        // Only apply width after mount to prevent hydration mismatch
        isMounted ? (isCollapsed ? "md:w-16" : "md:w-64") : "md:w-64"
      )}
    >
      <TooltipProvider delayDuration={0}>
        <div className="flex flex-col h-full">
          {/* Logo Section - Top */}
          <header className={cn(
            "transition-all duration-300 border-b shrink-0",
            // Only apply collapsed styles after mount to prevent hydration mismatch
            isMounted && isCollapsed ? "px-3 py-4" : "px-5 py-5"
          )}>
            {isMounted && isCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggle}
                    className="logo-toggle-btn relative flex items-center justify-center h-10 w-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 hover:from-primary/30 hover:to-primary/20 transition-all hover:scale-105 active:scale-95 cursor-ew-resize group/logo"
                    aria-label="Expand sidebar"
                  >
                    {/* Notion Icon - hidden on hover */}
                    <div className="group-hover/logo:opacity-0 group-hover/logo:scale-0 transition-all duration-200">
                      {logoError ? (
                        <span className="text-lg font-bold text-primary">N</span>
                      ) : (
                        <Image
                          src="/images/logos/Notion_Favicon-removebg-preview.png"
                          alt="Notion Logo"
                          width={28}
                          height={28}
                          className="object-contain"
                          onError={() => setLogoError(true)}
                        />
                      )}
                    </div>
                    {/* Expand Icon - shown on hover */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/logo:opacity-100 scale-0 group-hover/logo:scale-100 transition-all duration-200">
                      <PanelLeftOpen className="h-4 w-4 text-primary font-bold stroke-[2.5]" aria-hidden="true" />
                    </div>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="font-medium">
                  Expand sidebar
                </TooltipContent>
              </Tooltip>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <Link
                  href="/dashboard"
                  className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer hover:opacity-80 transition-opacity"
                >
                  <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shrink-0 overflow-hidden p-2">
                    {logoError ? (
                      <span className="text-2xl font-bold text-primary">N</span>
                    ) : (
                      <Image
                        src="/images/logos/Notion_Favicon-removebg-preview.png"
                        alt="Notion Logo"
                        width={40}
                        height={40}
                        className="object-contain"
                        onError={() => setLogoError(true)}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex flex-col gap-1">
                    <div className="h-12 relative flex items-center overflow-hidden -my-1.5">
                      {logoError ? (
                        <h1 className="text-xl font-bold truncate">NOTION</h1>
                      ) : (
                        <Image
                          src="/images/logos/Notion_Logo-removebg-preview.png"
                          alt="Notion"
                          width={180}
                          height={48}
                          className="object-contain w-full h-[120%] object-center"
                          onError={() => setLogoError(true)}
                        />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {ROLE_LABELS[userRole]}
                    </p>
                  </div>
                </Link>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={toggle}
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-accent-foreground hover:bg-accent hover:scale-105 active:scale-95 cursor-ew-resize group/collapse"
                      aria-label="Collapse sidebar"
                    >
                      <PanelLeftClose className="h-4 w-4 font-bold stroke-[2.5] text-current transition-transform group-hover/collapse:scale-110" aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="font-medium">
                    Collapse sidebar
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </header>

          {/* Navigation Section */}
          <div className="flex-1 overflow-y-auto">

            <nav className={cn(
              "transition-all duration-300",
              isCollapsed ? "px-3 py-3 space-y-2" : "px-4 py-4 space-y-1.5"
            )}>
              {filteredItems.map((item) => {
                // Dashboard items should only be active on exact match
                const isDashboard = item.label === "Dashboard";
                const isActive = isDashboard
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;

                if (isCollapsed) {
                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>
                        <Link
                          href={item.href}
                          className={cn(
                            "flex items-center justify-center h-10 w-10 rounded-lg text-sm font-medium transition-all cursor-pointer",
                            "hover:scale-105 active:scale-95",
                            isActive
                              ? "bg-primary text-primary-foreground shadow-md"
                              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground hover:shadow-sm"
                          )}
                          aria-label={item.label}
                          aria-current={isActive ? "page" : undefined}
                        >
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="font-medium">
                        {item.label}
                      </TooltipContent>
                    </Tooltip>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer",
                      "hover:translate-x-1 active:scale-[0.98]",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground hover:shadow-sm"
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Footer */}
        {!isCollapsed && (
          <footer className="p-4 border-t shrink-0 space-y-3">
            {shouldShowInstall && (
              <Button
                onClick={installPWA}
                disabled={installState === 'installing' || installState === 'prompting'}
                className="w-full relative overflow-hidden bg-primary/10 text-primary hover:bg-primary/20"
                variant="ghost"
              >
                {/* Progress Background */}
                <div
                  className="absolute left-0 top-0 bottom-0 bg-primary/20 transition-all duration-1000 ease-in-out"
                  style={{
                    width: installState === 'idle' ? '0%' :
                      installState === 'prompting' ? '30%' :
                        installState === 'installing' ? '85%' : '100%'
                  }}
                />
                <div className="relative flex items-center justify-center gap-2 w-full">
                  <Download className="h-4 w-4" />
                  {installState === 'idle' && 'Install Notion App'}
                  {installState === 'prompting' && 'Confirming...'}
                  {installState === 'installing' && 'Installing...'}
                </div>
              </Button>
            )}
            <p className="text-xs text-muted-foreground text-center">
              v1.0.0 © {new Date().getFullYear()}
            </p>
          </footer>
        )}
      </TooltipProvider>
    </aside>
  );
}

