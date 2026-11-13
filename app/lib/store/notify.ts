import { now } from "./clock";
import { newId, Tx } from "./db";

/** Inserts a notification inside an existing mutate(). */
export function notifyUser(tx: Tx, userId: string, type: string, payload: Record<string, unknown>, at = now()) {
  tx.insert("notifications", {
    id: newId("ntf"),
    userId,
    type,
    payload,
    readAt: null,
    createdAt: new Date(at).toISOString(),
  });
}

/** Notifies every admin, e.g. when something lands in a review queue. */
export function notifyAdmins(tx: Tx, type: string, payload: Record<string, unknown>, at = now()) {
  for (const profile of tx.all("profiles").filter((row) => row.role === "admin")) {
    notifyUser(tx, profile.id, type, payload, at);
  }
}

