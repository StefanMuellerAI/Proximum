"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  UserPlus,
  Loader2,
  Trash2,
  Ban,
  CheckCircle2,
  ShieldCheck,
  Shield,
  Mail,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AdminUser } from "@/app/api/admin/users/route";

const inputCls =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function AdminClient({ selfId }: { selfId: string }) {
  const [users, setUsers] = React.useState<AdminUser[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [email, setEmail] = React.useState("");
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [password, setPassword] = React.useState("");

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden.");
      setUsers(data.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Laden.");
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          password: password || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Anlegen fehlgeschlagen.");
      setInfo(
        data.mode === "invite"
          ? `Einladung an ${email} versendet.`
          : `User ${email} angelegt.`,
      );
      setEmail("");
      setFirstName("");
      setLastName("");
      setPassword("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Anlegen fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function patchUser(id: string, action: string) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Aktion fehlgeschlagen.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aktion fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser(id: string, mail: string | null) {
    if (!window.confirm(`User ${mail ?? id} endgültig löschen?`)) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Löschen fehlgeschlagen.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Löschen fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen pb-16">
      <header className="sticky top-0 z-10 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/portfolio"
              aria-label="Zurück"
              className="flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-accent"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <div className="font-semibold leading-tight">Admin – Userverwaltung</div>
              <div className="text-xs text-muted-foreground">
                User anlegen, einladen, sperren und löschen (Clerk)
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={busy}>
            <RefreshCw className="h-4 w-4" />
            Aktualisieren
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-6 pt-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Neuen User anlegen
            </CardTitle>
            <CardDescription>
              Mit Passwort wird der User direkt angelegt; ohne Passwort erhält er
              eine E-Mail-Einladung und setzt sein Passwort selbst.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={createUser}
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
            >
              <input
                className={inputCls}
                type="email"
                required
                placeholder="E-Mail *"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                className={inputCls}
                placeholder="Vorname"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
              <input
                className={inputCls}
                placeholder="Nachname"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
              <input
                className={inputCls}
                type="password"
                placeholder="Passwort (optional)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <Button type="submit" disabled={busy || !email}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : password ? (
                  <UserPlus className="h-4 w-4" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                {password ? "Anlegen" : "Einladen"}
              </Button>
            </form>
            {error && (
              <p className="mt-3 text-sm text-destructive">{error}</p>
            )}
            {info && (
              <p className="mt-3 text-sm text-[var(--success)]">{info}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alle User</CardTitle>
            <CardDescription>
              Öffentliche Registrierung ist deaktiviert – nur hier angelegte oder
              eingeladene User können sich anmelden.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {users === null ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Lade User…
              </div>
            ) : users.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">Keine User gefunden.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3">Name</th>
                      <th className="py-2 pr-3">E-Mail</th>
                      <th className="py-2 pr-3">Rolle</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Letzter Login</th>
                      <th className="py-2 text-right">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b last:border-0">
                        <td className="py-2.5 pr-3 font-medium">
                          {[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}
                          {u.id === selfId && (
                            <span className="ml-1.5 text-xs text-muted-foreground">(Sie)</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3">{u.email ?? "—"}</td>
                        <td className="py-2.5 pr-3">
                          {u.role === "admin" ? (
                            <Badge variant="default">Admin</Badge>
                          ) : (
                            <Badge variant="secondary">User</Badge>
                          )}
                        </td>
                        <td className="py-2.5 pr-3">
                          {u.banned ? (
                            <Badge variant="danger">gesperrt</Badge>
                          ) : (
                            <Badge variant="success">aktiv</Badge>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-muted-foreground">
                          {u.lastSignInAt
                            ? new Date(u.lastSignInAt).toLocaleDateString("de-DE")
                            : "—"}
                        </td>
                        <td className="py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            {u.role === "admin" ? (
                              <IconAction
                                title="Admin-Rolle entziehen"
                                disabled={busy || u.id === selfId}
                                onClick={() => patchUser(u.id, "removeAdmin")}
                              >
                                <Shield className="h-4 w-4" />
                              </IconAction>
                            ) : (
                              <IconAction
                                title="Zum Admin machen"
                                disabled={busy}
                                onClick={() => patchUser(u.id, "makeAdmin")}
                              >
                                <ShieldCheck className="h-4 w-4" />
                              </IconAction>
                            )}
                            {u.banned ? (
                              <IconAction
                                title="Entsperren"
                                disabled={busy}
                                onClick={() => patchUser(u.id, "unban")}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </IconAction>
                            ) : (
                              <IconAction
                                title="Sperren"
                                disabled={busy || u.id === selfId}
                                onClick={() => patchUser(u.id, "ban")}
                              >
                                <Ban className="h-4 w-4" />
                              </IconAction>
                            )}
                            <IconAction
                              title="Löschen"
                              destructive
                              disabled={busy || u.id === selfId}
                              onClick={() => deleteUser(u.id, u.email)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </IconAction>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function IconAction({
  title,
  onClick,
  disabled,
  destructive,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-40 ${
        destructive
          ? "text-destructive hover:bg-destructive/10"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
