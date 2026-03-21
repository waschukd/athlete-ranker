import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Search, Edit2, Trash2, X, Check } from "lucide-react";
import { LoadingState } from "./LoadingState";
import { CreateUserModal } from "./CreateUserModal";

const roleColors = {
  super_admin: { bg: "rgba(248,113,113,0.12)", text: "var(--gm-red)" },
  service_provider_admin: { bg: "var(--gm-purple-soft)", text: "var(--gm-purple)" },
  service_provider_evaluator: { bg: "var(--gm-purple-soft)", text: "var(--gm-purple)" },
  association_admin: { bg: "var(--gm-blue-soft)", text: "var(--gm-blue)" },
  age_director: { bg: "var(--gm-blue-soft)", text: "var(--gm-blue)" },
  association_evaluator: { bg: "var(--gm-green-soft)", text: "var(--gm-green)" },
  volunteer: { bg: "var(--gm-amber-soft)", text: "var(--gm-amber)" },
};

function RoleBadge({ role }) {
  const c = roleColors[role] || { bg: "var(--gm-surface3)", text: "var(--gm-muted)" };
  return (
    <span className="gm-badge" style={{ background: c.bg, color: c.text }}>
      {role?.replace(/_/g, " ")}
    </span>
  );
}

export function UsersTab() {
  const [roleFilter, setRoleFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["god-mode-users", roleFilter],
    queryFn: async () => {
      const url = roleFilter ? `/api/admin/god-mode/users?role=${roleFilter}` : "/api/admin/god-mode/users";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId) => {
      const res = await fetch(`/api/admin/god-mode/users?id=${userId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["god-mode-users"]);
      setDeleteConfirm(null);
    },
  });

  const users = (data?.users || []).filter(u =>
    !search || u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())
  );
  const stats = data?.stats || {};

  const statItems = [
    { label: "Total", value: stats.total || 0, color: "var(--gm-text)" },
    { label: "Super Admins", value: stats.super_admins || 0, color: "var(--gm-red)" },
    { label: "Providers", value: stats.service_providers || 0, color: "var(--gm-purple)" },
    { label: "Associations", value: stats.associations || 0, color: "var(--gm-blue)" },
    { label: "Volunteers", value: stats.volunteers || 0, color: "var(--gm-amber)" },
    { label: "New This Week", value: stats.new_this_week || 0, color: "var(--gm-green)" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
        {statItems.map(({ label, value, color }) => (
          <div key={label} className="gm-card" style={{ padding: "14px 16px" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "'DM Mono', monospace" }}>{value}</div>
            <div style={{ fontSize: 11, color: "var(--gm-muted)", marginTop: 3, fontWeight: 500 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--gm-dim)" }} />
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="gm-input"
            style={{ paddingLeft: 32 }}
          />
        </div>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="gm-input" style={{ width: "auto", minWidth: 160 }}>
          <option value="">All Roles</option>
          <option value="super_admin">Super Admin</option>
          <option value="service_provider_admin">SP Admin</option>
          <option value="service_provider_evaluator">SP Evaluator</option>
          <option value="association_admin">Assoc. Admin</option>
          <option value="age_director">Age Director</option>
          <option value="association_evaluator">Assoc. Evaluator</option>
          <option value="volunteer">Volunteer</option>
        </select>
        <button className="gm-btn-primary" onClick={() => setShowCreateModal(true)}>
          <UserPlus size={14} />
          Create User
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <LoadingState text="Loading users..." />
      ) : (
        <div className="gm-card" style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="gm-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Orgs</th>
                  <th>Assignments</th>
                  <th>Joined</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: "center", padding: "32px", color: "var(--gm-dim)" }}>No users found</td></tr>
                ) : users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div style={{ fontWeight: 500, color: "var(--gm-text)" }}>{user.name}</div>
                      <div style={{ fontSize: 11, color: "var(--gm-muted)", marginTop: 2, fontFamily: "'DM Mono', monospace" }}>{user.email}</div>
                    </td>
                    <td><RoleBadge role={user.role} /></td>
                    <td style={{ color: "var(--gm-muted)" }}>{user.organization_count || 0}</td>
                    <td>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gm-text)", fontFamily: "'DM Mono', monospace" }}>{user.upcoming_assignments || 0}</div>
                      <div style={{ fontSize: 11, color: "var(--gm-dim)" }}>{user.total_assignments || 0} total</div>
                    </td>
                    <td style={{ color: "var(--gm-muted)", fontSize: 12 }}>{new Date(user.created_at).toLocaleDateString()}</td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        {deleteConfirm === user.id ? (
                          <>
                            <button
                              onClick={() => deleteMutation.mutate(user.id)}
                              disabled={deleteMutation.isPending}
                              style={{ padding: "5px 10px", background: "var(--gm-red-soft)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 6, color: "var(--gm-red)", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}
                            >
                              <Check size={12} /> Confirm
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              style={{ padding: "5px 8px", background: "var(--gm-surface2)", border: "1px solid var(--gm-border)", borderRadius: 6, color: "var(--gm-muted)", cursor: "pointer" }}
                            >
                              <X size={12} />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(user.id)}
                            style={{ padding: "5px 8px", background: "transparent", border: "1px solid var(--gm-border)", borderRadius: 6, color: "var(--gm-dim)", cursor: "pointer", transition: "all 0.15s" }}
                            onMouseEnter={e => { e.currentTarget.style.background = "var(--gm-red-soft)"; e.currentTarget.style.color = "var(--gm-red)"; e.currentTarget.style.borderColor = "rgba(248,113,113,0.3)"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--gm-dim)"; e.currentTarget.style.borderColor = "var(--gm-border)"; }}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreateModal && <CreateUserModal onClose={() => setShowCreateModal(false)} />}
    </div>
  );
}
