"use client";

import Link from "next/link";
import BrandLockup from "../brand-lockup";
import { useMemo, useState } from "react";
import type {
  AdminWaitlistSignup,
  WaitlistPriority,
  WaitlistStatus,
} from "@/app/admin/types";
import {
  waitlistPriorities,
  waitlistStatuses,
} from "@/app/admin/types";

const statusLabels: Record<string, string> = {
  waiting: "Waiting",
  contacted: "Contacted",
  interviewed: "Interviewed",
  pilot: "Pilot",
  accepted: "Accepted",
  declined: "Declined",
};

const priorityLabels: Record<string, string> = {
  high: "High",
  normal: "Normal",
  low: "Low",
};

function humanize(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function metricWindow(leads: AdminWaitlistSignup[], days: number) {
  const threshold = Date.now() - days * 24 * 60 * 60 * 1000;
  return leads.filter((lead) => new Date(lead.createdAt).getTime() >= threshold)
    .length;
}

export default function AdminDashboard({
  initialSignups,
  founderName,
}: {
  initialSignups: AdminWaitlistSignup[];
  founderName: string;
}) {
  const [signups, setSignups] = useState(initialSignups);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [role, setRole] = useState("all");
  const [useCase, setUseCase] = useState("all");
  const [priority, setPriority] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const options = useMemo(
    () => ({
      roles: [...new Set(signups.map((lead) => lead.role))].sort(),
      useCases: [...new Set(signups.map((lead) => lead.useCase))].sort(),
      countries: new Set(signups.map((lead) => lead.country).filter(Boolean))
        .size,
    }),
    [signups],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return signups.filter((lead) => {
      const searchable = [
        lead.email,
        lead.company,
        lead.country,
        lead.source,
        lead.referral,
        lead.notes,
        ...lead.tags,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!needle || searchable.includes(needle)) &&
        (status === "all" || lead.status === status) &&
        (role === "all" || lead.role === role) &&
        (useCase === "all" || lead.useCase === useCase) &&
        (priority === "all" || lead.priority === priority)
      );
    });
  }, [priority, role, search, signups, status, useCase]);

  const activeConversations = signups.filter((lead) =>
    ["contacted", "interviewed"].includes(lead.status),
  ).length;
  const pilotProof = signups.filter((lead) =>
    ["pilot", "accepted"].includes(lead.status),
  ).length;

  function updateLocal(id: string, patch: Partial<AdminWaitlistSignup>) {
    setSignups((current) =>
      current.map((lead) => (lead.id === id ? { ...lead, ...patch } : lead)),
    );
  }

  async function persist(
    id: string,
    patch: Partial<
      Pick<
        AdminWaitlistSignup,
        "status" | "priority" | "notes" | "owner" | "tags"
      >
    >,
  ) {
    setSavingId(id);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/waitlist/" + id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await response.json();

      if (!response.ok) {
        setMessage("Could not save that change. Please retry.");
        return;
      }

      updateLocal(id, body.signup);
      setMessage("Saved to the founder pipeline.");
    } catch {
      setMessage("Connection interrupted. Your change was not saved.");
    } finally {
      setSavingId(null);
    }
  }

  async function signOut() {
    await fetch("/api/admin/session", { method: "DELETE" });
    window.location.assign("/admin/login");
  }

  function clearFilters() {
    setSearch("");
    setStatus("all");
    setRole("all");
    setUseCase("all");
    setPriority("all");
  }

  return (
    <main className="admin-page">
      <header className="admin-topbar">
        <Link className="brand" href="/">
          <BrandLockup />
        </Link>
        <div>
          <span className="admin-live">
            <i /> Private workspace
          </span>
          <span className="admin-founder">{founderName}</span>
          <Link className="admin-stellar-link" href="/admin/wallets">
            Users & Wallets
          </Link>
          <Link className="admin-stellar-link" href="/admin/providers">
            MCP Providers
          </Link>
          <Link className="admin-stellar-link" href="/admin/stellar">
            Stellar Lab
          </Link>
          <Link className="admin-stellar-link" href="/admin/integrations">
            Integration requests
          </Link>
          <button onClick={signOut}>Sign out</button>
        </div>
      </header>

      <div className="admin-main">
        <section className="admin-heading">
          <div>
            <p className="eyebrow">FOUNDER OPERATIONS</p>
            <h1>Turn early demand into proof.</h1>
            <p>
              Every signup is a conversation to qualify, a pilot to shape, or
              evidence that the agent commerce layer needs to exist.
            </p>
          </div>
          <div className="admin-heading-actions">
            <Link href="/admin/wallets">Validate users & wallets</Link>
            <Link href="/admin/providers">Manage MCP providers</Link>
            <Link href="/admin/stellar">Open Privy + Stellar Lab</Link>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/api/admin/waitlist/export">Export CSV</a>
            <small>YC-ready pipeline · Updated live</small>
          </div>
        </section>

        <section className="admin-kpis" aria-label="Waitlist metrics">
          <article>
            <span>Total demand</span>
            <strong>{signups.length}</strong>
            <small>Verified, non-test signups</small>
          </article>
          <article>
            <span>Last 7 days</span>
            <strong>{metricWindow(signups, 7)}</strong>
            <small>{metricWindow(signups, 1)} joined in 24 hours</small>
          </article>
          <article>
            <span>Conversations</span>
            <strong>{activeConversations}</strong>
            <small>Contacted or interviewed</small>
          </article>
          <article className="admin-kpi-accent">
            <span>Pilot proof</span>
            <strong>{pilotProof}</strong>
            <small>Pilot or accepted</small>
          </article>
        </section>

        <section className="admin-funnel" aria-label="Founder pipeline">
          <header>
            <div>
              <p className="eyebrow">CONVERSION PIPELINE</p>
              <h2>From interest to real-world validation</h2>
            </div>
            <span>{options.countries} countries represented</span>
          </header>
          <div>
            {waitlistStatuses.slice(0, 5).map((stage, index) => {
              const count = signups.filter(
                (lead) => lead.status === stage,
              ).length;
              return (
                <button
                  key={stage}
                  className={status === stage ? "active" : ""}
                  onClick={() => setStatus(status === stage ? "all" : stage)}
                >
                  <b>0{index + 1}</b>
                  <strong>{count}</strong>
                  <span>{statusLabels[stage]}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="admin-workspace">
          <header className="admin-workspace-head">
            <div>
              <p className="eyebrow">WAITLIST CRM</p>
              <h2>People and organizations</h2>
            </div>
            <p>
              <strong>{filtered.length}</strong> of {signups.length} visible
            </p>
          </header>

          <div className="admin-filters">
            <label className="admin-search">
              <span>Search</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Email, company, country, tag..."
              />
            </label>
            <label>
              <span>Status</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="all">All statuses</option>
                {waitlistStatuses.map((item) => (
                  <option key={item} value={item}>
                    {statusLabels[item]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Role</span>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value)}
              >
                <option value="all">All roles</option>
                {options.roles.map((item) => (
                  <option key={item} value={item}>
                    {humanize(item)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Use case</span>
              <select
                value={useCase}
                onChange={(event) => setUseCase(event.target.value)}
              >
                <option value="all">All use cases</option>
                {options.useCases.map((item) => (
                  <option key={item} value={item}>
                    {humanize(item)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Priority</span>
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              >
                <option value="all">All priorities</option>
                {waitlistPriorities.map((item) => (
                  <option key={item} value={item}>
                    {priorityLabels[item]}
                  </option>
                ))}
              </select>
            </label>
            <button className="admin-clear" onClick={clearFilters}>
              Clear
            </button>
          </div>

          {message && (
            <p className="admin-save-message" role="status">
              {message}
            </p>
          )}

          <div className="admin-lead-list">
            <div className="admin-lead-head">
              <span>Person / company</span>
              <span>Demand signal</span>
              <span>Joined</span>
              <span>Status</span>
              <span>Priority</span>
              <span />
            </div>

            {filtered.length === 0 && (
              <div className="admin-empty">
                <strong>No leads match those filters.</strong>
                <button onClick={clearFilters}>Show the full waitlist</button>
              </div>
            )}

            {filtered.map((lead) => {
              const isOpen = openId === lead.id;
              return (
                <article className="admin-lead" key={lead.id}>
                  <div className="admin-lead-row">
                    <div className="admin-person">
                      <span>
                        {(lead.company || lead.email).charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <strong>{lead.company || lead.email.split("@")[0]}</strong>
                        <a href={"mailto:" + lead.email}>{lead.email}</a>
                        <small>
                          {lead.country || "Country not provided"} ·{" "}
                          {humanize(lead.role)}
                        </small>
                      </div>
                    </div>
                    <div className="admin-signal">
                      <strong>{humanize(lead.useCase)}</strong>
                      <small>
                        Source: {humanize(lead.source)}
                        {lead.referral ? " · " + lead.referral : ""}
                      </small>
                    </div>
                    <time dateTime={lead.createdAt}>
                      {formatDate(lead.createdAt)}
                    </time>
                    <select
                      className={"admin-status " + lead.status}
                      aria-label={"Status for " + lead.email}
                      value={lead.status}
                      disabled={savingId === lead.id}
                      onChange={(event) => {
                        const next = event.target.value as WaitlistStatus;
                        updateLocal(lead.id, { status: next });
                        persist(lead.id, { status: next });
                      }}
                    >
                      {waitlistStatuses.map((item) => (
                        <option key={item} value={item}>
                          {statusLabels[item]}
                        </option>
                      ))}
                    </select>
                    <select
                      className={"admin-priority " + lead.priority}
                      aria-label={"Priority for " + lead.email}
                      value={lead.priority}
                      disabled={savingId === lead.id}
                      onChange={(event) => {
                        const next = event.target.value as WaitlistPriority;
                        updateLocal(lead.id, { priority: next });
                        persist(lead.id, { priority: next });
                      }}
                    >
                      {waitlistPriorities.map((item) => (
                        <option key={item} value={item}>
                          {priorityLabels[item]}
                        </option>
                      ))}
                    </select>
                    <button
                      className="admin-open"
                      onClick={() => setOpenId(isOpen ? null : lead.id)}
                      aria-expanded={isOpen}
                    >
                      {isOpen ? "Close" : "Review"}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="admin-lead-detail">
                      <div className="admin-detail-facts">
                        <dl>
                          <div>
                            <dt>Company</dt>
                            <dd>{lead.company || "Not provided"}</dd>
                          </div>
                          <div>
                            <dt>Country</dt>
                            <dd>{lead.country || "Not provided"}</dd>
                          </div>
                          <div>
                            <dt>Referral</dt>
                            <dd>{lead.referral || "Direct signup"}</dd>
                          </div>
                          <div>
                            <dt>Last contact</dt>
                            <dd>
                              {lead.lastContactedAt
                                ? formatDate(lead.lastContactedAt)
                                : "Not contacted yet"}
                            </dd>
                          </div>
                        </dl>
                        <a href={"mailto:" + lead.email}>
                          Start email conversation ↗
                        </a>
                      </div>

                      <div className="admin-detail-editor">
                        <label>
                          <span>Internal notes</span>
                          <textarea
                            value={lead.notes ?? ""}
                            placeholder="What matters about this lead? Interview context, pain, objections, next step..."
                            onChange={(event) =>
                              updateLocal(lead.id, {
                                notes: event.target.value,
                              })
                            }
                          />
                        </label>
                        <div>
                          <label>
                            <span>Owner</span>
                            <input
                              value={lead.owner ?? ""}
                              placeholder="Founder"
                              onChange={(event) =>
                                updateLocal(lead.id, {
                                  owner: event.target.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            <span>Tags</span>
                            <input
                              value={lead.tags.join(", ")}
                              placeholder="travel, LATAM, merchant"
                              onChange={(event) =>
                                updateLocal(lead.id, {
                                  tags: event.target.value
                                    .split(",")
                                    .map((tag) => tag.trim())
                                    .filter(Boolean)
                                    .slice(0, 10),
                                })
                              }
                            />
                          </label>
                        </div>
                        <button
                          disabled={savingId === lead.id}
                          onClick={() =>
                            persist(lead.id, {
                              notes: lead.notes,
                              owner: lead.owner,
                              tags: lead.tags,
                            })
                          }
                        >
                          {savingId === lead.id
                            ? "Saving..."
                            : "Save founder notes"}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}






