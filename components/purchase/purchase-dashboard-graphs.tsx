"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";
import { format, subDays, isSameDay } from "date-fns";
import { Loader2, TrendingUp, AlertCircle, CheckCircle2, Clock } from "lucide-react";

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export function PurchaseDashboardGraphs() {
  const requestsQuery = useQuery(api.requests.getAllRequests);
  const purchaseOrdersQuery = useQuery(api.purchaseOrders.getAllPurchaseOrders);

  const isLoading = requestsQuery === undefined || purchaseOrdersQuery === undefined;
  const requests = requestsQuery || [];
  const purchaseOrders = purchaseOrdersQuery || [];

  // 1. Daily Action Trend (Last 7 Days)
  const dailyTrendData = useMemo(() => {
    if (!requests.length && !purchaseOrders.length) return [];
    
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const newRequests = requests.filter(r => isSameDay(new Date(r._creationTime), date)).length;
      const newPOs = purchaseOrders.filter(po => isSameDay(new Date(po._creationTime), date)).length;
      
      data.push({
        name: format(date, "MMM dd"),
        "New RFQs": newRequests,
        "POs Created": newPOs,
      });
    }
    return data;
  }, [requests, purchaseOrders]);

  // 2. Request Status Funnel
  const requestStatusData = useMemo(() => {
    if (!requests.length) return [];
    
    const pendingCC = requests.filter(r => r.status === "ready_for_cc").length;
    const pendingPO = requests.filter(r => r.status === "ready_for_po").length;
    const pendingDelivery = requests.filter(r => r.status === "ready_for_delivery").length;
    const outForDelivery = requests.filter(r => r.status === "delivery_stage" || r.status === "delivery_processing").length;
    const delivered = requests.filter(r => r.status === "delivered").length;
    
    return [
      { name: "Ready for CC", count: pendingCC, color: "#f59e0b" },
      { name: "Ready for PO", count: pendingPO, color: "#3b82f6" },
      { name: "Ready Delivery", count: pendingDelivery, color: "#8b5cf6" },
      { name: "Out for Delivery", count: outForDelivery, color: "#ec4899" },
      { name: "Delivered", count: delivered, color: "#10b981" },
    ];
  }, [requests]);

  // 3. Pending POs by Project (Using site name as proxy if project not populated directly)
  const pendingPOsBySite = useMemo(() => {
    if (!requests.length) return [];
    
    const readyForPO = requests.filter(r => r.status === "ready_for_po");
    const grouped = readyForPO.reduce((acc, req) => {
      const siteName = req.site?.name || "Unknown Site";
      acc[siteName] = (acc[siteName] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(grouped)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5); // Top 5
  }, [requests]);

  // Key Metrics
  const metrics = useMemo(() => {
    const today = new Date();
    const posToday = purchaseOrders.filter(po => isSameDay(new Date(po._creationTime), today)).length;
    
    // Calculate spend today (approximation from PO items)
    let spendToday = 0;
    purchaseOrders.filter(po => isSameDay(new Date(po._creationTime), today)).forEach(po => {
      spendToday += (po.totalAmount || 0);
    });

    return {
      pendingRFQs: requests.filter(r => r.status === "ready_for_cc").length,
      pendingPOs: requests.filter(r => r.status === "ready_for_po").length,
      activeDeliveries: purchaseOrders.filter(po => po.status === "ordered").length,
      spendToday: spendToday
    };
  }, [requests, purchaseOrders]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-card">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending CC / RFQs</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.pendingRFQs}</div>
            <p className="text-xs text-muted-foreground mt-1">Requires your action</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Purchase Orders</CardTitle>
            <AlertCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.pendingPOs}</div>
            <p className="text-xs text-muted-foreground mt-1">Ready to be created</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active POs</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.activeDeliveries}</div>
            <p className="text-xs text-muted-foreground mt-1">Currently in progress</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today's PO Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{metrics.spendToday.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">{purchaseOrders.filter(po => isSameDay(new Date(po._creationTime), new Date())).length} POs processed today</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-7">
        {/* Daily Action Trend */}
        <Card className="col-span-1 md:col-span-2 lg:col-span-4">
          <CardHeader>
            <CardTitle>Daily Processing Trend</CardTitle>
            <CardDescription>New requests vs Purchase Orders created (Last 7 Days)</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyTrendData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
                <Line type="monotone" dataKey="New RFQs" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="POs Created" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Funnel/Status Chart */}
        <Card className="col-span-1 md:col-span-2 lg:col-span-3">
          <CardHeader>
            <CardTitle>Pipeline Breakdown</CardTitle>
            <CardDescription>Current status of all active items</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={requestStatusData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e5e7eb" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6b7280' }} />
                <Tooltip 
                  cursor={{ fill: '#f3f4f6' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={24}>
                  {requestStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Sites by Pending POs */}
        <Card className="col-span-1 md:col-span-2 lg:col-span-7">
          <CardHeader>
            <CardTitle>Pending POs by Site</CardTitle>
            <CardDescription>Top sites awaiting purchase order generation</CardDescription>
          </CardHeader>
          <CardContent className="h-[250px] flex items-center justify-center">
            {pendingPOsBySite.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pendingPOsBySite}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pendingPOsBySite.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend 
                    layout="vertical" 
                    verticalAlign="middle" 
                    align="right"
                    iconType="circle"
                    wrapperStyle={{ fontSize: '11px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 mb-2 opacity-20" />
                <p className="text-sm">No pending POs for any site!</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
