"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import {
    Calendar as CalendarIcon,
    Filter,
    Search,
    User,
    FileText,
    CheckCircle,
    Package,
    MessageSquare,
    Loader2
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function ManagerDailyReportsView() {
    const [selectedUserId, setSelectedUserId] = useState<string>("all");
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

    // Fetch all users for the filter dropdown
    const users = useQuery(api.users.getAllUsers, {});

    // Fetch reports based on filters
    const filterUserId = selectedUserId !== "all" ? (selectedUserId as Id<"users">) : undefined;
    const filterDate = selectedDate ? format(selectedDate, "yyyy-MM-dd") : undefined;

    const reports = useQuery(api.dailyReports.getAllReports, {
        userId: filterUserId,
        date: filterDate
    });

    const isLoading = reports === undefined || users === undefined;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Team Daily Reports</h1>
                    <p className="text-muted-foreground mt-1">Review activity logs and notes submitted by the team.</p>
                </div>
            </div>

            <Card className="bg-card/40 backdrop-blur-sm border-border/50">
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Filter className="h-4 w-4" />
                        Filters
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="w-full sm:w-[250px]">
                            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select Team Member" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Team Members</SelectItem>
                                    {users?.map(user => (
                                        <SelectItem key={user._id} value={user._id}>
                                            {user.fullName} ({user.role})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="w-full sm:w-[250px]">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className={cn(
                                            "w-full justify-start text-left font-normal",
                                            !selectedDate && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {selectedDate ? format(selectedDate, "PPP") : <span>Filter by date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={selectedDate}
                                        onSelect={setSelectedDate}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                        {(selectedUserId !== "all" || selectedDate) && (
                            <Button 
                                variant="ghost" 
                                onClick={() => {
                                    setSelectedUserId("all");
                                    setSelectedDate(undefined);
                                }}
                                className="text-muted-foreground hover:text-foreground"
                            >
                                Clear Filters
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            <div className="space-y-4">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                        <Loader2 className="h-8 w-8 animate-spin mb-4" />
                        <p>Loading reports...</p>
                    </div>
                ) : reports?.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 border rounded-xl border-dashed bg-card/10">
                        <FileText className="h-10 w-10 text-muted-foreground mb-4 opacity-20" />
                        <p className="text-lg font-medium text-muted-foreground">No reports found.</p>
                        <p className="text-sm text-muted-foreground mt-1">Try adjusting your filters.</p>
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <AnimatePresence>
                            {reports?.map((report: any, idx) => (
                                <motion.div
                                    key={report._id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                >
                                    <Card className="h-full hover:shadow-md transition-shadow group flex flex-col">
                                        <CardHeader className="pb-3">
                                            <div className="flex justify-between items-start">
                                                <div className="flex items-center gap-3">
                                                    <Avatar className="h-10 w-10 ring-2 ring-transparent group-hover:ring-primary/20 transition-all">
                                                        <AvatarFallback className="bg-primary/10 text-primary font-bold">
                                                            {report.user?.fullName?.[0] || "?"}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div>
                                                        <CardTitle className="text-base">{report.user?.fullName || "Unknown User"}</CardTitle>
                                                        <CardDescription className="text-xs">
                                                            {format(new Date(report.createdAt), "MMM d, yyyy 'at' h:mm a")}
                                                        </CardDescription>
                                                    </div>
                                                </div>
                                                <Badge variant="outline" className="capitalize text-[10px]">
                                                    {report.user?.role?.replace("_", " ") || "Unknown"}
                                                </Badge>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="flex-1 flex flex-col gap-4">
                                            <div className="flex gap-4">
                                                <div className="flex-1 bg-muted/40 rounded-lg p-3 flex flex-col items-center justify-center gap-1 border border-border/50">
                                                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                                                    <span className="text-xs text-muted-foreground text-center">Requests</span>
                                                    <span className="font-bold text-foreground text-lg">{report.requestsProcessed}</span>
                                                </div>
                                                <div className="flex-1 bg-muted/40 rounded-lg p-3 flex flex-col items-center justify-center gap-1 border border-border/50">
                                                    <Package className="h-4 w-4 text-indigo-500" />
                                                    <span className="text-xs text-muted-foreground text-center">POs</span>
                                                    <span className="font-bold text-foreground text-lg">{report.posProcessed}</span>
                                                </div>
                                            </div>
                                            
                                            {report.additionalNotes && (
                                                <div className="mt-2 text-sm bg-primary/5 p-3 rounded-lg border border-primary/10 flex-1">
                                                    <div className="flex items-center gap-2 mb-1.5 text-primary">
                                                        <MessageSquare className="h-3.5 w-3.5" />
                                                        <span className="font-semibold text-xs uppercase tracking-wider">Notes</span>
                                                    </div>
                                                    <p className="text-muted-foreground whitespace-pre-wrap">{report.additionalNotes}</p>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </div>
    );
}
