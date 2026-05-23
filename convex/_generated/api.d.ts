/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as chat from "../chat.js";
import type * as costComparisons from "../costComparisons.js";
import type * as cron from "../cron.js";
import type * as dailyReports from "../dailyReports.js";
import type * as dashboard from "../dashboard.js";
import type * as deliveries from "../deliveries.js";
import type * as grn from "../grn.js";
import type * as http from "../http.js";
import type * as inventory from "../inventory.js";
import type * as maintenance from "../maintenance.js";
import type * as migrations from "../migrations.js";
import type * as notes from "../notes.js";
import type * as notifications from "../notifications.js";
import type * as presence from "../presence.js";
import type * as projectItems from "../projectItems.js";
import type * as projects from "../projects.js";
import type * as purchaseOrders from "../purchaseOrders.js";
import type * as requests from "../requests.js";
import type * as setupUser from "../setupUser.js";
import type * as sites from "../sites.js";
import type * as stickyNotes from "../stickyNotes.js";
import type * as testEnv from "../testEnv.js";
import type * as users from "../users.js";
import type * as vendors from "../vendors.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  chat: typeof chat;
  costComparisons: typeof costComparisons;
  cron: typeof cron;
  dailyReports: typeof dailyReports;
  dashboard: typeof dashboard;
  deliveries: typeof deliveries;
  grn: typeof grn;
  http: typeof http;
  inventory: typeof inventory;
  maintenance: typeof maintenance;
  migrations: typeof migrations;
  notes: typeof notes;
  notifications: typeof notifications;
  presence: typeof presence;
  projectItems: typeof projectItems;
  projects: typeof projects;
  purchaseOrders: typeof purchaseOrders;
  requests: typeof requests;
  setupUser: typeof setupUser;
  sites: typeof sites;
  stickyNotes: typeof stickyNotes;
  testEnv: typeof testEnv;
  users: typeof users;
  vendors: typeof vendors;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
